import { useMemo, useState } from 'react'
import { IconPlus, IconSearch, IconWhatsApp } from './icons'
import { ContactDetail } from './ContactDetail'
import { ContactForm } from './ContactForm'
import { SendDialog } from './SendDialog'
import { QuoteEditor } from './QuoteEditor'
import type { CompanySettings } from '../quotes'
import { formatPhone } from '../phone'
import { initials, relDate } from '../format'
import { STAGES, stageOf, type Contact, type ImageItem, type Template } from '../types'

type Dialog =
  | { kind: 'new' }
  | { kind: 'edit'; contact: Contact }
  | { kind: 'send'; contact: Contact; image?: ImageItem; imageId?: string; templateName?: string }
  | { kind: 'quote'; contact: Contact }
  | null

export function ContactsView({
  contacts,
  loading,
  images,
  templates,
  settings,
}: {
  contacts: Contact[]
  loading: boolean
  images: ImageItem[]
  templates: Template[]
  settings: CompanySettings
}) {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<string>('todos')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const counts = useMemo(() => {
    const m: Record<string, number> = { todos: contacts.length }
    contacts.forEach((c) => (m[c.stage] = (m[c.stage] ?? 0) + 1))
    return m
  }, [contacts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '')
    const qDigits = q.replace(/\D/g, '')
    return contacts.filter((c) => {
      if (stage !== 'todos' && c.stage !== stage) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && c.phone.includes(qDigits)) ||
        c.tags.some((t) => t.includes(q)) ||
        c.notes.toLowerCase().includes(q)
      )
    })
  }, [contacts, search, stage])

  const selected = contacts.find((c) => c.id === selectedId) ?? null
  // El diálogo guarda una copia del contacto; se busca el vivo para ver cambios.
  const live = (c: Contact) => contacts.find((x) => x.id === c.id) ?? c

  return (
    <div className={`contacts${selected ? ' has-selection' : ''}`}>
      <div className="list-pane">
        <div className="toolbar">
          <label className="search">
            <IconSearch />
            <input
              type="search"
              placeholder="Buscar nombre, número, #etiqueta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className="btn btn-primary hide-mobile" onClick={() => setDialog({ kind: 'new' })}>
            <IconPlus /> Nuevo
          </button>
        </div>
        <div className="chip-row chip-scroll">
          {[{ id: 'todos', label: 'Todos', color: '#0f1724' }, ...STAGES].map((s) => (
            <button
              key={s.id}
              className={`chip${stage === s.id ? ' chip-on' : ''}`}
              style={{ '--c': s.color } as React.CSSProperties}
              onClick={() => setStage(s.id)}
            >
              {s.label} <span className="chip-count">{counts[s.id] ?? 0}</span>
            </button>
          ))}
        </div>

        {loading && contacts.length === 0 ? (
          <p className="empty">Cargando contactos…</p>
        ) : contacts.length === 0 ? (
          <div className="empty">
            <p>Aún no tienes contactos.</p>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: 'new' })}>
              <IconPlus /> Agregar el primero
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="empty">Sin resultados.</p>
        ) : (
          <ul className="contact-list">
            {filtered.map((c) => {
              const st = stageOf(c.stage)
              return (
                <li key={c.id} className={c.id === selectedId ? 'is-selected' : ''}>
                  <button className="contact-row" onClick={() => setSelectedId(c.id)}>
                    <span className="avatar" style={{ background: st.color }}>
                      {initials(c.name)}
                    </span>
                    <span className="contact-main">
                      <span className="contact-name">{c.name}</span>
                      <span className="contact-sub">
                        {formatPhone(c.phone)}
                        {c.lastSentAt && <> · enviado {relDate(c.lastSentAt)}</>}
                      </span>
                    </span>
                    <span className="stage-dot" style={{ '--c': st.color } as React.CSSProperties}>
                      {st.label}
                    </span>
                  </button>
                  <button
                    className="wa-quick"
                    onClick={() => setDialog({ kind: 'send', contact: c })}
                    aria-label={`Enviar WhatsApp a ${c.name}`}
                  >
                    <IconWhatsApp />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="detail-pane">
        {selected ? (
          <ContactDetail
            key={selected.id}
            contact={selected}
            images={images}
            onBack={() => setSelectedId(null)}
            onEdit={() => setDialog({ kind: 'edit', contact: selected })}
            onSend={(imageId) => setDialog({ kind: 'send', contact: selected, imageId })}
            onQuote={() => setDialog({ kind: 'quote', contact: selected })}
          />
        ) : (
          <div className="detail-empty">
            <IconWhatsApp width={48} height={48} />
            <p>Elige un contacto para ver su ficha, o toca el botón verde para enviarle una imagen por WhatsApp.</p>
          </div>
        )}
      </div>

      <button className="fab show-mobile" onClick={() => setDialog({ kind: 'new' })} aria-label="Nuevo contacto">
        <IconPlus width={26} height={26} />
      </button>

      {dialog?.kind === 'new' && (
        <ContactForm contacts={contacts} onClose={() => setDialog(null)} onSaved={setSelectedId} />
      )}
      {dialog?.kind === 'edit' && (
        <ContactForm contact={live(dialog.contact)} contacts={contacts} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'send' && (
        <SendDialog
          contact={live(dialog.contact)}
          images={images}
          templates={templates}
          initialImage={dialog.image}
          initialImageId={dialog.image?.id ?? dialog.imageId}
          initialTemplateName={dialog.templateName}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'quote' && (
        <QuoteEditor
          contact={live(dialog.contact)}
          company={settings}
          onClose={() => setDialog(null)}
          onGenerated={(image) =>
            setDialog({ kind: 'send', contact: dialog.contact, image, templateName: 'Cotización' })
          }
        />
      )}
    </div>
  )
}
