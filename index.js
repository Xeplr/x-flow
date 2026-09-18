var path = require('path');
var createApp = require('@xeplr/base-apis/express');
var { up } = require('@xeplr/db').sqlMigrator;
var { resolveConfig, registerApplication, getApplicationId, migrationsFor, ensureDatabaseFor } = require('@xeplr/db');
var buildWorkflowRouter = require('./lib/router');
var buildFlowsRouter = require('./lib/flowsRouter');
var connectDb = require('./lib/db');
var actionCatalog = require('./lib/actionCatalog');
var envExposed = require('./lib/envExposed');
var xcfgSetup = require('./db/xcfgSetup');

/**
 * Register workflow into a host app, or stand up its own.
 *
 *   // Embedded — mounted into a caller's existing Express app:
 *   await registerWorkflow({
 *     app: myExpressApp,
 *     mountPath: '/workflow',
 *     db: { name: 'xeplr_bi_workflow', connection: myDbConnectionString },
 *     mtMembershipGate: myAlreadyBuiltGate    // omit → every route ungated
 *   });
 *
 *   // Standalone — this package creates and starts its own app via
 *   // @xeplr/base-apis' createApp (the only thing that ever builds an app
 *   // here, embedded or standalone). See orchestration/standalone.js, which
 *   // is exactly this call with its config sourced from development.env.
 *   await registerWorkflow({ db: {...}, port: 19122, middleware: [...] });
 *
 * @param {object} config
 * @param {import('express').Express} [config.app] - an existing Express app
 *   to mount onto. Omit WITH config.port to have this package create and
 *   start its own; omit BOTH to get the router back and mount it yourself.
 *
 *   That third mode is not a convenience — for some hosts it is the only
 *   thing that works. @xeplr/base-apis' createApp registers a catch-all 404
 *   AFTER the routes it was given, so anything app.use()'d afterwards sits
 *   behind it and is never reached: the mount succeeds, and every path under
 *   it answers 404. A host built that way has to hand the router in with its
 *   own route map rather than bolt it on after.
 * @param {object} config.db - { name, connection, mts? } — see lib/db.js.
 *   Always required: workflow's own domain data is always its own
 *   responsibility, however it's mounted.
 * @param {string} [config.applicationId] - the PRODUCT mounting this
 *   ('xeplr-bi', 'xeplr-erp'; 'xeplr-workflow' standalone). OPTIONAL: a host
 *   normally calls registerApplication() once at its own startup and every
 *   sub-product it mounts inherits that, so passing this again is only for a
 *   host that prefers to be explicit.
 *
 *   It does NOT separate workflow's own data — config.db does that. Each host
 *   gives workflow its own database (xeplr_bi_workflow, xeplr_erp_workflow),
 *   which is the whole boundary, and is why none of these tables carries an
 *   applicationId column.
 *
 *   What it IS for: xeplr_configs, the one store that cannot be split per
 *   consumer because every app opens it. This mount writes movement metadata
 *   there, and those rows are attributed by applicationId. So an identity has
 *   to be registered by the time this is called — hence the throw below when
 *   neither this nor a prior registerApplication() supplied one.
 * @param {string} [config.mountPath='/workflow'] - only meaningful when this
 *   package creates its own app; a host app's own app.use() call decides its
 *   own mount path when embedding.
 * @param {number} [config.port] - only used when creating a standalone app.
 * @param {string} [config.appName='xeplr_workflow_api']
 * @param {Function} [config.mtMembershipGate] - see lib/router.js
 * @param {Function} [config.authMiddleware] - see lib/router.js
 * @param {Function[]} [config.middleware] - only used when creating a
 *   standalone app — passed straight to createApp.
 * @param {object|false} [config.log] - only used when creating a standalone app.
 * @returns {Promise<{ router: import('express').Router, flowsRouter: import('express').Router, app: import('express').Express, server?: import('http').Server }>}
 *   `router` carries every route including the flows facade at
 *   `<mount>/flows`. `flowsRouter` is that facade on its own, for a host that
 *   would rather mount it somewhere else as well — see the note where it is
 *   built.
 */
