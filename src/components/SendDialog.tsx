import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { IconCheck, IconShare, IconUpload, IconWhatsApp } from './icons'
import { errorMessage, useToast } from './toast'
import { recordSend, shareUrl, uploadImage } from '../data'
import { formatPhone } from '../phone'
import { canShareFiles, copyText, fillTemplate, waLink } from '../whatsapp'
import type { Contact, ImageItem, Template } from '../types'

const EARLY_STAGES = new Set(['nuevo', 'contactado'])
const FOLLOW_UP_OPTIONS = [
  { value: '', label: 'No recordar' },
  { value: '1', label: 'Mañana' },
  { value: '3', label: 'En 3 días' },
  { value: '7', label: 'En 1 semana' },
]

export function SendDialog({
  contact,
  images,
  templates,
  initialImage,
  initialImageId,
  initialTemplateName,
  initialMessage,
  onClose,
}: {
  contact: Contact
  images: ImageItem[]
  templates: Template[]
  initialImage?: ImageItem
  initialImageId?: string
  initialTemplateName?: string
  /** Texto ya redactado (p. ej. la respuesta sugerida por la IA): se respeta hasta cambiar plantilla o imagen. */
  initialMessage?: string
  onClose: () => void
}) {
  const toast = useToast()
  const shareSupported = useMemo(canShareFiles, [])
  const [imageId, setImageId] = useState<string | null>(initialImageId ?? null)
  const [uploaded, setUploaded] = useState<{ item: ImageItem; file: File } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [templateId, setTemplateId] = useState<string>(
    (templates.find((t) => t.name === initialTemplateName) ?? templates[0])?.id ?? '',
  )
  const [message, setMessage] = useState(initialMessage ?? '')
  const [shareFile, setShareFile] = useState<File | null>(null)
  const [shareError, setShareError] = useState(false)
  const [markQuoted, setMarkQuoted] = useState(EARLY_STAGES.has(contact.stage))
  const [followUp, setFollowUp] = useState('3')
  const fileInput = useRef<HTMLInputElement>(null)

  // Imágenes de este contacto primero; luego la biblioteca general.
  const choices = useMemo(() => {
    const own = images.filter((i) => i.contactId === contact.id)
    const lib = images.filter((i) => i.contactId === null)
    const list = [...own, ...lib]
    if (uploaded && !list.some((i) => i.id === uploaded.item.id)) list.unshift(uploaded.item)
    // Una cotización recién generada puede no haber llegado aún por el snapshot.
    if (initialImage && !list.some((i) => i.id === initialImage.id)) list.unshift(initialImage)
    return list
  }, [images, contact.id, uploaded, initialImage])

  const image = choices.find((i) => i.id === imageId) ?? null
  const template = templates.find((t) => t.id === templateId) ?? templates[0] ?? null

  // Cambiar imagen o plantilla rehace el mensaje; luego se puede editar a mano.
  // Con un mensaje inicial, la combinación de arranque ya "está aplicada".
  const selectionKey = `${template?.body ?? ''}|${image?.id ?? ''}|${contact.name}`
  const lastSelection = useRef<string | null>(initialMessage ? selectionKey : null)
  useEffect(() => {
    if (lastSelection.current === selectionKey) return
    lastSelection.current = selectionKey
    const body = template?.body ?? 'Hola {nombre}\n{enlace}'
    setMessage(fillTemplate(body, { name: contact.name, link: image ? shareUrl(image) : null }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.body, image?.id, contact.name])

  // navigator.share exige el gesto del usuario "fresco": si se descargara la
  // imagen al pulsar, el navegador podría rechazarlo. Por eso se trae antes.
  useEffect(() => {
    setShareFile(null)
    setShareError(false)
    if (!image || !shareSupported) return
    if (uploaded?.item.id === image.id) return setShareFile(uploaded.file)
    let cancelled = false
    fetch(image.url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (cancelled) return
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        setShareFile(new File([blob], `${image.name}.${ext}`, { type: blob.type || 'image/png' }))
      })
      .catch(() => !cancelled && setShareError(true))
    return () => {
      cancelled = true
    }
  }, [image, uploaded, shareSupported])

  async function onPickFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Elige un archivo de imagen', 'error')
    setUploading(true)
    try {
      const item = await uploadImage(file, contact.id)
      setUploaded({ item, file })
      setImageId(item.id)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setUploading(false)
    }
  }

  function log(channel: 'share' | 'link', text: string) {
    recordSend(contact.id, {
      channel,
      message: text,
      image,
      templateName: template?.name ?? null,
      stage: markQuoted && EARLY_STAGES.has(contact.stage) ? 'cotizado' : undefined,
      followUpDays: followUp ? Number(followUp) : undefined,
    }).catch((err) => toast(errorMessage(err), 'error'))
  }

  function openWhatsApp() {
    // window.open debe ir directo en el clic o el navegador lo bloquea.
    window.open(waLink(contact.phone, message), '_blank', 'noopener')
    log('link', message)
    onClose()
  }

  async function shareImage() {
    if (!shareFile || !image) return
    // Al compartir, la imagen ya va adjunta: el enlace sobra en el texto.
    const text = message.replace(shareUrl(image), '').replace(image.url, '').replace(/\n{3,}/g, '\n\n').trim()
    // Algunas apps descartan el texto al recibir una imagen: queda en el
    // portapapeles para pegarlo como pie de foto si hiciera falta.
    const copied = await copyText(text)
    try {
      await navigator.share({ files: [shareFile], text, title: image.name })
      log('share', text)
      toast(copied ? 'Enviado. El mensaje también quedó copiado.' : 'Enviado')
      onClose()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast(errorMessage(err), 'error')
    }
  }

  return (
    <Modal
      wide
      title={`Enviar a ${contact.name}`}
      onClose={onClose}
      footer={
        <div className="send-actions">
          {shareSupported && image && (
            <button className="btn btn-dark" onClick={shareImage} disabled={!shareFile}>
              <IconShare />
              {shareFile ? 'Compartir imagen' : shareError ? 'No se pudo preparar' : 'Preparando…'}
            </button>
          )}
          <button className="btn btn-wa" onClick={openWhatsApp} disabled={!message.trim()}>
            <IconWhatsApp />
            Abrir WhatsApp
          </button>
        </div>
      }
    >
      <div className="send-grid">
        <section>
          <h3 className="section-title">1. Imagen referencial</h3>
          <div className="send-preview">
            {image ? (
              <a href={image.url} target="_blank" rel="noreferrer">
                <img src={image.url} alt={image.name} />
              </a>
            ) : (
              <div className="send-preview-empty">Sin imagen: solo se envía el texto</div>
            )}
            {image && <span className="send-preview-name">{image.name}</span>}
          </div>
          <div className="thumb-strip">
            <button className={`thumb thumb-none${imageId === null ? ' thumb-on' : ''}`} onClick={() => setImageId(null)}>
              Sin imagen
            </button>
            <button className="thumb thumb-upload" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <IconUpload />
              {uploading ? 'Subiendo…' : 'Subir'}
            </button>
            {choices.map((img) => (
              <button
                key={img.id}
                className={`thumb${imageId === img.id ? ' thumb-on' : ''}`}
                onClick={() => setImageId(img.id)}
                title={img.name}
              >
                <img src={img.url} alt={img.name} loading="lazy" />
                {img.contactId && <span className="thumb-star">★</span>}
                {imageId === img.id && (
                  <span className="thumb-check">
                    <IconCheck width={12} height={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void onPickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {choices.length === 0 && (
            <p className="muted small">Aún no hay imágenes. Sube una aquí o en la pestaña Biblioteca.</p>
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
            Para {formatPhone(contact.phone)}.{' '}
            {shareSupported
              ? '"Compartir imagen" adjunta la foto (eliges el chat en WhatsApp). "Abrir WhatsApp" abre este chat con el texto y el enlace.'
              : 'Se abrirá el chat con el texto listo; la imagen va como enlace. Desde el celular también puedes adjuntarla.'}
          </p>
          {shareError && (
            <p className="hint hint-error small">
              No se pudo descargar la imagen para compartirla (¿falta configurar CORS del bucket?). Usa
              "Abrir WhatsApp".
            </p>
          )}
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
          {EARLY_STAGES.has(contact.stage) && (
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
