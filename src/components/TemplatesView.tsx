import { useState } from 'react'
import { IconEdit, IconPlus, IconTrash } from './icons'
import { Modal } from './Modal'
import { errorMessage, useToast } from './toast'
import { deleteTemplate, saveTemplate } from '../data'
import { fillTemplate } from '../whatsapp'
import type { Template } from '../types'

const SAMPLE = { name: 'Pedro Ramírez', number: '2026-2809-1', total: 'S/ 160.00' }

export function TemplatesView({ templates }: { templates: Template[] }) {
  const toast = useToast()
  const [editing, setEditing] = useState<{ id?: string; name: string; body: string } | null>(null)

  function save() {
    if (!editing || !editing.name.trim() || !editing.body.trim()) return
    saveTemplate({ ...editing, name: editing.name.trim(), body: editing.body.trim() }).catch((err) =>
      toast(errorMessage(err), 'error'),
    )
    toast('Plantilla guardada')
    setEditing(null)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Plantillas de mensaje</h2>
          <p className="muted small">
            Variables: <code>{'{nombre}'}</code> (primer nombre), <code>{'{nombre_completo}'}</code>,{' '}
            <code>{'{numero}'}</code> y <code>{'{total}'}</code> de la cotización (si envías sin cotización, esas
            líneas se quitan).
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ name: '', body: 'Hola {nombre}, ' })}>
          <IconPlus /> Nueva
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="empty">No hay plantillas.</p>
      ) : (
        <div className="template-list">
          {templates.map((t) => (
            <article key={t.id} className="card template-card">
              <header>
                <h3>{t.name}</h3>
                <span>
                  <button className="icon-btn" onClick={() => setEditing(t)} aria-label="Editar">
                    <IconEdit width={16} height={16} />
                  </button>
                  <button
                    className="icon-btn icon-danger"
                    onClick={() =>
                      confirm(`¿Eliminar la plantilla "${t.name}"?`) &&
                      deleteTemplate(t.id).catch((err) => toast(errorMessage(err), 'error'))
                    }
                    aria-label="Eliminar"
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </span>
              </header>
              <p className="bubble">{fillTemplate(t.body, SAMPLE)}</p>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id ? 'Editar plantilla' : 'Nueva plantilla'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={!editing.name.trim() || !editing.body.trim()}
              >
                Guardar
              </button>
            </>
          }
        >
          <div className="form">
            <label className="field">
              <span>Nombre</span>
              <input
                autoFocus
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Cotización"
              />
            </label>
            <label className="field">
              <span>Mensaje</span>
              <textarea
                rows={6}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </label>
            <div className="field">
              <span>Vista previa</span>
              <p className="bubble">{fillTemplate(editing.body, SAMPLE) || '…'}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
