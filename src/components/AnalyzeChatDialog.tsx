import { useState } from 'react'
import { Modal } from './Modal'
import { IconSparkle, IconWhatsApp } from './icons'
import { errorMessage, useToast } from './toast'
import { aiReady, usd, type AiConfig } from '../ai'
import { analyzeChat, type AiChatAnalysis } from '../aiTasks'
import { followUpDate, setFollowUp, updateContact } from '../data'
import { parseTags } from './ContactForm'
import { stageOf, type Contact } from '../types'

type Picks = { name: boolean; stage: boolean; tags: boolean; notes: boolean; followUp: boolean }

/** Pegar una conversación de WhatsApp → propuestas para la ficha, que se aplican con un clic. */
export function AnalyzeChatDialog({
  contact,
  ai,
  onClose,
  onUseReply,
}: {
  contact: Contact
  ai: AiConfig
  onClose: () => void
  onUseReply: (text: string) => void
}) {
  const toast = useToast()
  const [chat, setChat] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ a: AiChatAnalysis; cost: number | null } | null>(null)
  const [pick, setPick] = useState<Picks>({ name: false, stage: true, tags: true, notes: true, followUp: true })
  const [reply, setReply] = useState('')
  const ready = aiReady(ai, 'chat')

  async function run() {
    setBusy(true)
    try {
      const { data, cost } = await analyzeChat(ai, chat, { name: contact.name, stage: contact.stage, notes: contact.notes })
      setRes({ a: data, cost })
      setReply(data.suggested_reply)
      setPick({
        // El nombre solo se propone si el chat trae uno más completo que el guardado.
        name: Boolean(data.client_name) && data.client_name.length > contact.name.length,
        stage: data.stage !== contact.stage,
        tags: data.tags.length > 0,
        notes: Boolean(data.notes),
        followUp: data.follow_up_days !== null,
      })
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    if (!res) return
    const { a } = res
    const patch: Parameters<typeof updateContact>[1] = {}
    if (pick.name && a.client_name) patch.name = a.client_name.trim()
    if (pick.stage) patch.stage = a.stage
    if (pick.tags) patch.tags = parseTags([...contact.tags, ...a.tags, a.district].filter(Boolean).join(','))
    if (pick.notes) {
      const stamp = new Date().toLocaleDateString('es-PE')
      patch.notes = [contact.notes, `[${stamp}] ${a.needs ? `${a.needs}. ` : ''}${a.notes}`].filter(Boolean).join('\n')
    }
    const report = (err: unknown) => toast(errorMessage(err), 'error')
    if (Object.keys(patch).length) updateContact(contact.id, patch).catch(report)
    if (pick.followUp && a.follow_up_days !== null) setFollowUp(contact.id, followUpDate(a.follow_up_days)).catch(report)
    toast('Ficha actualizada')
    onClose()
  }

  const a = res?.a
  const row = (key: keyof Picks, label: string, value: React.ReactNode, show = true) =>
    show && (
      <label className="ai-prop">
        <input type="checkbox" checked={pick[key]} onChange={(e) => setPick({ ...pick, [key]: e.target.checked })} />
        <span>
          <b>{label}</b>
          <span className="ai-prop-value">{value}</span>
        </span>
      </label>
    )

  return (
    <Modal
      wide
      title={`Analizar conversación · ${contact.name}`}
      onClose={onClose}
      footer={
        res ? (
          <>
            <button className="btn btn-ghost" onClick={() => onUseReply(reply)} disabled={!reply.trim()}>
              <IconWhatsApp width={18} height={18} /> Usar respuesta
            </button>
            <button className="btn btn-primary" onClick={apply} disabled={!Object.values(pick).some(Boolean)}>
              Aplicar a la ficha
            </button>
          </>
        ) : (
          <button className="btn btn-dark" onClick={run} disabled={!ready || busy || !chat.trim()}>
            <IconSparkle width={16} height={16} /> {busy ? 'Analizando…' : 'Analizar'}
          </button>
        )
      }
    >
      {!ready ? (
        <p className="muted">Configura la API key de OpenRouter y el modelo para analizar chats en Ajustes → Inteligencia artificial.</p>
      ) : !res ? (
        <label className="field">
          <span>Conversación</span>
          <textarea
            className="message-box"
            rows={10}
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            placeholder={'Copia el chat desde WhatsApp (mantén presionado → Copiar, o en WhatsApp Web selecciona los mensajes) y pégalo aquí.\n\n[27/9 10:14] Pedro: Hola, cuánto cuesta instalar interruptores inteligentes?…'}
          />
          <small className="hint">Solo se envía el texto que pegues. No incluyas datos que no quieras compartir con el modelo.</small>
        </label>
      ) : (
        a && (
          <div className="ai-analysis">
            <p className="ai-needs">
              <IconSparkle width={16} height={16} /> {a.needs || 'Sin necesidad clara en el chat.'}
            </p>
            <div className="ai-props">
              {row('name', 'Nombre', a.client_name, Boolean(a.client_name) && a.client_name !== contact.name)}
              {row(
                'stage',
                'Etapa',
                <>
                  {stageOf(contact.stage).label} → <b style={{ color: stageOf(a.stage).color }}>{stageOf(a.stage).label}</b>
                </>,
                a.stage !== contact.stage,
              )}
              {row('tags', 'Etiquetas', [...a.tags, a.district].filter(Boolean).map((t) => `#${t}`).join(' '), a.tags.length > 0 || Boolean(a.district))}
              {row('notes', 'Agregar a notas', a.notes, Boolean(a.notes))}
              {row(
                'followUp',
                'Seguimiento',
                a.follow_up_days === 0 ? 'hoy' : `en ${a.follow_up_days} día${a.follow_up_days === 1 ? '' : 's'}`,
                a.follow_up_days !== null,
              )}
            </div>
            <label className="field">
              <span>Respuesta sugerida (puedes editarla)</span>
              <textarea className="message-box" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
            </label>
            {res.cost !== null && <p className="muted small">Costo del análisis: {usd(res.cost)}</p>}
          </div>
        )
      )}
    </Modal>
  )
}
