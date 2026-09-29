import './quote-sheet.css'
import { forwardRef, useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { FalconMark } from './FalconLogo'
import { SheetIcon } from './sheetIcons'
import type { CompanySettings } from '../quotes'
import type { PortfolioData } from '../portfolio'

/** QR en SVG (nítido al rasterizar). */
function Qr({ text, size }: { text: string; size: number }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    const rects: string[] = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) rects.push(`M${c} ${r}h1v1h-1z`)
    return { n, d: rects.join('') }
  }, [text])
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${cells.n + 4} ${cells.n + 4}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={cells.n + 4} height={cells.n + 4} fill="#fff" />
      <path d={cells.d} fill="#111827" />
    </svg>
  )
}

const webUrl = (web: string) => (/^https?:\/\//.test(web) ? web : `https://${web.replace(/^\/+/, '')}`)

/**
 * Página 2: portafolio de productos y servicios con los datos de la empresa.
 * Mismo ancho fijo que la cotización (760 px) porque también se rasteriza.
 */
export const PortfolioSheet = forwardRef<HTMLDivElement, { data: PortfolioData; company: CompanySettings }>(
  function PortfolioSheet({ data, company: c }, ref) {
    const shown = data.groups.reduce((n, g) => n + g.items.length, 0)
    return (
      <div ref={ref} className="qs pf">
        <header className="qs-head">
          <div className="qs-brand">
            <FalconMark size={66} />
            <div>
              <div className="qs-brand-name">FALCON</div>
              <div className="qs-brand-sub">ELECTRONIC</div>
            </div>
          </div>
          <div className="qs-title">
            <div className="qs-title-main">PORTAFOLIO</div>
            <div className="pf-tagline">{c.portfolioTagline}</div>
          </div>
        </header>

        {data.categories.length > 0 && (
          <section className="pf-lines">
            <div className="qs-label">Líneas de producto</div>
            <div className="pf-chips">
              {data.categories.map((cat) => (
                <span key={cat.name}>
                  {cat.name} <small>{cat.count}</small>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Una sola grilla ordenada por categoría: sin filas a medio llenar entre grupos. */}
        <section className="pf-products">
          <div className="pf-grid">
            {data.groups.flatMap((g) =>
              g.items.map((p) => (
                <div key={p.id} className="pf-card">
                  <div className="pf-img">
                    {data.thumbs[p.id] ? (
                      <img src={data.thumbs[p.id]!} alt="" />
                    ) : (
                      <span className="pf-noimg">{p.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="pf-cat">{g.category}</div>
                  <div className="pf-name">{p.name}</div>
                  {p.brand && <div className="pf-brand">{p.brand}</div>}
                </div>
              )),
            )}
          </div>
        </section>

        {data.total > shown && (
          <p className="pf-more">
            Y {data.total - shown} productos más en nuestro catálogo. Pregúntanos por el que necesites.
          </p>
        )}

        {data.services.length > 0 && (
          <section className="pf-services">
            <div className="qs-label">Servicios</div>
            <div className="pf-services-grid">
              {data.services.slice(0, 12).map((s) => (
                <div key={s.id}>
                  <span className="pf-check">
                    <SheetIcon name="check" size={14} />
                  </span>
                  {s.title}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="pf-contact">
          <div>
            <div className="pf-contact-title">¿Te interesa algún producto?</div>
            <div className="pf-contact-sub">Escríbenos y te asesoramos sin compromiso.</div>
            <div className="pf-contact-rows">
              <div>
                <SheetIcon name="phone" size={18} /> {c.phone}
              </div>
              <div>
                <SheetIcon name="globe" size={18} /> {c.web}
              </div>
              <div>
                <SheetIcon name="pin" size={18} /> {c.officeAddress}
              </div>
            </div>
          </div>
          {c.web.trim() && (
            <div className="pf-qr">
              <Qr text={webUrl(c.web.trim())} size={116} />
              <span>Catálogo completo</span>
            </div>
          )}
        </section>

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
