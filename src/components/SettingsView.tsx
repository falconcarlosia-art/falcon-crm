import { useEffect, useRef, useState } from 'react'
import { IconUpload } from './icons'
import { errorMessage, useToast } from './toast'
import { saveSettings, toDataUrl, type CompanySettings, type QuoteConditions } from '../quotes'
import { productsConfigured } from '../supabase'

type TextKey = Exclude<keyof CompanySettings, 'yapeQr' | 'validityDays' | 'conditions'>

const COMPANY: [TextKey, string][] = [
  ['legalName', 'Razón social'],
  ['ruc', 'RUC'],
  ['phone', 'Teléfono'],
  ['web', 'Web'],
  ['fiscalAddress', 'Domicilio fiscal'],
  ['officeAddress', 'Oficina y almacén'],
]
const PAYMENT: [TextKey, string][] = [
  ['yapeName', 'Titular Yape'],
  ['bankLabel', 'Banco y tipo de cuenta'],
  ['account', 'Número de cuenta'],
  ['cci', 'CCI'],
  ['holder', 'Titular de la cuenta'],
  ['cardTitle', 'Título pago con tarjeta'],
  ['cardText', 'Texto pago con tarjeta'],
  ['footer', 'Frase del pie'],
]
const CONDS: [keyof QuoteConditions, string][] = [
  ['payment', 'Forma de pago'],
  ['delivery', 'Tiempo de entrega'],
  ['origin', 'Origen del envío'],
  ['warranty', 'Garantía'],
  ['stock', 'Validez del stock'],
  ['commercial', 'Condición comercial'],
]

export function SettingsView({ settings }: { settings: CompanySettings }) {
  const toast = useToast()
  const [form, setForm] = useState(settings)
  const [dirty, setDirty] = useState(false)
  const qrInput = useRef<HTMLInputElement>(null)

  // Si llegan cambios del servidor y no hay edición en curso, se reflejan.
  useEffect(() => {
    if (!dirty) setForm(settings)
  }, [settings, dirty])

  const set = (patch: Partial<CompanySettings>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  async function pickQr(file: File | undefined) {
    if (!file) return
    // Se guarda como data URL en Firestore: pesa poco y el render de la
    // cotización no depende del CORS del bucket.
    const data = await toDataUrl(file, 480)
    if (data) set({ yapeQr: data })
    else toast('No se pudo leer la imagen', 'error')
  }

  function save() {
    saveSettings(form).catch((err) => toast(errorMessage(err), 'error'))
    setDirty(false)
    toast('Ajustes guardados')
  }

  const text = (k: TextKey, label: string) => (
    <label key={k} className="field">
      <span>{label}</span>
      <input value={form[k]} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  )

  return (
    <div className="page settings">
      <div className="page-head">
        <div>
          <h2>Ajustes de cotización</h2>
          <p className="muted small">Datos que salen en todas las cotizaciones. Se cambian una sola vez aquí.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={!dirty}>
          Guardar
        </button>
      </div>

      <section className="card">
        <h3 className="section-title">Empresa</h3>
        <div className="form settings-grid">{COMPANY.map(([k, l]) => text(k, l))}</div>
      </section>

      <section className="card">
        <h3 className="section-title">Pagos</h3>
        <div className="qr-row">
          <button className="qr-box" onClick={() => qrInput.current?.click()}>
            {form.yapeQr ? <img src={form.yapeQr} alt="QR Yape" /> : <IconUpload />}
            <span>{form.yapeQr ? 'Cambiar QR' : 'Subir QR de Yape'}</span>
          </button>
          {form.yapeQr && (
            <button className="btn btn-ghost" onClick={() => set({ yapeQr: null })}>
              Quitar QR
            </button>
          )}
          <input
            ref={qrInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pickQr(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        <div className="form settings-grid">{PAYMENT.map(([k, l]) => text(k, l))}</div>
      </section>

      <section className="card">
        <h3 className="section-title">Condiciones por defecto</h3>
        <div className="form">
          <label className="field">
            <span>Días de validez</span>
            <input
              type="number"
              min={1}
              value={form.validityDays}
              onChange={(e) => set({ validityDays: Math.max(1, e.target.valueAsNumber || 1) })}
            />
          </label>
          {CONDS.map(([k, l]) => (
            <label key={k} className="field">
              <span>{l}</span>
              <textarea
                rows={2}
                value={form.conditions[k]}
                onChange={(e) => set({ conditions: { ...form.conditions, [k]: e.target.value } })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Catálogo de productos</h3>
        <p className="small muted" style={{ margin: 0 }}>
          {productsConfigured
            ? 'Conectado a Supabase. Los productos se leen al abrir una cotización nueva.'
            : 'Supabase no configurado: completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.production.'}
        </p>
      </section>
    </div>
  )
}
