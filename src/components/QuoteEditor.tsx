import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { QuoteSheet } from './QuoteSheet'
import { PortfolioSheet } from './PortfolioSheet'
import { loadPortfolio, type PortfolioData } from '../portfolio'
import { IconPlus, IconSearch, IconTrash, IconX } from './icons'
import { errorMessage, useToast } from './toast'
import { loadProducts, productsConfigured, searchProducts, type Product } from '../supabase'
import {
  addDaysISO,
  saveQuote,
  money,
  nextQuoteNumber,
  toDataUrl,
  todayISO,
  totals,
  type CompanySettings,
  type QuoteConditions,
  type Quote,
  type QuoteItem,
} from '../quotes'
import type { Contact } from '../types'
import { buildQuoteFiles, rasterize, type QuoteFiles } from '../files'
import { quoteBaseName, renderPortfolioJpg } from '../renderQuote'
import { aiReady, usd, type AiConfig } from '../ai'
import { quoteFromMessage, type AiQuote } from '../aiTasks'
import { IconSparkle } from './icons'

const COND_FIELDS: [keyof QuoteConditions, string][] = [
  ['payment', 'Forma de pago'],
  ['delivery', 'Tiempo de entrega'],
  ['origin', 'Origen del envío'],
  ['warranty', 'Garantía'],
  ['stock', 'Validez del stock'],
  ['commercial', 'Condición comercial'],
]

