import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// EVERY API PREFIX THIS APP CALLS.
//
// A path missing from this list does NOT fail loudly — Vite falls through to
// the SPA and serves index.html, so the fetch succeeds and the JSON parse is
// what breaks: `Unexpected token '<'`. Adding a route to the backend is only
// half of shipping an endpoint; it has to be listed here too, or it works in a
// build and not in dev.
//
// Kept as one array rather than an object literal so a new endpoint is one
// word, not a copy-pasted line with a port in it.
const API_PATHS = [
  '/me',
  '/companies',
  '/workspaces',
  '/actions',
  '/workflows',
  '/workflow-runs',
  '/public'
]

export default defineConfig(({ mode }) => {
  // Prefix '' so plain names load, not just VITE_-prefixed ones. These are dev
  // server settings, not values shipped to the browser — nothing here is
  // inlined into the bundle.
  const env = loadEnv(mode, process.cwd(), '')

  // NO PORT LITERALS. A hardcoded fallback is a second answer to a question
  // .env already answers, and it is the one that wins when the file is missing
  // — which is exactly when you want to be told rather than quietly served on
  // a port you did not choose.
  const port = Number(env.UI_PORT)
  const authUrl = env.AUTH_URL
  const apiUrl = env.API_URL
  if (!port || !authUrl || !apiUrl) {
    throw new Error('.env must set UI_PORT, AUTH_URL and API_URL — copy .env.example')
  }

  const proxy = {
    // Only the real network calls (/auth/api/*), NOT bare /auth — that prefix
    // is also used by client-side routes (/auth/login, /auth/admin/…), which
    // must fall through to Vite's SPA index.html rather than the auth backend.
    '/auth/api': authUrl,
    // SSE stream. Needs buffering off, or the proxy holds events until it
    // decides the response is "done" — which for a long-lived stream is never,
    // so nothing would arrive.
    '/events': {
      target: apiUrl,
      changeOrigin: true,
      ws: false,
      configure: (p) => {
        p.on('proxyRes', (res) => { res.headers['cache-control'] = 'no-cache, no-transform' })
      }
    }
  }
  API_PATHS.forEach((path) => { proxy[path] = apiUrl })

  return {
    plugins: [react()],
    resolve: {
      // @xeplr/* packages are symlinked from the workspace root and have their
      // own node_modules. Dedupe forces every import to THIS app's copy, so
      // hook-using libraries don't load twice and break the rules of hooks in
      // ways that read as impossible.
      dedupe: ['react', 'react-dom', 'react-router-dom', '@xeplr/ui-canvas']
    },
    optimizeDeps: {
      // Re-optimise on every dev start, because these are packages we EDIT.
      // Vite caches the pre-bundle in node_modules/.vite and does NOT
      // invalidate it when a linked package's source changes — so an edit to
      // @xeplr/ui-account keeps running whatever copy the cache was last built
      // from. It fails silently, which is the expensive kind.
      force: true,
      // A LINKED package is not pre-bundled by default, and CommonJS that is
      // not pre-bundled is served to the browser as-is — where `import xf
      // from` finds no `default` export and the module fails to parse. Naming
      // it here is what converts it to ESM for the dev server. The
      // commonjsOptions below is the same fix for a production BUILD; they are
      // two separate pipelines and fixing one does not fix the other.
      include: ['@xeplr/expression-handler']
    },
    build: {
      commonjsOptions: {
        // The CJS plugin only looks inside node_modules by default, and a
        // symlinked package resolves to its REAL path outside it — so a
        // CommonJS @xeplr/* package would be left untransformed and its
        // exports invisible to rollup. optimizeDeps above covers the dev
        // server only; this is the same fix for a production build.
        // xeplr-expression-handler is here for the same reason as the ui
        // packages: it is CommonJS, it is symlinked, and a symlink resolves to
        // its REAL path OUTSIDE node_modules — so without naming it, rollup
        // leaves it untransformed and its exports are invisible. The step
        // editor compiles transition conditions with it (see src/conditions.js).
        include: [/node_modules/, /xeplr-ui-/, /xeplr-expression-handler/]
      }
    },
    server: { port, strictPort: true, proxy },
    preview: { port, strictPort: true }
  }
})
