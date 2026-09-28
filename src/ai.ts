import { useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'

// IA vía OpenRouter: una sola API key da acceso a cientos de modelos, y el
// modelo de cada tarea se elige en Ajustes según precio.
const API = 'https://openrouter.ai/api/v1'

// ---------- Configuración (Firestore private/ai, solo el dueño la lee) ----------

export interface AiConfig {
  apiKey: string
  /** Modelo para armar cotizaciones desde el mensaje del cliente. */
  quoteModel: string
  /** Modelo para analizar conversaciones. */
  chatModel: string
}

const EMPTY: AiConfig = { apiKey: '', quoteModel: '', chatModel: '' }

export function useAiConfig() {
  const [config, setConfig] = useState<AiConfig>(EMPTY)
  useEffect(
    () => onSnapshot(doc(db, 'private', 'ai'), (snap) => setConfig({ ...EMPTY, ...(snap.data() as Partial<AiConfig>) })),
    [],
  )
  return config
}

export function saveAiConfig(c: AiConfig) {
  return setDoc(doc(db, 'private', 'ai'), { ...c, updatedAt: serverTimestamp() })
}

export const aiReady = (c: AiConfig, task: 'quote' | 'chat') =>
  Boolean(c.apiKey && (task === 'quote' ? c.quoteModel : c.chatModel))

// ---------- Catálogo de modelos ----------

export interface AiModel {
  id: string
  name: string
  /** US$ por millón de tokens. */
  inPrice: number
  outPrice: number
  context: number
  /** Acepta json_schema estricto: la respuesta siempre respeta el formato. */
  structured: boolean
  jsonMode: boolean
  vision: boolean
}

const MODELS_CACHE = 'openrouter-models-v1'
let modelsPromise: Promise<AiModel[]> | null = null

/** Lista pública de OpenRouter (no requiere key). Se guarda un día en el navegador. */
export function listModels(): Promise<AiModel[]> {
  if (modelsPromise) return modelsPromise
  try {
    const cached = JSON.parse(localStorage.getItem(MODELS_CACHE) ?? 'null') as { at: number; models: AiModel[] } | null
    if (cached && Date.now() - cached.at < 86_400_000) return (modelsPromise = Promise.resolve(cached.models))
  } catch {
    /* caché opcional */
  }
  modelsPromise = fetch(`${API}/models`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`OpenRouter respondió ${r.status}`))))
    .then((json: { data: RawModel[] }) => {
      const models = json.data.map(toModel).filter((m) => m.inPrice >= 0 && m.outPrice >= 0)
      try {
        localStorage.setItem(MODELS_CACHE, JSON.stringify({ at: Date.now(), models }))
      } catch {
        /* caché opcional */
      }
      return models
    })
    .catch((err) => {
      modelsPromise = null
      throw err
    })
  return modelsPromise
}

interface RawModel {
  id: string
  name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
  architecture?: { input_modalities?: string[] }
}

function toModel(m: RawModel): AiModel {
  const params = m.supported_parameters ?? []
  return {
    id: m.id,
    name: m.name ?? m.id,
    inPrice: Number(m.pricing?.prompt ?? NaN) * 1e6,
    outPrice: Number(m.pricing?.completion ?? NaN) * 1e6,
    context: m.context_length ?? 0,
    structured: params.includes('structured_outputs'),
    jsonMode: params.includes('response_format'),
    vision: m.architecture?.input_modalities?.includes('image') ?? false,
  }
}

/** Costo aproximado de una operación típica (≈4.000 tokens de entrada y 800 de salida). */
export const opCost = (m: Pick<AiModel, 'inPrice' | 'outPrice'>) => (4000 * m.inPrice + 800 * m.outPrice) / 1e6

// ---------- Llamada con salida JSON ----------

export interface AiResult<T> {
  data: T
  /** US$ que cobró OpenRouter por esta llamada, si lo informa. */
  cost: number | null
  model: string
}

export class AiError extends Error {}

/**
 * Pide al modelo una respuesta JSON con el esquema dado. Si el modelo soporta
 * salida estructurada se exige el esquema (json_schema estricto); si no, se
 * describe en el prompt y se valida al leerlo.
 */
export async function chatJSON<T>(opts: {
  config: AiConfig
  model: string
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
}): Promise<AiResult<T>> {
  const { config, model } = opts
  if (!config.apiKey) throw new AiError('Falta la API key de OpenRouter (Ajustes → Inteligencia artificial).')
  const info = (await listModels().catch(() => [] as AiModel[])).find((m) => m.id === model)
  const structured = info?.structured ?? true

  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: 2500,
    usage: { include: true },
    messages: [
      {
        role: 'system',
        content: structured
          ? opts.system
          : `${opts.system}\n\nResponde SOLO con un objeto JSON válido (sin texto adicional ni bloques de código) que cumpla este esquema:\n${JSON.stringify(opts.schema)}`,
      },
      { role: 'user', content: opts.user },
    ],
  }
  if (structured) {
    body.response_format = { type: 'json_schema', json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } }
    // Solo proveedores que de verdad respeten el esquema.
    body.provider = { require_parameters: true }
  } else if (info?.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Falcon CRM',
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string }
    choices?: { message?: { content?: string | null }; finish_reason?: string }[]
    usage?: { cost?: number }
    model?: string
  } | null
  if (!res.ok || !json || json.error) {
    const msg = json?.error?.message ?? `error ${res.status}`
    if (res.status === 401) throw new AiError('La API key de OpenRouter no es válida.')
    if (res.status === 402) throw new AiError('Sin saldo en OpenRouter: recarga créditos en openrouter.ai.')
    throw new AiError(`OpenRouter: ${msg}`)
  }
  const content = json.choices?.[0]?.message?.content ?? ''
  if (json.choices?.[0]?.finish_reason === 'length') throw new AiError('La respuesta del modelo quedó cortada. Prueba con un texto más corto u otro modelo.')
  return { data: parseJSON<T>(content), cost: json.usage?.cost ?? null, model: json.model ?? model }
}

/** Tolera bloques ```json y texto alrededor, frecuentes en modelos sin salida estructurada. */
export function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T
      } catch {
        /* sigue abajo */
      }
    }
    throw new AiError('El modelo no devolvió un JSON válido. Prueba otro modelo (idealmente con salida estructurada).')
  }
}

export const usd = (n: number) =>
  n === 0 ? 'gratis' : n < 0.01 ? `US$ ${n.toFixed(4)}` : `US$ ${n.toFixed(n < 1 ? 3 : 2)}`
