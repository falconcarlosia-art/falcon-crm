import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ShortLinkRedirect } from './components/ShortLinkRedirect'
import { ToastProvider } from './components/toast'
import './styles.css'

// Los enlaces cortos no pasan por el login: son lo que abre el cliente.
const shortCode = /^\/v\/([a-z0-9]+)\/?$/.exec(window.location.pathname)?.[1]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>{shortCode ? <ShortLinkRedirect code={shortCode} /> : <App />}</ToastProvider>
  </StrictMode>,
)