async function registerWorkflow(config) {
  config = config || {};
  if (!config.db) {
    throw new Error('registerWorkflow: config.db is required — workflow owns its own domain data regardless of how it is mounted');
  }
  // WORKFLOW'S OWN TABLES CARRY NO applicationId. Each host supplies its own
  // database (config.db), so that database is the boundary — a column holding
  // one constant value in every row would buy nothing, which is the same
  // reason xeplr_bi and the auth DBs do not have one either.
  //
  // The identity is still REQUIRED, because this mount also writes to
  // xeplr_configs — the one store that genuinely is shared by every app and
  // cannot be split per consumer (reference data, plus import_meta). Rows
  // there are attributed by applicationId, so a mount that skipped this would
  // quietly file its movement metadata under the package name instead of the
  // product's.
  //
  // Inherited by default: a host registers itself once at boot and every
  // sub-product it mounts picks it up with no further wiring. config
  // .applicationId is accepted for a host that would rather be explicit, and
  // is idempotent under the same value.
  if (config.applicationId) registerApplication(config.applicationId);
  if (!getApplicationId()) {
    throw new Error(
      'registerWorkflow: no application registered. Call registerApplication("<this-product>") ' +
      'from @xeplr/db once at host startup (or pass config.applicationId). It attributes the ' +
      'rows this mount writes to the SHARED xeplr_configs database; workflow\'s own tables are ' +
      'separated by having their own database, not by this.');
  }

  await connectDb(config.db);

  // ITS OWN TABLES, ITS OWN JOB — for the same reason config.db is required in
  // both modes. This lived in orchestration/standalone.js, so a host that
  // embedded workflow got a connection to a database with none of workflow's
  // tables in it, and the first request failed on a missing relation.
  //
  // Idempotent, so a host that also runs them loses nothing by this.
  //
  // The migrator resolves its connection BY NAME from a registry that
  // getConnection above does not populate, so the name has to be resolved
  // explicitly first. Without this an embedded mount died on
  // 'No resolved config for "WORKFLOW"' and the whole product silently did
  // not appear — while every /workflow/* path still answered 401, because the
  // host's auth middleware runs before routing and a missing route never got
  // the chance to 404.
  var migrationConnection = config.db.connectionName || 'workflow';
  await resolveConfig(migrationConnection, config.db.connection);

  // CREATE IT IF IT IS NOT THERE. Each host gives workflow its own database
  // (xeplr_bi_workflow, xeplr_erp_workflow) — that separation is the entire
  // isolation model, so pointing a host at a name that does not exist yet is
  // the NORMAL first boot, not an error state. Without this it failed on
  // "database does not exist" and every host had to run a manual createdb
  // that nothing in the config hinted at. Same as @xeplr/email does.
  var ensured = await ensureDatabaseFor(config.db.connection, config.db.name);
  if (ensured.created) console.log('[workflow] created database ' + config.db.name);
  // XEPLR_WORKFLOW_MIGRATIONS — a host adds its own tables or seed rows to
  // workflow's database without editing this package. Same convention as
  // every other xeplr library (see @xeplr/db's app-migrations.js); config
  // .migrations lets an embedding host pass them directly instead, since a
  // host that already has the paths in code should not have to route them
  // back out through the environment.
  var migrated = await up({
    db: config.db.name,
    dir: path.join(__dirname, 'migrations'),
    extDir: config.migrations || migrationsFor('workflow'),
    type: 'precede',
    connectionName: migrationConnection
  });
  if (migrated.migrations.length) {
    console.log('[workflow] ran ' + migrated.migrations.length + ' migrations');
  }


  // THE ACTION CATALOG, for the same reason the migrations above moved here.
  // This lived only in orchestration/standalone.js, so an embedded host got a
  // mounted product whose registry was empty: GET /actions answered 200 with
  // an empty list, the step editor's Action dropdown drew nothing, and there
  // was no error anywhere to explain why — the one failure mode the whitelist
  // in lib/actionCatalog.js is otherwise careful to make loud.
  //
  // Idempotent (register() overwrites by name), so a host that somehow also
  // registers them loses nothing.
  //
  // xeplr_configs is best-effort HERE and fail-fast in standalone, and the
  // difference is deliberate: standalone owns its whole process and should
  // refuse to boot half-configured, whereas failing a host's mount over one
  // action that records movement metadata would take down a product that is
  // otherwise entirely functional. The warning names what was lost.
  try {
    await xcfgSetup.ready();
  } catch (err) {
    console.warn('[workflow] xeplr_configs unavailable (' + err.message + ') — actions needing it are not offered');
  }
  var registered = actionCatalog.registerAll();
  console.log('[workflow] registered ' + registered.length + ' actions: ' + registered.join(', '));

  // Say out loud what step templates can read out of the environment. Silent
  // by default (nothing exposed unless WORKFLOW_ENV_EXPOSED names it), so a
  // line here means somebody opted in — and a list that accidentally names a
  // secret is only catchable if it is visible somewhere.
  envExposed.logExposure();

  var router = buildWorkflowRouter(config);

  // THE FLOWS FACADE, ALSO ON ITS OWN. It is already inside `router` at
  // <mount>/flows, which is all most hosts need. This second, independent
  // instance is for a host that wants to serve it from a path of its own —
  // routes['/flows'] = flowsRouter, beside routes['/workflow'] = router —
  // because the app designing the screens is not the app that mounted the
  // workflow builder and should not have to reach through its URL space.
  //
  // Same builder, same config, and it gates itself, so the two mounts are
  // interchangeable rather than merely similar. Mounting both is fine; they
  // share nothing but the database.
  var flowsRouter = buildFlowsRouter(config);

  if (config.app) {
    config.app.use(config.mountPath || '/workflow', router);
    return { router: router, flowsRouter: flowsRouter, app: config.app };
  }

  // No app to mount onto and no port to listen on: the caller wants the
  // router itself. See the note on config.app.
  if (!config.port) return { router: router, flowsRouter: flowsRouter };

  var mountPath = config.mountPath || '/workflow';
  var routes = {};
  routes[mountPath] = router;

  var built = createApp(config.port, config.appName || 'xeplr_workflow_api', {
    // Passed through, NOT defaulted here: undefined means createApp's own
    // default, which is gated. Only reached in STANDALONE mode — an embedded
    // mount returns above, and its host's own app already carries a gate.
    auth: config.auth,
    log: config.log,
    middleware: config.middleware || [],
    routes: routes
  });

  return { router: router, flowsRouter: flowsRouter, app: built.app, server: built.server };
}

