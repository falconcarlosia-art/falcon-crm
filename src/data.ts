import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  getDocs,
  type Query,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Contact, SendChannel, SendRecord, Template } from './types'

// Un solo usuario y pocos cientos de registros: se escucha la colección entera
// y se filtra en el cliente, sin índices compuestos que mantener.
function useLive<T>(build: () => Query | null, deps: unknown[]) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    const q = build()
    if (!q) return
    setLoading(true)
    return onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, loading, error }
}

export const useContacts = () =>
  useLive<Contact>(() => query(collection(db, 'contacts'), orderBy('updatedAt', 'desc')), [])

export const useTemplates = () =>
  useLive<Template>(() => query(collection(db, 'templates'), orderBy('createdAt', 'asc')), [])

export const useSends = (contactId: string) =>
  useLive<SendRecord>(
    () => query(collection(db, 'contacts', contactId, 'sends'), orderBy('sentAt', 'desc')),
    [contactId],
  )

// ---- Contactos ----

export type ContactInput = Pick<Contact, 'name' | 'phone' | 'stage' | 'tags' | 'notes'> & { handle?: string }

const DAY = 86_400_000

/** Fecha de seguimiento a N días, a las 9:00 para que ordene bien dentro del día. */
export function followUpDate(days: number): Date {
  const d = new Date(Date.now() + days * DAY)
  d.setHours(9, 0, 0, 0)
  return d
}

/**
 * El id se genera en el cliente para poder abrir la ficha al instante: con la
 * caché offline, la promesa solo se resuelve cuando el servidor confirma.
 */
export function createContact(input: ContactInput): { id: string; saved: Promise<void> } {
  const ref = doc(collection(db, 'contacts'))
  const saved = setDoc(ref, {
    ...input,
    lastSentAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return { id: ref.id, saved }
}

export function updateContact(id: string, patch: Partial<ContactInput>) {
  return updateDoc(doc(db, 'contacts', id), { ...patch, updatedAt: serverTimestamp() })
}

export function setFollowUp(id: string, date: Date | null) {
  return updateDoc(doc(db, 'contacts', id), { followUpAt: date, updatedAt: serverTimestamp() })
}

/** Alta masiva (importación). Firestore limita cada lote a 500 escrituras. */
export async function createContacts(inputs: ContactInput[]) {
  for (let i = 0; i < inputs.length; i += 450) {
    const batch = writeBatch(db)
    inputs.slice(i, i + 450).forEach((input) =>
      batch.set(doc(collection(db, 'contacts')), {
        ...input,
        lastSentAt: null,
        followUpAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
    await batch.commit()
  }
}

export async function deleteContact(id: string) {
  // Las subcolecciones no se borran solas en Firestore.
  const sends = await getDocs(collection(db, 'contacts', id, 'sends'))
  const batch = writeBatch(db)
  sends.forEach((s) => batch.delete(s.ref))
  batch.delete(doc(db, 'contacts', id))
  await batch.commit()
}

export function recordSend(
  contactId: string,
  send: {
    channel: SendChannel
    message: string
    quote: { id: string; number: string } | null
    templateName: string | null
    stage?: Contact['stage']
    /** Días hasta el próximo seguimiento; null lo quita, undefined no lo toca. */
    followUpDays?: number | null
  },
) {
  // En paralelo y sin esperar al servidor: se envía desde el celular, a veces
  // sin señal, y la caché offline sube ambas escrituras al reconectar.
  return Promise.all([
    addDoc(collection(db, 'contacts', contactId, 'sends'), {
      channel: send.channel,
      message: send.message,
      quoteId: send.quote?.id ?? null,
      quoteNumber: send.quote?.number ?? null,
      templateName: send.templateName,
      sentAt: serverTimestamp(),
    }),
    updateDoc(doc(db, 'contacts', contactId), {
      lastSentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(send.stage ? { stage: send.stage } : {}),
      ...(send.followUpDays !== undefined
        ? { followUpAt: send.followUpDays === null ? null : followUpDate(send.followUpDays) }
        : {}),
    }),
  ])
}

// ---- Plantillas ----

export const DEFAULT_TEMPLATES = [
  {
    name: 'Cotización',
    body:
      'Hola {nombre}, te saluda Falcon Electronic.\n' +
      'Te comparto la cotización Nº {numero} por un total de {total}.\n\n' +
      'Cualquier consulta, quedo atento.',
  },
  {
    name: 'Sugerencia',
    body:
      'Hola {nombre}, te dejo una propuesta referencial para tu proyecto (Nº {numero}).\n\n' +
      '¿Te parece si la revisamos juntos?',
  },
  {
    name: 'Seguimiento',
    body: 'Hola {nombre}, ¿pudiste revisar la propuesta que te envié? Quedo atento a tus comentarios.',
  },
]

export async function seedTemplatesOnce() {
  // Una marca aparte evita que vuelvan a aparecer si el usuario las borra todas.
  const flag = doc(db, 'meta', 'seed')
  if ((await getDoc(flag)).exists()) return
  // Ids fijos: si dos pestañas (o el doble montaje de desarrollo) siembran a la
  // vez, escriben los mismos documentos en lugar de duplicar las plantillas.
  const batch = writeBatch(db)
  const base = Date.now()
  DEFAULT_TEMPLATES.forEach((t, i) =>
    batch.set(doc(db, 'templates', `default-${i + 1}`), {
      ...t,
      createdAt: new Date(base + i),
    }),
  )
  batch.set(flag, { templates: true, at: serverTimestamp() })
  await batch.commit()
}

export async function saveTemplate(t: { id?: string; name: string; body: string }) {
  if (t.id) return setDoc(doc(db, 'templates', t.id), { name: t.name, body: t.body }, { merge: true })
  await addDoc(collection(db, 'templates'), { name: t.name, body: t.body, createdAt: serverTimestamp() })
}

export function deleteTemplate(id: string) {
  return deleteDoc(doc(db, 'templates', id))
}
