import type { ReactElement, Ref } from 'react'
import { createRoot } from 'react-dom/client'
import { QuoteSheet } from './components/QuoteSheet'
import { PortfolioSheet } from './components/PortfolioSheet'
import { buildQuoteFiles, rasterize, safeFileName, type QuoteFiles } from './files'
import { loadPortfolio } from './portfolio'
import type { CompanySettings, Quote } from './quotes'

export const quoteBaseName = (q: Pick<Quote, 'number' | 'clientName'>) =>
  safeFileName(`Cotizacion_${q.number}_${q.clientName}`)

/**
 * Monta una hoja fuera de pantalla y la rasteriza a JPEG. El montaje y
 * desmontaje van en tareas aparte: suele llamarse desde un efecto, y React no
 * permite renderizar otra raíz de forma síncrona en ese momento.
 */
async function renderOffscreen(build: (ref: Ref<HTMLDivElement>) => ReactElement): Promise<Blob> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    const node = await new Promise<HTMLDivElement>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No se pudo dibujar la cotización')), 15_000)
      setTimeout(() =>
        root.render(
          build((el) => {
            if (el) {
              clearTimeout(timer)
              resolve(el)
            }
          }),
        ),
      )
    })
    return await rasterize(node)
  } finally {
    setTimeout(() => {
      root.unmount()
      host.remove()
    })
  }
}

// El portafolio es igual para todas las cotizaciones: se dibuja una vez por
// sesión (mientras no cambien los ajustes que lo afectan).
let portfolioCache: { key: string; blob: Promise<Blob | null> } | null = null

/** Página 2 (portafolio) como JPEG, o null si está desactivada o no hay catálogo. */
export function renderPortfolioJpg(company: CompanySettings): Promise<Blob | null> {
  if (!company.portfolioEnabled) return Promise.resolve(null)
  const key = JSON.stringify([
    company.portfolioMax,
    company.portfolioTagline,
    company.phone,
    company.web,
    company.officeAddress,
    company.legalName,
    company.ruc,
    company.footer,
  ])
  if (portfolioCache?.key !== key) {
    const blob = loadPortfolio(company.portfolioMax).then((data) =>
      data ? renderOffscreen((ref) => <PortfolioSheet ref={ref} data={data} company={company} />) : null,
    )
    // Si falla, no se guarda: el próximo intento vuelve a probar.
    blob.catch(() => portfolioCache?.blob === blob && (portfolioCache = null))
    portfolioCache = { key, blob }
  }
  return portfolioCache.blob
}

/** Vuelve a dibujar una cotización guardada (solo datos) y genera imágenes y PDF. */
export async function renderQuoteFiles(quote: Quote, company: CompanySettings): Promise<QuoteFiles> {
  const [jpg, portfolio] = await Promise.all([
    renderOffscreen((ref) => <QuoteSheet ref={ref} company={company} data={quote} />),
    renderPortfolioJpg(company).catch(() => null),
  ])
  return buildQuoteFiles(jpg, portfolio, quoteBaseName(quote), `Cotización ${quote.number}`)
}