// Env vars a HOST embedding workflow must supply — spread into the host's
// env.required.js so a missing one fails at startup rather than at mount:
//
//   ...require('@xeplr/workflow').embedRequiredEnv,   // DB_WORKFLOW
//
// Named `embedRequiredEnv`, not `requiredEnv`, because it is not the same
// list as this package's OWN standalone process needs (see env.required.js,
// which uses DB_API for the very same database — a standalone deployment
// names its own store, an embedded one is given a separate one by its host).
// Two deployments, two questions, two lists.
//
// DB_WORKFLOW only: the SERVER login comes from the shared
// XEPLR_DB_CONNECTION, and workflow never reads either itself — the host
// passes both into registerWorkflow({ db }). This list exists so the host is
// told what to pass before it boots.
var embedRequiredEnv = [
  'DB_WORKFLOW'
];

/**
 * Resume a run parked on a 'wait' step. THE ENTIRE consumer-side contract for
 * waiting — the caller never needs to know which run or step the key belongs
 * to, because that lookup lives in workflow_resume_keys alone.
 *
 *   var { resumeByKey } = require('@xeplr/workflow');
 *   await resumeByKey(key, { confirmedBy: userId });
 *
 * SERVER-SIDE, IN-PROCESS, DELIBERATELY. This is not something a browser
 * calls. The host's own route — the activation link's landing route, the
 * confirm button's POST — does its own work (activate the account, record the
 * approval) and then calls this in the same request. The key travels out
 * bound into that route's URL via `{resumeKey}` and comes back to the host,
 * never to workflow's own HTTP surface.
 *
 * That is the whole reason it is exported here rather than left as a route: a
 * resume is a step in the host's transaction, not a separate thing a client
 * is trusted to trigger.
 *
 * Throws with `err.code` set, which is what a host should branch on:
 *
 *   RESUME_KEY_INVALID    no live key — already used, unknown, or the run is
 *                         gone. NORMAL for a host route that also serves
 *                         users who never came from a workflow: catch it and
 *                         carry on with your own work.
 *   RESUME_KEY_NOT_READY  the key is real but its step has not parked yet
 *                         (the action that delivers it is still running).
 *                         Nothing is consumed — retry shortly.
 *
 * Requires registerWorkflow() to have run in this process: it is what
 * connects workflow's database, and this reads through that same connection.
 * Needs no ambient tenant context — the run carries its own mtIds and this
 * re-enters them itself.
 *
 * @param {string} key    the value bound into the step as {resumeKey}
 * @param {object} [output]  merged into the wait step's output, so later
 *   steps can read it as {steps.<stepKey>.output.<name>}
 * @param {object} [opts]
 * @param {'success'|'failed'} [opts.status]  resolve the step as FAILED rather
 *   than succeeded — from there the step's own `onError` decides, defaulting
 *   to stopping the run. Omit for success, which is what every caller that
 *   predates this means (an approval click, a confirmation link).
 * @param {object} [opts.error]  recorded on the step run when status is
 *   'failed'.
 * @returns {Promise<{ runId: string, stepKey: string, status: string }>}
 */
async function resumeByKey(key, output, opts) {
  return require('./lib/workflowRunner').resumeByKey(key, output, opts);
}

// REQUIRED ONLY IF YOU USE STEPS THAT CALL SOMETHING OUTSIDE THIS PROCESS —
// today that is `job-run`. Kept as its own list, the same way @xeplr/email
// separates `requiredEnv` (sending) from `templatesRequiredEnv` (the template
// store): a host that only runs self-contained workflows is never made to
// configure something it does not use.
//
// WORKFLOW_PUBLIC_URL is the base a CALLER can reach this service on, mount
// path included — https://bi.example.com/workflow for an embedded mount. It is
// what {resumeUrl} is built from, so a step can hand a job an address to
// report back to.
//
// NOT DEFAULTED, and that is the point of it being here rather than having a
// fallback: a wrong-but-present address gives a job somewhere to POST that
// nothing is listening on, so the run waits forever on work that actually
// finished. Unset, {resumeUrl} is null and job-run refuses by name before
// starting anything.
var callbackRequiredEnv = [
  'WORKFLOW_PUBLIC_URL'
];

module.exports = {
  registerWorkflow: registerWorkflow,
  resumeByKey: resumeByKey,
  embedRequiredEnv: embedRequiredEnv,
  callbackRequiredEnv: callbackRequiredEnv
};
