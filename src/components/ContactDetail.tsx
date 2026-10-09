import { useState } from 'react'
import { IconBack, IconCopy, IconEdit, IconFile, IconPhone, IconSparkle, IconMessenger, IconTrash, IconWhatsApp } from './icons'
import {
  dmy,
  money,
  QUOTE_STATUS,
  setQuoteStatus,
  useQuotes,
  type CompanySettings,
  type Quote,
  type QuoteStatus,
} from '../quotes'
import { errorMessage, useToast } from './toast'
import {
  deleteContact,
  followUpDate,
  setFollowUp,
  updateContact,
  useSends,
} from '../data'
import { formatPhone, hasWhatsApp, messengerLink } from '../phone'
import { ReachIcon, reachClass } from './ReachIcon'
import { downloadBlob } from '../files'
import { renderQuoteFiles } from '../renderQuote'
import { fullDate, initials } from '../format'
import { STAGES, stageOf, type Contact } from '../types'

export function ContactDetail({
  contact,
  company,
  onBack,
  onEdit,
  onSend,
  onQuote,
  onDuplicate,
  onAnalyze,
}: {
  contact: Contact
  company: CompanySettings
  onBack: () => void
  onEdit: () => void
  /** Abre el envío; con quoteId, adjuntando esa cotización. */
  onSend: (quoteId?: string) => void
  onQuote: () => void
  onDuplicate: (q: Quote) => void
  onAnalyze: () => void
}) {
  const toast = useToast()
  const sends = useSends(contact.id)
  const quotes = useQuotes(contact.id)
  const [notes, setNotes] = useState(contact.notes)
  const [busyQuote, setBusyQuote] = useState<string | null>(null)
  const stage = stageOf(contact.stage)

  const report = (err: unknown) => toast(errorMessage(err), 'error')
  const followUp = contact.followUpAt?.toDate() ?? null
  const wa = hasWhatsApp(contact)
  const mLink = messengerLink(contact.handle)

  /** Imagen y PDF no están guardados: se vuelven a dibujar desde los datos. */
  async function downloadQuote(q: Quote, kind: 'img' | 'pdf') {
    setBusyQuote(q.id)
    try {
      const f = await renderQuoteFiles(q, company)
      // "Imagen" baja una por página (cotización y portafolio).
      for (const file of kind === 'img' ? f.images : [f.pdf]) downloadBlob(file, file.name)
      URL.revokeObjectURL(f.previewUrl)
    } catch (err) {
      report(err)
    } finally {
      setBusyQuote(null)
    }
  }

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
    if (!confirm(`¿Eliminar a ${contact.name}? Se borra también su historial de envíos.`)) return
    onBack()
    try {
      await deleteContact(contact.id)
      toast('Contacto eliminado')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="detail">
      <button className="detail-backbar show-mobile" onClick={onBack}>
        <IconBack width={18} height={18} /> Contactos
      </button>
      <div className="detail-top">
        <div className="avatar avatar-lg" style={{ background: stage.color }}>
          {initials(contact.name)}
        </div>
        <div className="detail-id">
          <h2>{contact.name}</h2>
          {wa && (
            <a className="muted" href={`tel:+${contact.phone}`}>
              {formatPhone(contact.phone)}
            </a>
          )}
          {contact.handle?.trim() &&
            (mLink ? (
              <a className="muted small detail-handle" href={mLink} target="_blank" rel="noopener">
                <IconMessenger width={14} height={14} /> {contact.handle}
              </a>
            ) : (
              <span className="muted small detail-handle">
                <IconMessenger width={14} height={14} /> {contact.handle}
              </span>
            ))}
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

      {!wa && (
        <p className="no-wa-note">
          Sin WhatsApp: la cotización se descarga (o se comparte) para enviarla por Messenger. Cuando te pase su
          número, agrégalo con <b>Editar</b> y se activa WhatsApp.
        </p>
      )}

      <div className="detail-actions">
        {wa ? (
          <button className="btn btn-wa btn-lg" onClick={() => onSend()}>
            <IconWhatsApp />
            <span>
              <span className="hide-mobile">Enviar por </span>WhatsApp
            </span>
          </button>
        ) : (
          <button className="btn btn-ghost btn-lg" onClick={() => onSend()}>
            <IconMessenger />
            Preparar envío
          </button>
        )}
        {wa ? (
          <a className="btn btn-ghost btn-lg" href={`tel:+${contact.phone}`}>
            <IconPhone />
            Llamar
          </a>
        ) : (
          mLink && (
            <a className="btn btn-ghost btn-lg" href={mLink} target="_blank" rel="noopener">
              <IconMessenger />
              Abrir Messenger
            </a>
          )
        )}
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
                <span className="quote-icon">
                  <IconFile />
                </span>
                <div className="quote-info">
                  <b>Nº {q.number}</b>
                  <span className="muted small">
                    {dmy(q.issueDate)} · {q.items.length} ítem{q.items.length === 1 ? '' : 's'} · {money(q.total)}
                  </span>
                  <span className="quote-links">
                    <button className="link-btn" onClick={() => downloadQuote(q, 'pdf')} disabled={busyQuote === q.id}>
                      PDF
                    </button>
                    <button className="link-btn" onClick={() => downloadQuote(q, 'img')} disabled={busyQuote === q.id}>
                      Imágenes
                    </button>
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
                <button
                  className={`wa-quick${reachClass(contact)}`}
                  onClick={() => onSend(q.id)}
                  aria-label={`Enviar cotización ${q.number}`}
                >
                  <ReachIcon contact={contact} />
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
                    {fullDate(s.sentAt)} · {s.channel === 'share'
                      ? 'compartido desde el celular'
                      : s.channel === 'manual'
                        ? 'preparado para Messenger'
                        : 'chat abierto'}
                  </span>
                </div>
                <div className="timeline-body">
                  {s.quoteNumber && (
                    <span className="timeline-quote">
                      <IconFile width={14} height={14} /> Nº {s.quoteNumber}
                    </span>
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
