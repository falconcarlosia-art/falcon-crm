import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { ALLOWED_EMAIL, auth, configured, googleProvider } from './firebase'
import { seedTemplatesOnce, useContacts, useTemplates } from './data'
import { ContactsView } from './components/ContactsView'
import { TemplatesView } from './components/TemplatesView'
import { SettingsView } from './components/SettingsView'
import { useAllQuotes, useSettings } from './quotes'
import { useAiConfig } from './ai'
import { IconInstall, IconLogout, IconMessage, IconSettings, IconShareIOS, IconUsers } from './components/icons'
import { Modal } from './components/Modal'
import { useInstall } from './pwa'
import { errorMessage, useToast } from './components/toast'

function Brand() {
  return (
    <div className="brand">
      <img src="/icon.svg" alt="" width={34} height={34} />
      <div>
        <strong>FALCON</strong>
        <span>CRM</span>
      </div>
    </div>
  )
}

export default function App() {
  if (!configured) return <NotConfigured />
  return <AuthGate />
}

function NotConfigured() {
  return (
    <div className="center-screen">
      <div className="login-card">
        <Brand />
        <h1>Falta la configuración de Firebase</h1>
        <p className="muted">
          Copia <code>apps/falcon-crm/.env.example</code> a <code>.env.local</code> (desarrollo) o{' '}
          <code>.env.production</code> (despliegue) y completa el <code>firebaseConfig</code> del proyecto
          falcon-crm.
        </p>
      </div>
    </div>
  )
}

function AuthGate() {
  const toast = useToast()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      // En la app instalada (PWA) y en algunos móviles el popup no se abre.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider)
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        toast(errorMessage(err), 'error')
      }
    }
  }

  if (user === undefined) return <div className="center-screen muted">Cargando…</div>

  if (!user) {
    return (
      <div className="center-screen">
        <div className="login-card">
          <Brand />
          <h1>Contactos y envíos por WhatsApp</h1>
          <p className="muted">Ingresa con tu cuenta de Google.</p>
          <button className="btn btn-primary btn-lg" onClick={login}>
            Ingresar con Google
          </button>
        </div>
      </div>
    )
  }

  if ((user.email ?? '').toLowerCase() !== ALLOWED_EMAIL) {
    return (
      <div className="center-screen">
        <div className="login-card">
          <Brand />
          <h1>Acceso restringido</h1>
          <p className="muted">
            {user.email} no tiene acceso a este CRM. Ingresa con la cuenta autorizada.
          </p>
          <button className="btn btn-ghost" onClick={() => signOut(auth)}>
            Cambiar de cuenta
          </button>
        </div>
      </div>
    )
  }

  return <Shell user={user} />
}

type Tab = 'contactos' | 'plantillas' | 'ajustes'
const TABS: { id: Tab; label: string; Icon: typeof IconUsers }[] = [
  { id: 'contactos', label: 'Contactos', Icon: IconUsers },
  { id: 'plantillas', label: 'Plantillas', Icon: IconMessage },
  { id: 'ajustes', label: 'Ajustes', Icon: IconSettings },
]

function Shell({ user }: { user: User }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('contactos')
  const contacts = useContacts()
  const templates = useTemplates()
  const settings = useSettings()
  const quotes = useAllQuotes()
  const ai = useAiConfig()

  useEffect(() => {
    seedTemplatesOnce().catch((err) => toast(errorMessage(err), 'error'))
  }, [toast])

  const firstError = contacts.error ?? templates.error
  useEffect(() => {
    if (firstError) toast(errorMessage(firstError), 'error')
  }, [firstError, toast])

  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
        <nav className="tabs hide-mobile">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={`tab${tab === id ? ' tab-on' : ''}`} onClick={() => setTab(id)}>
              <Icon width={18} height={18} /> {label}
            </button>
          ))}
        </nav>
        <div className="user">
          <InstallButton />
          {user.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
          <button className="icon-btn" onClick={() => signOut(auth)} aria-label="Cerrar sesión" title="Cerrar sesión">
            <IconLogout />
          </button>
        </div>
      </header>

      <main className="main">
        {tab === 'contactos' && (
          <ContactsView
            contacts={contacts.data}
            loading={contacts.loading}
            templates={templates.data}
            settings={settings}
            quotes={quotes}
            ai={ai}
          />
        )}
        {tab === 'plantillas' && <TemplatesView templates={templates.data} />}
        {tab === 'ajustes' && <SettingsView settings={settings} ai={ai} />}
      </main>

      <nav className="bottom-nav show-mobile">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

/** Aparece solo si la app aún no está instalada y el navegador lo permite. */
function InstallButton() {
  const toast = useToast()
  const install = useInstall()
  const [iosHelp, setIosHelp] = useState(false)
  if (!install.canPrompt && !install.iosManual) return null

  async function onClick() {
    if (install.canPrompt) {
      if (await install.prompt()) toast('Listo: Falcon CRM quedó en tu pantalla de inicio.')
    } else {
      setIosHelp(true)
    }
  }

  return (
    <>
      <button className="install-btn" onClick={onClick} title="Instalar la app en este equipo">
        <IconInstall width={16} height={16} />
        <span>Instalar</span>
      </button>
      {/* Portal: la barra superior es sticky con z-index y dejaría el modal debajo de la barra inferior. */}
      {iosHelp &&
        createPortal(
          <Modal
            title="Instalar en el iPhone"
            onClose={() => setIosHelp(false)}
            footer={
              <button className="btn btn-primary" onClick={() => setIosHelp(false)}>
                Entendido
              </button>
            }
          >
            <ol className="ios-steps">
              <li>
                Toca <b>Compartir</b> <IconShareIOS width={16} height={16} /> en la barra de Safari.
              </li>
              <li>
                Elige <b>Agregar a inicio</b> (baja en la lista si no lo ves).
              </li>
              <li>
                Toca <b>Agregar</b>. Abre Falcon CRM desde su ícono e ingresa con Google una vez.
              </li>
            </ol>
          </Modal>,
          document.body,
        )}
    </>
  )
}
