import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const ALLOWED_EMAIL = (
  import.meta.env.VITE_ALLOWED_EMAIL || 'carlos.falcon.tbp@gmail.com'
).toLowerCase()

// Sin config la app muestra una pantalla de ayuda en vez de romper: getAuth
// lanza con una apiKey vacía, así que no se inicializa nada hasta tenerla.
export const configured = Boolean(config.apiKey && config.projectId && config.appId)

const app = configured ? initializeApp(config) : null

// Los módulos que usan estos objetos solo se montan cuando `configured` es true.
export const auth = (app ? getAuth(app) : null) as Auth
export const db = (
  app
    ? initializeFirestore(app, {
        // Caché local: la lista abre al instante y se puede consultar sin señal.
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      })
    : null
) as Firestore
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
