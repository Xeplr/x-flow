import { Component } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes.js'
import './ErrorBoundary.css'

// The app's floor. React unmounts the entire tree when a render or an effect
// throws and nothing catches it — one bad component and the page goes white,
// with the reason only in the console. An error boundary is the only thing
// React offers here: try/catch cannot reach a child's render.
//
// Scoped to the routed page rather than the whole app, so the nav survives
// and there is somewhere to go that isn't the browser's back button.
//
// `key` on the boundary (see App) resets it on navigation — otherwise a page
// that failed once stays failed, because a caught boundary keeps rendering
// its fallback until its state is cleared.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept in the console in full — the fallback shows the message, but the
    // component stack is what actually locates the fault.
    console.error('[xeplr-workflow] Unhandled error in a page:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="xeplr-crash">
        <h2>This page hit an error</h2>
        <p className="xeplr-crash-message">{this.state.error.message || String(this.state.error)}</p>
        <p className="muted">
          The rest of the app is still running. Try again, or go back and come at it
          from somewhere else — nothing you had saved is affected.
        </p>
        <div className="xeplr-crash-actions">
          {/* Re-render the same page from scratch. A transient failure — a
              request that came back wrong, a value that hadn't loaded yet —
              usually clears here, without losing the session to a reload. */}
          <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
          <Link className="xeplr-crash-link" to={ROUTES.home()}>Go home</Link>
        </div>
      </div>
    )
  }
}
