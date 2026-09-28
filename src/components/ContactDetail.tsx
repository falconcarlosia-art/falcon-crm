import { useState } from 'react'
import { IconBack, IconCopy, IconEdit, IconFile, IconPhone, IconSparkle, IconTrash, IconWhatsApp } from './icons'
import { dmy, money, QUOTE_STATUS, setQuoteStatus, useQuotes, type Quote, type QuoteStatus } from '../quotes'
import { errorMessage, useToast } from './toast'
import {
  deleteContact,
  deleteImage,
  followUpDate,
  moveImageToLibrary,
  setFollowUp,
  updateContact,
  useSends,
} from '../data'
import { formatPhone } from '../phone'
import { fullDate, initials } from '../format'
import { STAGES, stageOf, type Contact, type ImageItem } from '../types'

export function ContactDetail({
  contact,
  images,
  onBack,
  onEdit,
  onSend,
  onQuote,
  onDuplicate,
  onAnalyze,
}: {
  contact: Contact
  images: ImageItem[]
  onBack: () => void
  onEdit: () => void
  onSend: (imageId?: string) => void
  onQuote: () => void
  onDuplicate: (q: Quote) => void
  onAnalyze: () => void
}) {
  const toast = useToast()
  const sends = useSends(contact.id)
  const quotes = useQuotes(contact.id)
  const [notes, setNotes] = useState(contact.notes)
  const own = images.filter((i) => i.contactId === contact.id)
  const stage = stageOf(contact.stage)

  const report = (err: unknown) => toast(errorMessage(err), 'error')
  const followUp = contact.followUpAt?.toDate() ?? null

  function changeQuoteStatus(q: Quote, status: QuoteStatus) {
    setQuoteStatus(q.id, status).catch(report)
    // Aceptar la cotización cierra la venta: el contacto pasa a Ganado.
    if (status === 'aceptada' && contact.stage !== 'ganado') {
      updateContact(contact.id, { stage: 'ganado' }).catch(report)
      setFollowUp(contact.id, null).catch(report)
      toast('Cotización aceptada: contacto marcado como Ganado')
    }
  }

  function saveNotes() {
    if (notes.trim() === contact.notes) return
    updateContact(contact.id, { notes: notes.trim() }).catch((err) => toast(errorMessage(err), 'error'))
    toast('Notas guardadas')
  }

  async function remove() {
    if (!confirm(`¿Eliminar a ${contact.name}? Se borran también su historial y sus imágenes.`)) return
    onBack()
    try {
      await deleteContact(contact.id, images)
      toast('Contacto eliminado')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="detail">
      <div className="detail-top">
        <button className="icon-btn detail-back" onClick={onBack} aria-label="Volver">
          <IconBack />
        </button>
        <div className="avatar avatar-lg" style={{ background: stage.color }}>
          {initials(contact.name)}
        </div>
        <div className="detail-id">
          <h2>{contact.name}</h2>
          <a className="muted" href={`tel:+${contact.phone}`}>
            {formatPhone(contact.phone)}
          </a>
        </div>
        <div className="detail-tools">
          <button className="icon-btn" onClick={onEdit} aria-label="Editar">
            <IconEdit />
          </button>
          <button className="icon-btn icon-danger" onClick={remove} aria-label="Eliminar">
            <IconTrash />
          </button>
        </div>
      </div>

      <div className="detail-actions">
        <button className="btn btn-wa btn-lg" onClick={() => onSend()}>
          <IconWhatsApp />
          Enviar por WhatsApp
        </button>
        <a className="btn btn-ghost btn-lg" href={`tel:+${contact.phone}`}>
          <IconPhone />
          Llamar
        </a>
        <button className="btn btn-primary btn-lg" onClick={onQuote}>
          <IconFile />
          Nueva cotización
        </button>
        <button className="btn btn-ghost btn-lg" onClick={onAnalyze} title="Analizar conversación con IA">
          <IconSparkle />
          Analizar chat
        </button>
      </div>

      <section className="card">
        <h3 className="section-title">Próximo seguimiento</h3>
        <div className="followup-row">
          <input
            type="date"
            value={followUp ? toISO(followUp) : ''}
            onChange={(e) =>
              setFollowUp(contact.id, e.target.value ? new Date(`${e.target.value}T09:00:00`) : null).catch(report)
            }
            aria-label="Fecha de seguimiento"
          />
          {[1, 3, 7].map((d) => (
            <button
              key={d}
              className="btn btn-ghost btn-sm"
              onClick={() => setFollowUp(contact.id, followUpDate(d)).catch(report)}
            >
              {d === 1 ? 'Mañana' : d === 3 ? '+3 días' : '+1 semana'}
            </button>
          ))}
          {followUp && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFollowUp(contact.id, null).catch(report)}>
              Hecho
            </button>
          )}
        </div>
      </section>

      {quotes.length > 0 && (
        <section className="card">
          <h3 className="section-title">Cotizaciones</h3>
          <ul className="quote-list">
            {quotes.map((q) => (
              <li key={q.id}>
                <a href={q.imageUrl} target="_blank" rel="noreferrer" className="quote-thumb">
                  <img src={q.imageUrl} alt="" loading="lazy" />
                </a>
                <div className="quote-info">
                  <b>Nº {q.number}</b>
                  <span className="muted small">
                    {dmy(q.issueDate)} · {q.items.length} ítem{q.items.length === 1 ? '' : 's'} · {money(q.total)}
                  </span>
                  <span className="quote-links">
                    <a href={q.imageUrl} target="_blank" rel="noreferrer">PNG</a>
                    <a href={q.pdfUrl} target="_blank" rel="noreferrer">PDF</a>
                    <button className="link-btn" onClick={() => onDuplicate(q)}>
                      <IconCopy width={13} height={13} /> Duplicar
                    </button>
                  </span>
                  <span className="status-row">
                    {(Object.keys(QUOTE_STATUS) as QuoteStatus[]).map((st) => (
                      <button
                        key={st}
                        className={`chip chip-xs${(q.status ?? 'pendiente') === st ? ' chip-on' : ''}`}
                        style={{ '--c': QUOTE_STATUS[st].color } as React.CSSProperties}
                        onClick={() => (q.status ?? 'pendiente') !== st && changeQuoteStatus(q, st)}
                      >
                        {QUOTE_STATUS[st].label}
                      </button>
                    ))}
                  </span>
                </div>
                <button className="wa-quick" onClick={() => onSend(q.imageId)} aria-label={`Enviar cotización ${q.number}`}>
                  <IconWhatsApp />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3 className="section-title">Etapa</h3>
        <div className="stage-picker">
          {STAGES.map((s) => (
            <button
              key={s.id}
              className={`chip${contact.stage === s.id ? ' chip-on' : ''}`}
              style={{ '--c': s.color } as React.CSSProperties}
              onClick={() =>
                s.id !== contact.stage &&
                updateContact(contact.id, { stage: s.id }).catch((err) => toast(errorMessage(err), 'error'))
              }
            >
              {s.label}
            </button>
          ))}
        </div>
        {contact.tags.length > 0 && (
          <div className="tag-row">
            {contact.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">Notas</h3>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Qué le interesa, acuerdos, próximos pasos…"
        />
      </section>

      {own.length > 0 && (
        <section className="card">
          <h3 className="section-title">Imágenes de este contacto</h3>
          <div className="thumb-grid">
            {own.map((img) => (
              <div key={img.id} className="thumb thumb-static">
                <a href={img.url} target="_blank" rel="noreferrer">
                  <img src={img.url} alt={img.name} loading="lazy" />
                </a>
                <span className="thumb-label">{img.name}</span>
                <div className="thumb-tools">
                  <button onClick={() => onSend(img.id)} title="Enviar">
                    <IconWhatsApp width={16} height={16} />
                  </button>
                  <button
                    onClick={() =>
                      moveImageToLibrary(img.id)
                        .then(() => toast('Movida a la biblioteca'))
                        .catch((err) => toast(errorMessage(err), 'error'))
                    }
                    title="Mover a la biblioteca"
                  >
                    ★
                  </button>
                  <button
                    onClick={() =>
                      confirm(`¿Eliminar "${img.name}"? El enlace ya enviado dejará de funcionar.`) &&
                      deleteImage(img).catch((err) => toast(errorMessage(err), 'error'))
                    }
                    title="Eliminar"
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h3 className="section-title">Historial de envíos</h3>
        {sends.loading ? (
          <p className="muted small">Cargando…</p>
        ) : sends.data.length === 0 ? (
          <p className="muted small">Todavía no le has enviado nada.</p>
        ) : (
          <ol className="timeline">
            {sends.data.map((s) => (
              <li key={s.id}>
                <div className="timeline-head">
                  <b>{s.templateName ?? 'Mensaje'}</b>
                  <span className="muted small">
                    {fullDate(s.sentAt)} · {s.channel === 'share' ? 'imagen compartida' : 'chat abierto'}
                  </span>
                </div>
                <div className="timeline-body">
                  {s.imageUrl && (
                    <a href={s.imageUrl} target="_blank" rel="noreferrer" className="timeline-img">
                      <img src={s.imageUrl} alt={s.imageName ?? ''} loading="lazy" />
                    </a>
                  )}
                  <p className="timeline-msg">{s.message}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function toISO(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
