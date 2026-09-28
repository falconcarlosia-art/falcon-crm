import { useMemo } from 'react'
import { IconCheck, IconWhatsApp } from './icons'
import { errorMessage, useToast } from './toast'
import { followUpDate, setFollowUp } from '../data'
import { initials } from '../format'
import { money, type Quote } from '../quotes'
import { stageOf, type Contact } from '../types'

const DAY = 86_400_000
const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0)).getTime()

function dueLabel(ms: number): { text: string; overdue: boolean } {
  const days = Math.round((startOfToday() - new Date(ms).setHours(0, 0, 0, 0)) / DAY)
  if (days <= 0) return { text: days === 0 ? 'hoy' : `en ${-days} d`, overdue: false }
  return { text: days === 1 ? 'venció ayer' : `venció hace ${days} d`, overdue: true }
}

export function useStats(contacts: Contact[], quotes: Quote[]) {
  return useMemo(() => {
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthQuotes = quotes.filter((q) => q.issueDate?.startsWith(monthKey))
    const pending = quotes.filter((q) => (q.status ?? 'pendiente') === 'pendiente')
    const won = quotes.filter((q) => q.status === 'aceptada').length
    const lost = quotes.filter((q) => q.status === 'rechazada').length
    // Sin cotizaciones cerradas todavía, la tasa sale de las etapas del contacto.
    const cWon = contacts.filter((c) => c.stage === 'ganado').length
    const cLost = contacts.filter((c) => c.stage === 'perdido').length
    const [w, l] = won + lost > 0 ? [won, lost] : [cWon, cLost]

    const endToday = startOfToday() + DAY
    const withDate = contacts
      .filter((c) => c.followUpAt)
      .map((c) => ({ contact: c, at: c.followUpAt!.toMillis() }))
      .sort((a, b) => a.at - b.at)
    const due = withDate.filter((x) => x.at < endToday)
    const upcoming = withDate.filter((x) => x.at >= endToday && x.at < endToday + 7 * DAY)

    return {
      monthTotal: monthQuotes.reduce((s, q) => s + (q.total || 0), 0),
      monthCount: monthQuotes.length,
      pendingTotal: pending.reduce((s, q) => s + (q.total || 0), 0),
      pendingCount: pending.length,
      closeRate: w + l > 0 ? Math.round((w / (w + l)) * 100) : null,
      closeBase: `${w} de ${w + l}`,
      due,
      upcoming,
    }
  }, [contacts, quotes])
}

export function Dashboard({
  contacts,
  quotes,
  compact,
  onOpen,
  onFollowUp,
}: {
  contacts: Contact[]
  quotes: Quote[]
  compact?: boolean
  onOpen: (id: string) => void
  onFollowUp: (c: Contact) => void
}) {
  const toast = useToast()
  const s = useStats(contacts, quotes)
  const report = (err: unknown) => toast(errorMessage(err), 'error')
  const month = new Intl.DateTimeFormat('es-PE', { month: 'long' }).format(new Date())

  return (
    <div className={`dash${compact ? ' dash-compact' : ''}`}>
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Cotizado en {month}</span>
          <strong className="kpi-value">{money(s.monthTotal)}</strong>
          <span className="kpi-sub">
            {s.monthCount} cotización{s.monthCount === 1 ? '' : 'es'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Por cerrar</span>
          <strong className="kpi-value">{money(s.pendingTotal)}</strong>
          <span className="kpi-sub">{s.pendingCount} pendientes de respuesta</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Seguimientos hoy</span>
          <strong className="kpi-value">{s.due.length}</strong>
          <span className="kpi-sub">{s.upcoming.length} en los próximos 7 días</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tasa de cierre</span>
          <strong className="kpi-value">{s.closeRate === null ? '—' : `${s.closeRate} %`}</strong>
          <span className="kpi-sub">{s.closeRate === null ? 'aún sin cierres' : `${s.closeBase} ganadas`}</span>
        </div>
      </div>

      <section className="card due-card">
        <h3 className="section-title">Hoy toca contactar</h3>
        {s.due.length === 0 ? (
          <p className="muted small due-empty">
            <IconCheck width={16} height={16} /> Nada pendiente para hoy.
            {s.upcoming.length > 0 && ` Próximo: ${s.upcoming[0].contact.name} (${dueLabel(s.upcoming[0].at).text}).`}
          </p>
        ) : (
          <ul className="due-list">
            {s.due.slice(0, compact ? 4 : 50).map(({ contact: c, at }) => {
              const d = dueLabel(at)
              return (
                <li key={c.id}>
                  <button className="due-main" onClick={() => onOpen(c.id)}>
                    <span className="avatar avatar-sm" style={{ background: stageOf(c.stage).color }}>
                      {initials(c.name)}
                    </span>
                    <span className="due-text">
                      <b>{c.name}</b>
                      <span className={d.overdue ? 'due-overdue' : 'muted'}>
                        {d.overdue ? '● ' : ''}
                        {d.text} · {stageOf(c.stage).label}
                      </span>
                    </span>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setFollowUp(c.id, followUpDate(3)).catch(report)}
                    title="Posponer 3 días"
                  >
                    +3 d
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setFollowUp(c.id, null).catch(report)}
                    title="Marcar como hecho"
                    aria-label={`Seguimiento de ${c.name} hecho`}
                  >
                    <IconCheck width={18} height={18} />
                  </button>
                  <button className="wa-quick" onClick={() => onFollowUp(c)} aria-label={`Escribir a ${c.name}`}>
                    <IconWhatsApp width={18} height={18} />
                  </button>
                </li>
              )
            })}
            {compact && s.due.length > 4 && <li className="muted small">y {s.due.length - 4} más…</li>}
          </ul>
        )}
      </section>

      {!compact && s.upcoming.length > 0 && (
        <section className="card">
          <h3 className="section-title">Próximos 7 días</h3>
          <ul className="due-list">
            {s.upcoming.map(({ contact: c, at }) => (
              <li key={c.id}>
                <button className="due-main" onClick={() => onOpen(c.id)}>
                  <span className="avatar avatar-sm" style={{ background: stageOf(c.stage).color }}>
                    {initials(c.name)}
                  </span>
                  <span className="due-text">
                    <b>{c.name}</b>
                    <span className="muted">{dueLabel(at).text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
