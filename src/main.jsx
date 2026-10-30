import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Keeps one bad record or render bug from leaving a blank white screen.
class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Finora crashed', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="lock-screen"><div className="lock-card" role="alert">
      <h2>Something went wrong</h2>
      <p>Your data is stored safely in this browser and has not been changed. Reload to try again.</p>
      <p style={{ fontSize: 12, opacity: .7, wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload Finora</button>
    </div></main>
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
