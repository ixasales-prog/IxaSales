/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/pwa'

// Register service worker for PWA functionality
if (import.meta.env.PROD) {
    registerServiceWorker();
}

const root = document.getElementById('root')

render(() => <App />, root!)

