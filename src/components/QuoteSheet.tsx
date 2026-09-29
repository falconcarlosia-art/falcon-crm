import './quote-sheet.css'
import { forwardRef } from 'react'
import { FalconMark } from './FalconLogo'
import { SheetIcon, iconFor } from './sheetIcons'
import { dmy, money, totals, type CompanySettings, type QuoteConditions, type QuoteItem } from '../quotes'

export interface QuoteSheetData {
  number: string
  clientName: string
  issueDate: string
  validUntil: string
  items: QuoteItem[]
  conditions: QuoteConditions
}

/**
 * Hoja de cotización con el diseño de marca. Ancho fijo (760 px): es lo que se
 * rasteriza a PNG/PDF, así que no debe depender del tamaño de la pantalla.
 */
export const QuoteSheet = forwardRef<HTMLDivElement, { data: QuoteSheetData; company: CompanySettings }>(
  function QuoteSheet({ data, company: c }, ref) {
    const t = totals(data.items)
    const cond = data.conditions
    const highlights = (c.highlights ?? '')
      .split('\n')
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 4)
    const conds = (
      [
        ['Pago', cond.payment],
        ['Entrega', cond.delivery],
        ['Garantía', cond.warranty],
        ['Stock', cond.stock],
        ['Despacho desde', cond.origin],
      ] as const
    ).filter(([, v]) => v.trim())
    const hasPay = Boolean(c.yapeQr || c.yapeName || c.account || c.cci || c.cardTitle)
    return (
      <div ref={ref} className="qs">
        <header className="qs-head">
          <div className="qs-brand">
            <FalconMark size={66} />
            <div>
              <div className="qs-brand-name">FALCON</div>
              <div className="qs-brand-sub">ELECTRONIC</div>
            </div>
          </div>
          <div className="qs-title">
            <div className="qs-title-main">COTIZACIÓN</div>
            <div className="qs-title-num">Nº {data.number || '—'}</div>
          </div>
        </header>

        <section className="qs-company">
          <div>
            <div className="qs-legal">{c.legalName}</div>
            <div>RUC {c.ruc}</div>
            <div className="qs-soft">
              {c.phone} · {c.web}
            </div>
          </div>
          <div className="qs-right">
            <div className="qs-label">Domicilio fiscal</div>
            <div className="qs-soft">{c.fiscalAddress}</div>
            <div className="qs-label qs-mt">Oficina y almacén</div>
            <div className="qs-soft">{c.officeAddress}</div>
          </div>
        </section>

        <section className="qs-client">
          <div>
            <div className="qs-label">Cliente</div>
            <div className="qs-client-name">{data.clientName}</div>
          </div>
          <div className="qs-right">
            <div className="qs-label">Detalles</div>
            <div className="qs-soft">
              Emisión <b>{dmy(data.issueDate)}</b>
            </div>
            <div className="qs-soft">
              Válida hasta <b>{dmy(data.validUntil)}</b>
            </div>
            <div className="qs-soft">
              Moneda <b>Soles (S/)</b>
            </div>
          </div>
        </section>

        <section className="qs-items">
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th className="qs-num">
                  Precio final
                  <br />
                  (incluye IGV)
                </th>
                <th className="qs-qty">Cant.</th>
                <th className="qs-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="qs-soft qs-empty">
                    Agrega productos a la cotización
                  </td>
                </tr>
              )}
              {data.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <div className="qs-desc">
                      {it.thumb && <img src={it.thumb} alt="" />}
                      <div>
                        <b>{it.name}</b>
                        {it.description?.trim() && <div className="qs-desc-text">{it.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="qs-num qs-soft">{money(it.unitPrice)}</td>
                  <td className="qs-qty qs-soft">{it.qty}</td>
                  <td className="qs-num">
                    <b>{money(it.unitPrice * it.qty)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="qs-sum">
            <p className="qs-note">
              Los precios unitarios incluyen IGV.
              <br />
              Precios válidos hasta el <b>{dmy(data.validUntil)}</b>.
            </p>
            <div className="qs-totals">
            <div>
              <span>Valor de venta</span>
              <span>{money(t.base)}</span>
            </div>
            <div>
              <span>IGV (18 %)</span>
              <span>{money(t.igv)}</span>
            </div>
            <div className="qs-total">
              <span>TOTAL</span>
              <span>{money(t.total)}</span>
            </div>
            </div>
          </div>
        </section>

        {highlights.length > 0 && (
          <section className="qs-highlights" style={{ gridTemplateColumns: `repeat(${highlights.length}, 1fr)` }}>
            {highlights.map((h) => (
              <div key={h}>
                <span className="qs-hl-icon">
                  <SheetIcon name={iconFor(h)} />
                </span>
                <span>{h}</span>
              </div>
            ))}
          </section>
        )}

        {conds.length > 0 && (
          <section className="qs-conds">
            <div className="qs-label">Condiciones</div>
            <div className="qs-conds-grid">
              {conds.map(([k, v]) => (
                <div key={k}>
                  <b>{k}:</b> {v}
                </div>
              ))}
            </div>
          </section>
        )}

        {hasPay && (
          <section className="qs-pay">
            {(c.yapeQr || c.yapeName) && (
              <div className="qs-yape">
                {c.yapeQr && <img src={c.yapeQr} alt="QR Yape" />}
                <div>
                  <div className="qs-yape-label">YAPE</div>
                  <div className="qs-soft">{c.yapeName}</div>
                </div>
              </div>
            )}
            {/* Cada dato de pago sale solo si está cargado en Ajustes. */}
            {(c.account || c.cci) && (
              <div className="qs-bank">
                <div className="qs-label">{c.bankLabel}</div>
                {c.account && <div>{c.account}</div>}
                {c.cci && <div className="qs-soft">CCI {c.cci}</div>}
                {c.holder && <div className="qs-soft">{c.holder}</div>}
              </div>
            )}
            {c.cardTitle && (
              <div className="qs-card">
                <b>{c.cardTitle}</b>
                <div className="qs-soft">{c.cardText}</div>
              </div>
            )}
          </section>
        )}

        {c.cta?.trim() && (
          <section className="qs-cta">
            <div className="qs-cta-text">{c.cta}</div>
            <div className="qs-cta-contact">
              <SheetIcon name="phone" size={18} /> {c.phone}
              <span className="qs-cta-sep" />
              <SheetIcon name="globe" size={18} /> {c.web}
            </div>
          </section>
        )}

        {cond.commercial.trim() && <p className="qs-fine">{cond.commercial}</p>}

        <footer className="qs-foot">
          <div className="qs-foot-thanks">{c.footer.toUpperCase()}</div>
          <div className="qs-foot-legal">
            {c.legalName} · RUC {c.ruc} · {c.web}
          </div>
        </footer>
      </div>
    )
  },
)
