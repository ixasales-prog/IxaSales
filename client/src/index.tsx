/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'
import ErrorBoundary, { DefaultErrorFallback } from './components/ErrorBoundary'

const root = document.getElementById('root')

render(
  () => (
    <ErrorBoundary fallback={(error: Error, reset: () => void) => <DefaultErrorFallback error={error} reset={reset} />}>
      <App />
    </ErrorBoundary>
  ),
  root!
)

const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname)

if (isLocalhost) {
  // Prevent stale PWA caches during local/mobile testing.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister()
      })
    })
  }
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        void caches.delete(key)
      })
    })
  }
} else {
  const enablePwa = import.meta.env.VITE_ENABLE_PWA !== 'false'
  if (enablePwa) {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({
        immediate: true
      })
    })
  }
}

