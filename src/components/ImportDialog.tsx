import { useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { IconUpload } from './icons'
import { errorMessage, useToast } from './toast'
import { createContacts } from '../data'
import { formatPhone, isValidPhone, normalizePhone } from '../phone'
import { parseTags } from './ContactForm'
import { STAGES, type Contact, type StageId } from '../types'
import { rowsToCandidates, splitText } from '../importParse'

type Row = { name: string; phone: string; status: 'ok' | 'dup' | 'invalid' }

export function ImportDialog({ contacts, onClose }: { contacts: Contact[]; onClose: () => void }) {
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<string[][]>([])
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [stage, setStage] = useState<StageId>('nuevo')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)

  const preview: Row[] = useMemo(() => {
    const source = rows.length ? rows : splitText(text)
    const existing = new Set(contacts.map((c) => c.phone))
    const seen = new Set<string>()
    return rowsToCandidates(source).map(({ name, rawPhone }) => {
      const phone = normalizePhone(rawPhone)
      const status: Row['status'] = !name.trim() || !isValidPhone(phone) ? 'invalid' : existing.has(phone) || seen.has(phone) ? 'dup' : 'ok'
      seen.add(phone)
      return { name: name.trim(), phone, status }
    })
  }, [rows, text, contacts])

  const ok = preview.filter((r) => r.status === 'ok')

  async function readFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setText('')
    try {
      if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
        // SheetJS solo se descarga al importar un Excel.
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer())
        const sheet = wb.Sheets[wb.SheetNames[0]]
        setRows(XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }))
      } else {
        setRows(splitText(await file.text()))
      }
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  async function run() {
    setBusy(true)
    try {
      const tagList = parseTags(tags)
      await createContacts(ok.map((r) => ({ name: r.name, phone: r.phone, stage, tags: tagList, notes: '' })))
      toast(`${ok.length} contacto${ok.length === 1 ? '' : 's'} importado${ok.length === 1 ? '' : 's'}`)
      onClose()
    } catch (err) {
      toast(errorMessage(err), 'error')
      setBusy(false)
    }
  }

  const counts = {
    dup: preview.filter((r) => r.status === 'dup').length,
    invalid: preview.filter((r) => r.status === 'invalid').length,
  }

  return (
    <Modal
      wide
      title="Importar contactos"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={run} disabled={busy || ok.length === 0}>
            {busy ? 'Importando…' : `Importar ${ok.length} contacto${ok.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="import-grid">
        <section className="form">
          <div className="field">
            <span>Desde un archivo</span>
            <button className="dropzone dropzone-sm" onClick={() => fileInput.current?.click()}>
              <IconUpload />
              {fileName || 'Elegir Excel o CSV'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.txt,.tsv,.xlsx,.xls,.ods"
              hidden
              onChange={(e) => {
                void readFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <small className="hint">Se detectan solas las columnas de nombre y celular.</small>
          </div>
          <label className="field">
            <span>…o pega la lista</span>
            <textarea
              rows={6}
              value={text}
              placeholder={'Pedro Ramírez, 931 324 454\nMaría Quispe; 987654321\n…'}
              onChange={(e) => {
                setText(e.target.value)
                setRows([])
                setFileName('')
              }}
            />
          </label>
          <div className="qe-row">
            <label className="field">
              <span>Etapa</span>
              <select value={stage} onChange={(e) => setStage(e.target.value as StageId)}>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Etiquetas</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="feria-2026" />
            </label>
          </div>
        </section>

        <section>
          <h3 className="section-title">
            Vista previa · {ok.length} nuevos
            {counts.dup > 0 && ` · ${counts.dup} ya existen`}
            {counts.invalid > 0 && ` · ${counts.invalid} con datos incompletos`}
          </h3>
          {preview.length === 0 ? (
            <p className="muted small">Sube un archivo o pega la lista para ver aquí lo que se importará.</p>
          ) : (
            <div className="import-table">
              <table>
                <tbody>
                  {preview.slice(0, 200).map((r, i) => (
                    <tr key={i} className={`imp-${r.status}`}>
                      <td>{r.name || <i className="muted">sin nombre</i>}</td>
                      <td>{isValidPhone(r.phone) ? formatPhone(r.phone) : <i className="muted">sin número válido</i>}</td>
                      <td className="imp-status">
                        {r.status === 'ok' ? 'Nuevo' : r.status === 'dup' ? 'Ya existe' : 'Se omite'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 200 && <p className="muted small">…y {preview.length - 200} filas más.</p>}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
