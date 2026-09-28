import { useMemo, useState } from 'react'
import { IconBoard, IconList, IconPlus, IconSearch, IconUpload, IconWhatsApp } from './icons'
import { BoardView } from './BoardView'
import { ContactDetail } from './ContactDetail'
import { ContactForm } from './ContactForm'
import { Dashboard } from './Dashboard'
import { ImportDialog } from './ImportDialog'
import { SendDialog } from './SendDialog'
import { QuoteEditor } from './QuoteEditor'
import type { CompanySettings, Quote } from '../quotes'
import { formatPhone } from '../phone'
import { initials, relDate } from '../format'
import { STAGES, stageOf, type Contact, type ImageItem, type Template } from '../types'

type Dialog =
  | { kind: 'new' }
  | { kind: 'edit'; contact: Contact }
  | { kind: 'import' }
  | { kind: 'send'; contact: Contact; image?: ImageItem; imageId?: string; templateName?: string }
  | { kind: 'quote'; contact: Contact; from?: Quote }
  | null

type View = 'list' | 'board'

function loadView(): View {
  try {
    return localStorage.getItem('crm-view') === 'board' ? 'board' : 'list'
  } catch {
    return 'list'
  }
}

export function ContactsView({
  contacts,
  loading,
  images,
  templates,
  settings,
  quotes,
}: {
  contacts: Contact[]
  loading: boolean
  images: ImageItem[]
  templates: Template[]
  settings: CompanySettings
  quotes: Quote[]
}) {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<string>('todos')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [view, setViewState] = useState<View>(loadView)

  const setView = (v: View) => {
    setViewState(v)
    try {
      localStorage.setItem('crm-view', v)
    } catch {
      /* preferencia opcional */
    }
  }

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
  const endToday = new Date().setHours(23, 59, 59, 999)
  const filtering = search.trim() !== '' || stage !== 'todos'

  const openContact = (id: string) => {
    setSelectedId(id)
    setView('list')
  }
  const followUp = (c: Contact) => setDialog({ kind: 'send', contact: c, templateName: 'Seguimiento' })

  const dashboard = (compact: boolean) => (
    <Dashboard contacts={contacts} quotes={quotes} compact={compact} onOpen={openContact} onFollowUp={followUp} />
  )

  const toolbar = (
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
      <div className="view-toggle hide-mobile" role="group" aria-label="Vista">
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="Lista">
          <IconList width={18} height={18} />
        </button>
        <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')} title="Tablero">
          <IconBoard width={18} height={18} />
        </button>
      </div>
      <button className="icon-btn icon-btn-bordered" onClick={() => setDialog({ kind: 'import' })} title="Importar contactos" aria-label="Importar contactos">
        <IconUpload width={18} height={18} />
      </button>
      <button
        className="btn btn-primary btn-new hide-mobile"
        onClick={() => setDialog({ kind: 'new' })}
        title="Nuevo contacto"
        aria-label="Nuevo contacto"
      >
        <IconPlus /> <span className="btn-label">Nuevo</span>
      </button>
    </div>
  )

  const stageChips = (
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
  )

  const dialogs = (
    <>
      {dialog?.kind === 'new' && (
        <ContactForm contacts={contacts} onClose={() => setDialog(null)} onSaved={openContact} />
      )}
      {dialog?.kind === 'edit' && (
        <ContactForm contact={live(dialog.contact)} contacts={contacts} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'import' && <ImportDialog contacts={contacts} onClose={() => setDialog(null)} />}
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
          contacts={dialog.from ? contacts : undefined}
          initial={dialog.from}
          company={settings}
          onClose={() => setDialog(null)}
          onGenerated={(image, target) => {
            setSelectedId(target.id)
            setDialog({ kind: 'send', contact: target, image, templateName: 'Cotización' })
          }}
        />
      )}
    </>
  )

  if (view === 'board') {
    return (
      <div className="contacts-board">
        {toolbar}
        <BoardView contacts={filtered} onOpen={openContact} onSend={(c) => setDialog({ kind: 'send', contact: c })} />
        {dialogs}
      </div>
    )
  }

  return (
    <div className={`contacts${selected ? ' has-selection' : ''}`}>
      <div className="list-pane">
        {toolbar}
        {/* En el celular el resumen va arriba de la lista; en escritorio ocupa el panel derecho. */}
        {!filtering && contacts.length > 0 && <div className="show-mobile-block">{dashboard(true)}</div>}
        {stageChips}

        {loading && contacts.length === 0 ? (
          <p className="empty">Cargando contactos…</p>
        ) : contacts.length === 0 ? (
          <div className="empty">
            <p>Aún no tienes contactos.</p>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: 'new' })}>
              <IconPlus /> Agregar el primero
            </button>
            <button className="btn btn-ghost" onClick={() => setDialog({ kind: 'import' })}>
              <IconUpload width={18} height={18} /> Importar desde Excel o CSV
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="empty">Sin resultados.</p>
        ) : (
          <ul className="contact-list">
            {filtered.map((c) => {
              const st = stageOf(c.stage)
              const due = c.followUpAt && c.followUpAt.toMillis() <= endToday
              return (
                <li key={c.id} className={c.id === selectedId ? 'is-selected' : ''}>
                  <button className="contact-row" onClick={() => setSelectedId(c.id)}>
                    <span className="avatar" style={{ background: st.color }}>
                      {initials(c.name)}
                    </span>
                    <span className="contact-main">
                      <span className="contact-name">{c.name}</span>
                      <span className="contact-sub">
                        {due ? (
                          <span className="due-overdue">● Toca seguimiento</span>
                        ) : (
                          <>
                            {formatPhone(c.phone)}
                            {c.lastSentAt && <> · enviado {relDate(c.lastSentAt)}</>}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="stage-dot" style={{ '--c': st.color } as React.CSSProperties}>
                      {st.label}
                    </span>
                  </button>
                  <button
                    className="wa-quick"
                    onClick={() => (due ? followUp(c) : setDialog({ kind: 'send', contact: c }))}
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
            onDuplicate={(q) => setDialog({ kind: 'quote', contact: selected, from: q })}
          />
        ) : (
          <div className="hide-mobile">{dashboard(false)}</div>
        )}
      </div>

      <button className="fab show-mobile" onClick={() => setDialog({ kind: 'new' })} aria-label="Nuevo contacto">
        <IconPlus width={26} height={26} />
      </button>

      {dialogs}
    </div>
  )
}
