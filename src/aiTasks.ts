import { chatJSON, type AiConfig, type AiResult } from './ai'
import { STAGES, type StageId } from './types'
import type { Product } from './supabase'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

// ---------- 1. Cotización desde el mensaje del cliente ----------

export interface AiQuoteLine {
  product_id: string | null
  description: string
  qty: number
  note: string
}
export interface AiQuote {
  items: AiQuoteLine[]
  questions: string[]
  summary: string
}

const QUOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'questions', 'summary'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['product_id', 'description', 'qty', 'note'],
        properties: {
          product_id: { type: ['string', 'null'], description: 'id exacto del catálogo, o null si no hay producto que calce' },
          description: { type: 'string', description: 'nombre del producto o del servicio' },
          qty: { type: 'integer', minimum: 1 },
          note: { type: 'string', description: 'por qué se incluye, en pocas palabras' },
        },
      },
    },
    questions: { type: 'array', items: { type: 'string' }, description: 'datos que faltan para cotizar bien' },
    summary: { type: 'string', description: 'una línea con lo que pidió el cliente' },
  },
}

/**
 * Candidatos para el prompt: con catálogos chicos va completo; con grandes se
 * envían los que comparten palabras con el mensaje (más baratos y precisos).
 */
export function pickCandidates(message: string, catalog: Product[], limit = 120): Product[] {
  if (catalog.length <= limit) return catalog
  const words = new Set(
    norm(message)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
      .map((w) => w.replace(/(es|s)$/, '')),
  )
  return catalog
    .map((p) => {
      const hay = norm(`${p.name} ${p.sku ?? ''}`)
      let score = 0
      words.forEach((w) => hay.includes(w) && score++)
      return { p, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p)
}

export function quoteFromMessage(config: AiConfig, message: string, catalog: Product[]): Promise<AiResult<AiQuote>> {
  const candidates = pickCandidates(message, catalog)
  const lines = candidates.map((p) => `${p.id} | ${p.name}${p.sku ? ` (${p.sku})` : ''} | S/ ${p.price.toFixed(2)}`)
  return chatJSON<AiQuote>({
    config,
    model: config.quoteModel,
    schemaName: 'cotizacion',
    schema: QUOTE_SCHEMA,
    system:
      'Eres el asistente de ventas de Falcon Electronic, empresa peruana de domótica e instalaciones eléctricas inteligentes. ' +
      'A partir del mensaje de un cliente arma la lista de ítems a cotizar.\n' +
      'Reglas:\n' +
      '- Usa SOLO productos del catálogo, citando su id exacto. No inventes ids ni precios.\n' +
      '- Si el cliente pide algo que no está en el catálogo, o un servicio (instalación, configuración, visita técnica), agrégalo con product_id null y una descripción clara.\n' +
      '- Si pide instalar productos, agrega una línea de "Instalación y configuración" con product_id null.\n' +
      '- Deduce cantidades del mensaje ("para sala y cocina" = 2). Si no se puede saber, usa 1 y anótalo en questions.\n' +
      '- Si hay varios productos parecidos, elige el más adecuado y menciona la alternativa en note.\n' +
      'Responde en español.',
    user: `Catálogo (id | nombre | precio con IGV):\n${lines.join('\n') || '(catálogo vacío)'}\n\nMensaje del cliente:\n"""${message.trim()}"""`,
  })
}

// ---------- 2. Analizar una conversación ----------

export interface AiChatAnalysis {
  client_name: string
  district: string
  needs: string
  stage: StageId
  tags: string[]
  notes: string
  follow_up_days: number | null
  suggested_reply: string
}

const STAGE_IDS = STAGES.map((s) => s.id)

const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['client_name', 'district', 'needs', 'stage', 'tags', 'notes', 'follow_up_days', 'suggested_reply'],
  properties: {
    client_name: { type: 'string', description: 'nombre del cliente si aparece, si no ""' },
    district: { type: 'string', description: 'distrito o ciudad si aparece, si no ""' },
    needs: { type: 'string', description: 'qué necesita, en una frase' },
    stage: { type: 'string', enum: STAGE_IDS },
    tags: { type: 'array', items: { type: 'string' }, description: '1 a 4 etiquetas cortas en minúsculas' },
    notes: { type: 'string', description: 'resumen útil para la ficha: pedido, presupuesto, plazos, objeciones' },
    follow_up_days: { type: ['integer', 'null'], description: 'en cuántos días volver a escribir, o null si no corresponde' },
    suggested_reply: { type: 'string', description: 'próximo mensaje de WhatsApp, breve y cordial' },
  },
}

export function analyzeChat(
  config: AiConfig,
  chat: string,
  context: { name: string; stage: StageId; notes: string },
): Promise<AiResult<AiChatAnalysis>> {
  return chatJSON<AiChatAnalysis>({
    config,
    model: config.chatModel,
    schemaName: 'analisis_conversacion',
    schema: CHAT_SCHEMA,
    system:
      'Eres el asistente de ventas de Falcon Electronic (domótica, Lima, Perú). Analizas conversaciones de WhatsApp con clientes ' +
      'para actualizar el CRM. Etapas posibles: ' +
      STAGES.map((s) => `${s.id} (${s.label})`).join(', ') +
      '. Elige la etapa según lo que realmente pasó en la conversación: "cotizado" si ya se envió precio, "negociando" si discuten ' +
      'precio o condiciones, "ganado" si confirmó compra o pago, "perdido" si desistió. El mensaje sugerido debe sonar natural, ' +
      'en español peruano, tutear si el cliente tutea, sin emojis excesivos, y avanzar la venta (resolver dudas, proponer fecha de ' +
      'instalación o pedir confirmación). Nunca inventes precios que no aparezcan en la conversación.',
    user:
      `Contacto en el CRM: ${context.name} · etapa actual: ${context.stage}` +
      (context.notes ? ` · notas: ${context.notes}` : '') +
      `\n\nConversación:\n"""${chat.trim()}"""`,
  })
}
