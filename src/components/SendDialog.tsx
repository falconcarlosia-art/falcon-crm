import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { IconCopy, IconFile, IconMessenger, IconShare, IconWhatsApp } from './icons'
import { errorMessage, useToast } from './toast'
import { recordSend } from '../data'
import { downloadBlob, type QuoteFiles } from '../files'
import { renderQuoteFiles } from '../renderQuote'
import { contactLine, hasWhatsApp, messengerLink } from '../phone'
import { dmy, money, type CompanySettings, type Quote } from '../quotes'
import { canShareFiles, copyText, fillTemplate, waLink } from '../whatsapp'
import type { Contact, Template } from '../types'

const EARLY_STAGES = new Set(['nuevo', 'contactado'])
const FOLLOW_UP_OPTIONS = [
  { value: '', label: 'No recordar' },
  { value: '1', label: 'Mañana' },
  { value: '3', label: 'En 3 días' },
  { value: '7', label: 'En 1 semana' },
]

export function SendDialog({
  contact,
  templates,
  quotes,
  company,
  initialQuoteId,
  initialQuote,
  initialFiles,
  initialTemplateName,
  initialMessage,
  onClose,
}: {
  contact: Contact
  templates: Template[]
  /** Cotizaciones del contacto, para adjuntar una. */
  quotes: Quote[]
  company: CompanySettings
  initialQuoteId?: string
  /** Cotización recién creada: puede no haber llegado aún por el snapshot. */
  initialQuote?: Quote
  /** Archivos ya generados (recién salidos del editor), para no volver a dibujarlos. */
  initialFiles?: QuoteFiles
  initialTemplateName?: string
  /** Texto ya redactado (p. ej. la respuesta sugerida por la IA): se respeta hasta cambiar plantilla o cotización. */
  initialMessage?: string
  onClose: () => void
}) {
  const toast = useToast()
  const shareSupported = useMemo(canShareFiles, [])
  const [quoteId, setQuoteId] = useState<string | null>(initialQuote?.id ?? initialQuoteId ?? null)
  const [files, setFiles] = useState<QuoteFiles | null>(initialFiles ?? null)
  const [preparing, setPreparing] = useState(false)
  const [templateId, setTemplateId] = useState<string>(
    (templates.find((t) => t.name === initialTemplateName) ?? templates[0])?.id ?? '',
  )
  const [message, setMessage] = useState(initialMessage ?? '')
  const [markQuoted, setMarkQuoted] = useState(EARLY_STAGES.has(contact.stage))
  const [followUp, setFollowUp] = useState('3')
  const filesFor = useRef<string | null>(initialFiles ? (initialQuote?.id ?? initialQuoteId ?? null) : null)

  const all = useMemo(
    () => (initialQuote && !quotes.some((q) => q.id === initialQuote.id) ? [initialQuote, ...quotes] : quotes),
    [quotes, initialQuote],
  )
  const recent = useMemo(() => all.slice(0, 6), [all])
  const quote = all.find((q) => q.id === quoteId) ?? null
  const template = templates.find((t) => t.id === templateId) ?? templates[0] ?? null

  // Cambiar plantilla o cotización rehace el mensaje; luego se puede editar a mano.
  // Con un mensaje inicial, la combinación de arranque ya "está aplicada".
  const selectionKey = `${template?.body ?? ''}|${quote?.id ?? ''}|${contact.name}`
  const lastSelection = useRef<string | null>(initialMessage ? selectionKey : null)
  useEffect(() => {
    if (lastSelection.current === selectionKey) return
    lastSelection.current = selectionKey
    setMessage(
      fillTemplate(template?.body ?? 'Hola {nombre}', {
        name: contact.name,
        number: quote?.number ?? null,
        total: quote ? money(quote.total) : null,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])

  // Imagen y PDF se generan al elegir la cotización (no están guardados). Se
  // preparan antes del clic porque navigator.share exige un gesto "fresco".
  useEffect(() => {
    if (!quote) {
      setFiles(null)
      filesFor.current = null
      return
    }
    if (filesFor.current === quote.id) return
    let alive = true
    setFiles(null)
    setPreparing(true)
    renderQuoteFiles(quote, company)
      .then((f) => {
        if (!alive) return URL.revokeObjectURL(f.previewUrl)
        filesFor.current = quote.id
        setFiles(f)
      })
      .catch((err) => alive && toast(errorMessage(err), 'error'))
      .finally(() => alive && setPreparing(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id])

  useEffect(
    () => () => {
      if (files) URL.revokeObjectURL(files.previewUrl)
    },
    [files],
  )

  const wa = hasWhatsApp(contact)
  const mLink = messengerLink(contact.handle)

  function log(channel: 'share' | 'chat' | 'manual', text: string) {
    recordSend(contact.id, {
      channel,
      message: text,
      quote: quote ? { id: quote.id, number: quote.number } : null,
      templateName: template?.name ?? null,
      stage: quote && markQuoted && EARLY_STAGES.has(contact.stage) ? 'cotizado' : undefined,
      followUpDays: followUp ? Number(followUp) : undefined,
    }).catch((err) => toast(errorMessage(err), 'error'))
  }

  /**
   * Alternativa en el celular: la hoja de Compartir con solo los archivos.
   * Sin texto: si van juntos, WhatsApp suele quedarse con el texto y descartar
   * los adjuntos. El mensaje queda copiado para pegarlo en el chat.
   */
  async function shareFiles() {
    if (!files) return
    const copied = await copyText(message)
    const all = [files.pdf, ...files.images]
    const payload = navigator.canShare?.({ files: all }) ? all : [files.pdf]
    try {
      await navigator.share({ files: payload })
      log('share', message)
      toast(copied ? 'Archivos enviados. El mensaje quedó copiado: pégalo en el chat.' : 'Archivos enviados')
      onClose()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast(errorMessage(err), 'error')
    }
  }

  /**
   * Abre el chat con el texto. Con cotización, antes descarga PDF e imagen para
   * adjuntarlos con el clip (wa.me solo acepta texto). Es el camino principal
   * también en el celular: es el único en que los archivos llegan siempre. Todo
   * va síncrono en el clic para que el navegador no bloquee la ventana.
   */
  function openChat(withDownloads: boolean) {
    if (withDownloads && files) {
      for (const f of [files.pdf, ...files.images]) downloadBlob(f, f.name)
    }
    window.open(waLink(contact.phone, message), '_blank', 'noopener')
    log('chat', message)
    if (withDownloads && files)
      toast(
        shareSupported
          ? 'Archivos descargados: en el chat toca el clip 📎 → Documento (PDF) o Galería (imágenes).'
          : 'Archivos descargados: adjúntalos en el chat (clip 📎).',
      )
    onClose()
  }

  /**
   * Sin WhatsApp (cliente de Messenger): descarga los archivos, copia el
   * mensaje y, si el alias es un usuario de Facebook, abre su chat de Messenger.
   */
  function prepareManual() {
    const copied = copyText(message) // se inicia dentro del clic, antes de abrir otra ventana
    if (files) for (const f of [files.pdf, ...files.images]) downloadBlob(f, f.name)
    if (mLink) window.open(mLink, '_blank', 'noopener')
    log('manual', message)
    void copied.then((ok) =>
      toast(
        files
          ? `Archivos descargados${ok ? ' y mensaje copiado' : ''}: adjúntalos en Messenger.`
          : ok
            ? 'Mensaje copiado: pégalo en Messenger.'
            : 'No se pudo copiar el mensaje',
      ),
    )
    onClose()
  }

  return (
    <Modal
      wide
      title={wa ? `Enviar a ${contact.name}` : `Preparar envío para ${contact.name}`}
      onClose={onClose}
      footer={
        <div className="send-actions">
          {quote && shareSupported && (
            <button className="btn btn-ghost" onClick={shareFiles} disabled={!files}>
              <IconShare />
              Compartir archivos
            </button>
          )}
          {!wa ? (
            <button className="btn btn-primary" onClick={prepareManual} disabled={(quote && !files) || !message.trim()}>
              {quote ? <IconFile /> : <IconCopy />}
              {quote && !files
                ? 'Preparando…'
                : `${quote ? 'Descargar y copiar mensaje' : 'Copiar mensaje'}${mLink ? ' · abrir Messenger' : ''}`}
            </button>
          ) : quote ? (
            <button className="btn btn-wa" onClick={() => openChat(true)} disabled={!files || !message.trim()}>
              <IconWhatsApp />
              {files ? 'Descargar y abrir WhatsApp' : 'Preparando…'}
            </button>
          ) : (
            <button className="btn btn-wa" onClick={() => openChat(false)} disabled={!message.trim()}>
              <IconWhatsApp />
              Abrir WhatsApp
            </button>
          )}
        </div>
      }
    >
      <div className="send-grid">
        <section>
          <h3 className="section-title">1. Adjuntar cotización</h3>
          <div className="quote-pick">
            <button className={`chip${quoteId === null ? ' chip-on' : ''}`} onClick={() => setQuoteId(null)}>
              Sin adjunto
            </button>
            {recent.map((q) => (
              <button key={q.id} className={`chip${quoteId === q.id ? ' chip-on' : ''}`} onClick={() => setQuoteId(q.id)}>
                Nº {q.number} · {money(q.total)}
              </button>
            ))}
          </div>
          <div className="send-preview">
            {!quote ? (
              <div className="send-preview-empty">
                {recent.length ? 'Solo se enviará el texto.' : 'Este contacto aún no tiene cotizaciones. Se enviará solo el texto.'}
              </div>
            ) : files ? (
              <img src={files.previewUrl} alt={`Cotización ${quote.number}`} />
            ) : (
              <div className="send-preview-empty">{preparing ? 'Generando PDF e imagen…' : ''}</div>
            )}
          </div>
          {quote && files && (
            <div className="attach-list">
              <span>
                <IconFile width={14} height={14} /> {files.pdf.name}
              </span>
              {files.images.map((f) => (
                <span key={f.name}>
                  <IconFile width={14} height={14} /> {f.name}
                </span>
              ))}
              <span className="muted">Emitida {dmy(quote.issueDate)}</span>
            </div>
          )}
        </section>

        <section>
          <h3 className="section-title">2. Mensaje</h3>
          {templates.length > 0 && (
            <div className="chip-row">
              {templates.map((t) => (
                <button
                  key={t.id}
                  className={`chip${template?.id === t.id ? ' chip-on' : ''}`}
                  onClick={() => setTemplateId(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="message-box"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Mensaje"
          />
          <p className="muted small">
            {!wa ? (
              <>
                <IconMessenger width={13} height={13} /> {contactLine(contact)}. Sin WhatsApp:{' '}
                {quote
                  ? 'se descargan el PDF y las imágenes y se copia el mensaje para enviarlos por Messenger.'
                  : 'se copia el mensaje para pegarlo en Messenger.'}
              </>
            ) : (
              <>
            Para {contactLine(contact)}.{' '}
            {!quote
              ? 'Se abrirá el chat con el texto listo.'
              : 'Se descargan el PDF y las imágenes y se abre el chat con el texto: adjúntalos con el clip 📎.'}
              </>
            )}
          </p>
          <label className="field-inline">
            <span>Recordar seguimiento</span>
            <select value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
              {FOLLOW_UP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {quote && EARLY_STAGES.has(contact.stage) && (
            <label className="check">
              <input type="checkbox" checked={markQuoted} onChange={(e) => setMarkQuoted(e.target.checked)} />
              Pasar el contacto a etapa <b>Cotizado</b>
            </label>
          )}
        </section>
      </div>
    </Modal>
  )
}
