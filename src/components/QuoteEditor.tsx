import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { QuoteSheet } from './QuoteSheet'
import { IconPlus, IconSearch, IconTrash, IconX } from './icons'
import { errorMessage, useToast } from './toast'
import { loadProducts, productsConfigured, searchProducts, type Product } from '../supabase'
import {
  addDaysISO,
  generateQuote,
  money,
  nextQuoteNumber,
  toDataUrl,
  todayISO,
  totals,
  type CompanySettings,
  type QuoteConditions,
  type QuoteItem,
} from '../quotes'
import type { Contact, ImageItem } from '../types'

const COND_FIELDS: [keyof QuoteConditions, string][] = [
  ['payment', 'Forma de pago'],
  ['delivery', 'Tiempo de entrega'],
  ['origin', 'Origen del envío'],
  ['warranty', 'Garantía'],
  ['stock', 'Validez del stock'],
  ['commercial', 'Condición comercial'],
]

export function QuoteEditor({
  contact,
  company,
  onClose,
  onGenerated,
}: {
  contact: Contact
  company: CompanySettings
  onClose: () => void
  onGenerated: (image: ImageItem) => void
}) {
  const toast = useToast()
  const [clientName, setClientName] = useState(contact.name)
  const [issueDate, setIssueDate] = useState(todayISO())
  const [validUntil, setValidUntil] = useState(addDaysISO(todayISO(), company.validityDays))
  const [items, setItems] = useState<QuoteItem[]>([])
  const [conditions, setConditions] = useState<QuoteConditions>(company.conditions)
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')
  const sheetRef = useRef<HTMLDivElement>(null)

  // Catálogo de Supabase
  const [catalog, setCatalog] = useState<Product[]>([])
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  useEffect(() => {
    if (!productsConfigured) return
    setCatalogState('loading')
    loadProducts()
      .then((p) => {
        setCatalog(p)
        setCatalogState('ok')
      })
      .catch((err) => {
        setCatalogState('error')
        toast(errorMessage(err), 'error')
      })
  }, [toast])
  const results = useMemo(() => searchProducts(catalog, search), [catalog, search])

  useEffect(() => {
    document.body.classList.add('no-scroll')
    return () => document.body.classList.remove('no-scroll')
  }, [])

  function addProduct(p: Product) {
    const existing = items.findIndex((i) => i.productId === p.id)
    if (existing >= 0) {
      updateItem(existing, { qty: items[existing].qty + 1 })
    } else {
      setItems((xs) => [...xs, { productId: p.id, name: p.name, thumb: null, unitPrice: p.price, qty: 1 }])
      // La miniatura llega después; si la imagen no se puede leer (CORS), va sin foto.
      if (p.imageUrl)
        void toDataUrl(p.imageUrl, 160).then(
          (thumb) => thumb && setItems((xs) => xs.map((i) => (i.productId === p.id ? { ...i, thumb } : i))),
        )
    }
    setSearch('')
    setShowResults(false)
  }

  function updateItem(idx: number, patch: Partial<QuoteItem>) {
    setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
  }

  const t = totals(items)
  const valid = clientName.trim() && items.length > 0 && items.every((i) => i.name.trim() && i.qty > 0)

  async function generate() {
    if (!valid || !sheetRef.current) return
    setBusy(true)
    try {
      const n = await nextQuoteNumber(issueDate)
      // El número tiene que estar pintado en la hoja antes de rasterizarla.
      flushSync(() => {
        setNumber(n)
        setMobileTab('preview')
      })
      const { image } = await generateQuote({
        node: sheetRef.current,
        number: n,
        contactId: contact.id,
        clientName: clientName.trim(),
        issueDate,
        validUntil,
        items,
        conditions,
      })
      toast(`Cotización ${n} generada`)
      onGenerated(image)
    } catch (err) {
      toast(errorMessage(err), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="qe" role="dialog" aria-modal="true" aria-label="Nueva cotización">
      <header className="qe-head">
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar" disabled={busy}>
          <IconX />
        </button>
        <h2>Nueva cotización · {contact.name}</h2>
        <div className="qe-tabs show-mobile">
          <button className={mobileTab === 'edit' ? 'on' : ''} onClick={() => setMobileTab('edit')}>
            Editar
          </button>
          <button className={mobileTab === 'preview' ? 'on' : ''} onClick={() => setMobileTab('preview')}>
            Vista previa
          </button>
        </div>
      </header>

      <div className={`qe-body qe-show-${mobileTab}`}>
        <div className="qe-form">
          <section className="card">
            <h3 className="section-title">Cliente y fechas</h3>
            <div className="form">
              <label className="field">
                <span>Cliente (como sale en la cotización)</span>
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </label>
              <div className="qe-row">
                <label className="field">
                  <span>Emisión</span>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => {
                      setIssueDate(e.target.value)
                      setValidUntil(addDaysISO(e.target.value, company.validityDays))
                    }}
                  />
                </label>
                <label className="field">
                  <span>Válida hasta</span>
                  <input type="date" value={validUntil} min={issueDate} onChange={(e) => setValidUntil(e.target.value)} />
                </label>
              </div>
            </div>
          </section>

          <section className="card">
            <h3 className="section-title">Productos</h3>
            {productsConfigured ? (
              <div className="qe-search">
                <label className="search">
                  <IconSearch />
                  <input
                    type="search"
                    placeholder={catalogState === 'loading' ? 'Cargando catálogo…' : 'Buscar producto o SKU…'}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setShowResults(true)
                    }}
                    onFocus={() => setShowResults(true)}
                    onBlur={() => setTimeout(() => setShowResults(false), 150)}
                  />
                </label>
                {showResults && catalogState === 'ok' && (
                  <ul className="qe-results">
                    {results.length === 0 && <li className="muted small qe-noresult">Sin resultados</li>}
                    {results.map((p) => (
                      <li key={p.id}>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => addProduct(p)}>
                          {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <span className="qe-noimg" />}
                          <span className="qe-pname">
                            {p.name}
                            {p.sku && <small className="muted"> · {p.sku}</small>}
                          </span>
                          <b>{money(p.price)}</b>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="muted small">
                El catálogo de Supabase aún no está configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Mientras
                tanto puedes agregar ítems libres.
              </p>
            )}

            <ul className="qe-items">
              {items.map((it, idx) => (
                <li key={idx}>
                  {it.thumb ? <img src={it.thumb} alt="" /> : <span className="qe-noimg" />}
                  <div className="qe-item-main">
                    <input
                      className="qe-item-name"
                      value={it.name}
                      placeholder="Descripción"
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                    />
                    <div className="qe-item-nums">
                      <label>
                        S/
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={Number.isNaN(it.unitPrice) ? '' : it.unitPrice}
                          onChange={(e) => updateItem(idx, { unitPrice: e.target.valueAsNumber || 0 })}
                        />
                      </label>
                      <label>
                        ×
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step="1"
                          value={it.qty}
                          onChange={(e) => updateItem(idx, { qty: Math.max(0, Math.round(e.target.valueAsNumber || 0)) })}
                        />
                      </label>
                      <b>{money(it.unitPrice * it.qty)}</b>
                    </div>
                  </div>
                  <button
                    className="icon-btn icon-danger"
                    onClick={() => setItems((xs) => xs.filter((_, i) => i !== idx))}
                    aria-label="Quitar"
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="btn btn-ghost"
              onClick={() => setItems((xs) => [...xs, { productId: null, name: '', thumb: null, unitPrice: 0, qty: 1 }])}
            >
              <IconPlus width={16} height={16} /> Ítem libre (instalación, envío…)
            </button>
          </section>

          <details className="card">
            <summary className="section-title">Condiciones</summary>
            <div className="form">
              {COND_FIELDS.map(([k, label]) => (
                <label key={k} className="field">
                  <span>{label}</span>
                  <textarea
                    rows={k === 'commercial' ? 3 : 2}
                    value={conditions[k]}
                    onChange={(e) => setConditions({ ...conditions, [k]: e.target.value })}
                  />
                </label>
              ))}
              <small className="hint">Déjalo vacío para que no salga en la cotización. Los valores por defecto se cambian en Ajustes.</small>
            </div>
          </details>
        </div>

        <div className="qe-preview">
          <ScaledSheet>
            <QuoteSheet
              ref={sheetRef}
              company={company}
              data={{ number, clientName: clientName.trim() || '—', issueDate, validUntil, items, conditions }}
            />
          </ScaledSheet>
        </div>
      </div>

      <footer className="qe-foot">
        <div>
          <span className="muted small">Total</span>
          <strong>{money(t.total)}</strong>
        </div>
        <button className="btn btn-primary btn-lg" onClick={generate} disabled={!valid || busy}>
          {busy ? 'Generando…' : 'Generar y enviar'}
        </button>
      </footer>
    </div>
  )
}

/** Escala la hoja (760 px fijos) al ancho disponible sin alterar lo que se rasteriza. */
function ScaledSheet({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const update = () => {
      if (!outer.current || !inner.current) return
      const s = Math.min(1, outer.current.clientWidth / 760)
      setScale(s)
      setHeight(inner.current.offsetHeight * s)
    }
    update()
    const ro = new ResizeObserver(update)
    if (outer.current) ro.observe(outer.current)
    if (inner.current) ro.observe(inner.current)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={outer} className="qe-scaled" style={{ height }}>
      <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 760 }}>
        {children}
      </div>
    </div>
  )
}
