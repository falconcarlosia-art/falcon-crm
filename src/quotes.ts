import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

// ---------- Tipos ----------

export interface QuoteItem {
  /** id del producto en Supabase; null = ítem libre (instalación, envío…). */
  productId: string | null
  name: string
  /** Miniatura como data URL: así el render a PNG no depende del CORS de nadie. */
  thumb: string | null
  unitPrice: number
  qty: number
}

export interface QuoteConditions {
  payment: string
  delivery: string
  origin: string
  warranty: string
  stock: string
  commercial: string
}

export type QuoteStatus = 'pendiente' | 'aceptada' | 'rechazada'

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#f7941d' },
  aceptada: { label: 'Aceptada', color: '#16a34a' },
  rechazada: { label: 'Rechazada', color: '#dc2626' },
}

export interface Quote {
  id: string
  number: string
  contactId: string
  clientName: string
  issueDate: string // YYYY-MM-DD
  validUntil: string // YYYY-MM-DD
  items: QuoteItem[]
  conditions: QuoteConditions
  total: number
  /** Ausente en cotizaciones antiguas: se trata como 'pendiente'. */
  status?: QuoteStatus
  createdAt?: Timestamp
}

export interface CompanySettings {
  legalName: string
  ruc: string
  phone: string
  web: string
  fiscalAddress: string
  officeAddress: string
  yapeName: string
  /** QR de Yape como data URL (se guarda reducido en Firestore). */
  yapeQr: string | null
  bankLabel: string
  account: string
  cci: string
  holder: string
  cardTitle: string
  cardText: string
  footer: string
  validityDays: number
  conditions: QuoteConditions
}

export const DEFAULT_SETTINGS: CompanySettings = {
  legalName: 'FALCON ELECTRONIC DEL PERÚ E.I.R.L.',
  ruc: '20607895237',
  phone: '+51 931 324 454',
  web: 'falcem.com',
  fiscalAddress: 'Cal. Río Chicama 5670, Urb. Villa del Norte — Los Olivos, Lima',
  officeAddress: 'Jr. Artemisa Mz. S Lote 28F — Chorrillos, Lima',
  // Datos de pago vacíos a propósito: se cargan en Ajustes y viven en Firestore,
  // no en el repositorio.
  yapeName: '',
  yapeQr: null,
  bankLabel: 'BBVA · Cta. corriente soles',
  account: '',
  cci: '',
  holder: 'Falcon Electronic del Perú E.I.R.L.',
  cardTitle: '¿Prefieres tarjeta de crédito o débito vía ligo?',
  cardText: 'Solicita el enlace de pago al confirmar tu orden.',
  footer: 'Gracias por confiar en nosotros',
  validityDays: 8,
  conditions: {
    payment: '50 % de adelanto, saldo contra entrega.',
    delivery: 'Stock en almacén. Instalación coordinada dentro de 5 días hábiles.',
    origin: 'Jr. Artemisa Mz. S Lote 28F — Chorrillos, Lima',
    warranty: '12 meses contra defectos de fabricación, desde la fecha de entrega.',
    stock: 'Precios y disponibilidad sujetos a stock al momento de la orden de compra.',
    commercial:
      'Los precios indicados incluyen una condición comercial especial válida para esta cotización. ' +
      'La emisión del comprobante de pago correspondiente se realizará conforme a la normativa aplicable.',
  },
}

// ---------- Montos y fechas ----------

export const IGV_RATE = 0.18
const round2 = (n: number) => Math.round(n * 100) / 100

export function totals(items: QuoteItem[]) {
  const total = round2(items.reduce((s, i) => s + round2(i.unitPrice * i.qty), 0))
  // Los precios ya incluyen IGV: se desglosa hacia atrás (47.00 → 39.83 + 7.17).
  const base = round2(total / (1 + IGV_RATE))
  return { total, base, igv: round2(total - base) }
}

const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const money = (n: number) => `S/ ${moneyFmt.format(n)}`

export function todayISO(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return todayISO(new Date(y, m - 1, d + days))
}
/** 2026-09-25 → 25/09/2026 */
export const dmy = (iso: string) => iso.split('-').reverse().join('/')

// ---------- Numeración: AAAA-DDMM-n, correlativo por día ----------

/**
 * Reserva el siguiente número del día con una transacción, para que dos
 * cotizaciones emitidas a la vez nunca compartan número. Requiere conexión.
 */
export async function nextQuoteNumber(issueDate: string): Promise<string> {
  const [y, m, d] = issueDate.split('-')
  const key = `${y}-${d}${m}`
  const counter = doc(db, 'counters', `quote-${key}`)
  const n = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counter)
    const next = ((snap.exists() ? (snap.data().last as number) : 0) || 0) + 1
    tx.set(counter, { last: next, updatedAt: serverTimestamp() })
    return next
  })
  return `${key}-${n}`
}

// ---------- Settings ----------

export function useSettings() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS)
  useEffect(
    () =>
      onSnapshot(doc(db, 'settings', 'company'), (snap) => {
        const data = snap.data() as Partial<CompanySettings> | undefined
        setSettings({
          ...DEFAULT_SETTINGS,
          ...data,
          conditions: { ...DEFAULT_SETTINGS.conditions, ...data?.conditions },
        })
      }),
    [],
  )
  return settings
}

export function saveSettings(s: CompanySettings) {
  return setDoc(doc(db, 'settings', 'company'), { ...s, updatedAt: serverTimestamp() })
}

export function useAllQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  useEffect(
    () => onSnapshot(collection(db, 'quotes'), (snap) => setQuotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Quote))),
    [],
  )
  return quotes
}

export function setQuoteStatus(id: string, status: QuoteStatus) {
  return updateDoc(doc(db, 'quotes', id), { status })
}

export function useQuotes(contactId: string) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'quotes'), where('contactId', '==', contactId)),
        // Orden en el cliente: where + orderBy en campos distintos pide índice compuesto.
        (snap) =>
          setQuotes(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }) as Quote)
              .sort((a, b) => (b.createdAt?.toMillis() ?? Infinity) - (a.createdAt?.toMillis() ?? Infinity)),
          ),
      ),
    [contactId],
  )
  return quotes
}

// ---------- Imágenes ----------

/** Descarga una imagen y la reduce a data URL (miniatura o QR). null si falla (CORS, 404). */
export async function toDataUrl(src: string | Blob, maxSize: number): Promise<string | null> {
  try {
    const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}

// ---------- Guardado ----------

export type QuoteInput = Omit<Quote, 'id' | 'total' | 'status' | 'createdAt'>

/**
 * Guarda solo los datos de la cotización (unos pocos KB). La imagen y el PDF
 * no se almacenan: se generan en la app cada vez que se envían o descargan.
 */
export async function saveQuote(input: QuoteInput): Promise<Quote> {
  const ref = doc(collection(db, 'quotes'))
  const data = { ...input, total: totals(input.items).total, status: 'pendiente' as QuoteStatus }
  await setDoc(ref, { ...data, createdAt: serverTimestamp() })
  return { id: ref.id, ...data }
}
