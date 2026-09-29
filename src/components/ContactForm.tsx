import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { STAGES, type Contact, type StageId } from '../types'
import { formatPhone, isValidPhone, normalizePhone } from '../phone'
import { createContact, updateContact } from '../data'
import { errorMessage, useToast } from './toast'

export function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && !seen.has(t) && (seen.add(t), true))
}

export function ContactForm({
  contact,
  contacts,
  onClose,
  onSaved,
}: {
  contact?: Contact
  contacts: Contact[]
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact ? formatPhone(contact.phone) : '')
  const [handle, setHandle] = useState(contact?.handle ?? '')
  const [stage, setStage] = useState<StageId>(contact?.stage ?? 'nuevo')
  const [tags, setTags] = useState(contact?.tags.join(', ') ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')

  const digits = normalizePhone(phone)
  const phoneOk = isValidPhone(digits)
  const duplicate = phoneOk ? contacts.find((c) => c.phone === digits && c.id !== contact?.id) : undefined
  // El número es opcional si hay alias de Messenger; si se escribe, tiene que estar completo.
  const reachOk = phone.trim() ? phoneOk : Boolean(handle.trim())
  const canSave = Boolean(name.trim()) && reachOk

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    const input = {
      name: name.trim(),
      phone: phone.trim() ? digits : '',
      handle: handle.trim(),
      stage,
      tags: parseTags(tags),
      notes: notes.trim(),
    }
    // Con la caché offline la escritura se confirma al volver la señal, así que
    // no se espera al servidor para cerrar: los errores llegan por aviso.
    const report = (err: unknown) => toast(errorMessage(err), 'error')
    if (contact) {
      updateContact(contact.id, input).catch(report)
      onSaved?.(contact.id)
    } else {
      const { id, saved } = createContact(input)
      saved.catch(report)
      onSaved?.(id)
    }
    toast(contact ? 'Contacto actualizado' : 'Contacto creado')
    onClose()
  }

  return (
    <Modal
      title={contact ? 'Editar contacto' : 'Nuevo contacto'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="contact-form" className="btn btn-primary" disabled={!canSave}>
            Guardar
          </button>
        </>
      }
    >
      <form id="contact-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>Nombre</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Pedro Ramírez" required />
        </label>
        <label className="field">
          <span>Celular / WhatsApp</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => phoneOk && setPhone(formatPhone(digits))}
            placeholder="931 324 454"
            inputMode="tel"
            autoComplete="tel"
          />
          <small className={phone && !phoneOk ? 'hint hint-error' : 'hint'}>
            {phone && !phoneOk
              ? 'Número incompleto'
              : duplicate
                ? `Ojo: ya existe "${duplicate.name}" con este número`
                : 'Sin código se asume Perú (+51). Opcional si llegó por Messenger.'}
          </small>
        </label>
        <label className="field">
          <span>Messenger / Facebook</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@usuario, enlace del perfil o nombre en Messenger"
            autoComplete="off"
          />
          <small className={!phone.trim() && !handle.trim() && name.trim() ? 'hint hint-error' : 'hint'}>
            {!phone.trim() && !handle.trim() && name.trim()
              ? 'Pon el celular o, si llegó por Facebook, su alias de Messenger.'
              : 'Sin número, el contacto se atiende por Messenger: la cotización se descarga para enviarla allí.'}
          </small>
        </label>
        <div className="field">
          <span>Etapa</span>
          <div className="stage-picker">
            {STAGES.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`chip${stage === s.id ? ' chip-on' : ''}`}
                style={{ '--c': s.color } as React.CSSProperties}
                onClick={() => setStage(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Etiquetas</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="domótica, chorrillos, vip" />
          <small className="hint">Separadas por coma</small>
        </label>
        <label className="field">
          <span>Notas</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interesado en SONOFF Mini R4…" />
        </label>
      </form>
    </Modal>
  )
}