export function QuoteEditor({
  contact: initialContact,
  contacts,
  initial,
  company,
  ai,
  onClose,
  onGenerated,
}: {
  contact: Contact
  /** Al duplicar se puede elegir otro cliente de esta lista. */
  contacts?: Contact[]
  initial?: { items: QuoteItem[]; conditions: QuoteConditions; number: string }
  company: CompanySettings
  ai: AiConfig
  onClose: () => void
  /** La cotización guardada (solo datos) y sus archivos recién generados, para enviarlos. */
  onGenerated: (quote: Quote, files: QuoteFiles, contact: Contact) => void
}) {
  const toast = useToast()
  const [contactId, setContactId] = useState(initialContact.id)
  const contact = contacts?.find((c) => c.id === contactId) ?? initialContact
  const [clientName, setClientName] = useState(initialContact.name)
  const [issueDate, setIssueDate] = useState(todayISO())
  const [validUntil, setValidUntil] = useState(addDaysISO(todayISO(), company.validityDays))
  const [items, setItems] = useState<QuoteItem[]>(initial?.items ?? [])
  const [conditions, setConditions] = useState<QuoteConditions>(initial?.conditions ?? company.conditions)
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

  // Vista previa de la página 2 (también deja las miniaturas listas para generar).
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  useEffect(() => {
    if (!company.portfolioEnabled) return setPortfolio(null)
    let alive = true
    loadPortfolio(company.portfolioMax)
      .then((d) => alive && setPortfolio(d))
      .catch(() => alive && setPortfolio(null))
    return () => {
      alive = false
    }
  }, [company.portfolioEnabled, company.portfolioMax])

  useEffect(() => {
    document.body.classList.add('no-scroll')
    return () => document.body.classList.remove('no-scroll')
  }, [])

  function addProduct(p: Product) {
    const existing = items.findIndex((i) => i.productId === p.id)
    if (existing >= 0) {
      updateItem(existing, { qty: items[existing].qty + 1 })
    } else {
      setItems((xs) => [
        ...xs,
        { productId: p.id, name: p.name, description: p.description, thumb: null, unitPrice: p.price, qty: 1 },
      ])
      // La miniatura llega después; si la imagen no se puede leer (CORS), va sin foto.
      if (p.imageUrl)
        void toDataUrl(p.imageUrl, 160).then(
          (thumb) => thumb && setItems((xs) => xs.map((i) => (i.productId === p.id ? { ...i, thumb } : i))),
        )
    }
    setSearch('')
    setShowResults(false)
  }

  /** Ítems que propone la IA: los del catálogo con su precio; los libres a S/ 0 para completar. */
  function addAiLines(lines: { product: Product | null; name: string; qty: number }[]) {
    const next = [...items]
    for (const l of lines) {
      const existing = l.product ? next.findIndex((i) => i.productId === l.product!.id) : -1
      if (existing >= 0) next[existing] = { ...next[existing], qty: next[existing].qty + l.qty }
      else
        next.push({
          productId: l.product?.id ?? null,
          name: l.product?.name ?? l.name,
          description: l.product?.description ?? '',
          thumb: null,
          unitPrice: l.product?.price ?? 0,
          qty: l.qty,
        })
    }
    setItems(next)
    lines.forEach(({ product: p }) => {
      if (p?.imageUrl)
        void toDataUrl(p.imageUrl, 160).then(
          (thumb) => thumb && setItems((xs) => xs.map((i) => (i.productId === p.id ? { ...i, thumb } : i))),
        )
    })
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
      // Se rasteriza la misma vista previa que se ve en pantalla.
      const jpg = await rasterize(sheetRef.current)
      const quote = await saveQuote({
        number: n,
        contactId: contact.id,
        clientName: clientName.trim(),
        issueDate,
        validUntil,
        items,
        conditions,
      })
      // Sin portafolio si falla (sin conexión a Supabase): la cotización sale igual.
      const portfolio = await renderPortfolioJpg(company).catch(() => null)
      const files = await buildQuoteFiles(jpg, portfolio, quoteBaseName(quote), `Cotización ${n}`)
      toast(`Cotización ${n} generada`)
      onGenerated(quote, files, contact)
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
        <h2>{initial ? `Duplicar Nº ${initial.number}` : `Nueva cotización · ${contact.name}`}</h2>
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
              {contacts && (
                <label className="field">
                  <span>Contacto</span>
                  <select
                    value={contactId}
                    onChange={(e) => {
                      setContactId(e.target.value)
                      setClientName(contacts.find((c) => c.id === e.target.value)?.name ?? '')
                    }}
                  >
                    {[...contacts]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
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
            <AiQuoteBox ai={ai} catalog={catalog} catalogLoading={catalogState === 'loading'} onLines={addAiLines} />
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
                <li key={idx} className={it.unitPrice === 0 ? 'qe-needs-price' : ''}>
                  {it.thumb ? <img src={it.thumb} alt="" /> : <span className="qe-noimg" />}
                  <div className="qe-item-main">
                    {/* textarea que crece con el texto: en el celular los nombres largos no se cortan. */}
                    <textarea
                      className="qe-item-name"
                      rows={Math.min(5, Math.max(1, Math.ceil(it.name.length / 18)))}
                      value={it.name}
                      placeholder="Nombre del producto o servicio"
                      onChange={(e) => updateItem(idx, { name: e.target.value.replace(/\n/g, ' ') })}
                    />
                    <textarea
                      className="qe-item-desc"
                      rows={Math.min(4, Math.max(1, Math.ceil((it.description ?? '').length / 34)))}
                      value={it.description ?? ''}
                      placeholder="Descripción corta (opcional)"
                      maxLength={200}
                      onChange={(e) => updateItem(idx, { description: e.target.value.replace(/\n/g, ' ') })}
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
          {portfolio && (
            <>
              <p className="qe-page-label">Página 2 · Portafolio (el mismo en todas las cotizaciones)</p>
              <ScaledSheet>
                <PortfolioSheet data={portfolio} company={company} />
              </ScaledSheet>
            </>
          )}
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

/** Pegar el mensaje del cliente → la IA propone los ítems con productos del catálogo. */
function AiQuoteBox({
  ai,
  catalog,
  catalogLoading,
  onLines,
}: {
  ai: AiConfig
  catalog: Product[]
  catalogLoading: boolean
  onLines: (lines: { product: Product | null; name: string; qty: number }[]) => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ quote: AiQuote; cost: number | null; unknown: number; free: number } | null>(null)
  const ready = aiReady(ai, 'quote')

  async function run() {
    setBusy(true)
    setResult(null)
    try {
      const { data, cost } = await quoteFromMessage(ai, text, catalog)
      const byId = new Map(catalog.map((p) => [p.id, p]))
      let unknown = 0
      const lines = data.items
        .filter((l) => l.qty > 0 && (l.product_id || l.description.trim()))
        .map((l) => {
          // Un id que no existe se trata como ítem libre: nunca se confía en un precio inventado.
          const product = l.product_id ? byId.get(l.product_id) ?? null : null
          if (l.product_id && !product) unknown++
          return { product, name: l.description.trim(), qty: Math.round(l.qty) }
        })
      onLines(lines)
      setResult({ quote: data, cost, unknown, free: lines.filter((l) => !l.product).length })
      toast(`${lines.length} ítem${lines.length === 1 ? '' : 's'} agregado${lines.length === 1 ? '' : 's'}`)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button className="ai-trigger" onClick={() => setOpen(true)}>
        <IconSparkle width={16} height={16} /> Armar con IA desde el mensaje del cliente
      </button>
    )

  return (
    <div className="ai-box">
      <div className="ai-box-head">
        <b>
          <IconSparkle width={16} height={16} /> Armar con IA
        </b>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar">
          <IconX width={16} height={16} />
        </button>
      </div>
      {!ready ? (
        <p className="small muted">Configura la API key de OpenRouter y el modelo para cotizar en Ajustes → Inteligencia artificial.</p>
      ) : (
        <>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pega aquí lo que te escribió el cliente: «Hola, quiero automatizar las luces de la sala y la cocina y poner una cámara en la entrada…»"
          />
          <div className="ai-box-actions">
            <span className="muted small">{catalogLoading ? 'Cargando catálogo…' : `${catalog.length} productos en el catálogo`}</span>
            <button className="btn btn-dark btn-sm" onClick={run} disabled={busy || !text.trim() || catalogLoading}>
              {busy ? 'Pensando…' : 'Armar cotización'}
            </button>
          </div>
        </>
      )}
      {result && (
        <div className="ai-result small">
          <p>
            <b>Entendí:</b> {result.quote.summary}
          </p>
          {result.quote.questions.length > 0 && (
            <>
              <b>Conviene preguntarle:</b>
              <ul>
                {result.quote.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
          <p className="muted">
            {result.free > 0
              ? `Revisa los ${result.free} ítem${result.free === 1 ? '' : 's'} resaltado${result.free === 1 ? '' : 's'}: no están en el catálogo y quedaron a S/ 0.`
              : 'Todos los ítems salieron del catálogo con su precio.'}
            {result.unknown > 0 && ` (${result.unknown} con id desconocido se pasaron a ítem libre.)`}
            {result.cost !== null && ` · Costo: ${usd(result.cost)}`}
          </p>
        </div>
      )}
    </div>
  )
}
