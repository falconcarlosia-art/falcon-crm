import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ShortLinkRedirect } from './components/ShortLinkRedirect'
import { ToastProvider } from './components/toast'
// Fuentes incluidas en la app (no desde Google Fonts): la cotización se rasteriza
// con ellas y no puede depender de una descarga externa que a veces falla.
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/orbitron/latin-600.css'
import '@fontsource/orbitron/latin-700.css'
import './styles.css'

// Los enlaces cortos no pasan por el login: son lo que abre el cliente.
const shortCode = /^\/v\/([a-z0-9]+)\/?$/.exec(window.location.pathname)?.[1]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>{shortCode ? <ShortLinkRedirect code={shortCode} /> : <App />}</ToastProvider>
  </StrictMode>,
)
