import { useState } from 'react'
import { ReachIcon, reachClass, reachLabel } from './ReachIcon'
import { errorMessage, useToast } from './toast'
import { updateContact } from '../data'
import { contactLine } from '../phone'
import { initials, relDate } from '../format'
import { STAGES, type Contact, type StageId } from '../types'

/** Tablero por etapas: se arrastra la tarjeta a otra columna para cambiar la etapa. */
export function BoardView({
  contacts,
  onOpen,
  onSend,
}: {
  contacts: Contact[]
  onOpen: (id: string) => void
  onSend: (c: Contact) => void
}) {
  const toast = useToast()
  const [over, setOver] = useState<StageId | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const endToday = new Date().setHours(23, 59, 59, 999)

  function drop(stage: StageId) {
    setOver(null)
    const c = contacts.find((x) => x.id === dragId)
    setDragId(null)
    if (!c || c.stage === stage) return
    updateContact(c.id, { stage }).catch((err) => toast(errorMessage(err), 'error'))
  }

  return (
    <div className="board">
      {STAGES.map((s) => {
        const col = contacts.filter((c) => c.stage === s.id)
        return (
          <section
            key={s.id}
            className={`board-col${over === s.id ? ' board-over' : ''}`}
            style={{ '--c': s.color } as React.CSSProperties}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== s.id) setOver(s.id)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
            }}
            onDrop={() => drop(s.id)}
          >
            <header className="board-head">
              <span className="stage-dot" style={{ '--c': s.color } as React.CSSProperties}>
                {s.label}
              </span>
              <span className="chip-count">{col.length}</span>
            </header>
            <div className="board-cards">
              {col.map((c) => {
                const due = c.followUpAt && c.followUpAt.toMillis() <= endToday
                return (
                  <article
                    key={c.id}
                    className={`board-card${dragId === c.id ? ' dragging' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      setDragId(c.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOver(null)
                    }}
                    onClick={() => onOpen(c.id)}
                  >
                    <div className="board-card-top">
                      <span className="avatar avatar-sm" style={{ background: s.color }}>
                        {initials(c.name)}
                      </span>
                      <b>{c.name}</b>
                    </div>
                    <span className="muted small">{contactLine(c)}</span>
                    {(c.lastSentAt || due) && (
                      <span className="small board-meta">
                        {due ? <span className="due-overdue">● seguimiento pendiente</span> : <>enviado {relDate(c.lastSentAt)}</>}
                      </span>
                    )}
                    <button
                      className={`board-wa${reachClass(c)}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSend(c)
                      }}
                      aria-label={reachLabel(c)}
                      title={reachLabel(c)}
                    >
                      <ReachIcon contact={c} size={16} />
                    </button>
                  </article>
                )
              })}
              {col.length === 0 && <p className="board-empty">Arrastra aquí</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
