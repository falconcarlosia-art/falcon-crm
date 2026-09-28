import { createRoot } from 'react-dom/client'
import { QuoteSheet } from './components/QuoteSheet'
import { buildQuoteFiles, rasterize, safeFileName, type QuoteFiles } from './files'
import type { CompanySettings, Quote } from './quotes'

export const quoteBaseName = (q: Pick<Quote, 'number' | 'clientName'>) =>
  safeFileName(`Cotizacion_${q.number}_${q.clientName}`)

/**
 * Vuelve a dibujar una cotización guardada (solo datos) y genera imagen y PDF.
 * Se monta fuera de pantalla con el mismo componente que la vista previa. El
 * montaje y desmontaje van en tareas aparte: suele llamarse desde un efecto,
 * y React no permite renderizar otra raíz de forma síncrona en ese momento.
 */
export async function renderQuoteFiles(quote: Quote, company: CompanySettings): Promise<QuoteFiles> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    const node = await new Promise<HTMLDivElement>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No se pudo dibujar la cotización')), 15_000)
      setTimeout(() =>
        root.render(
          <QuoteSheet
            ref={(el) => {
              if (el) {
                clearTimeout(timer)
                resolve(el)
              }
            }}
            company={company}
            data={quote}
          />,
        ),
      )
    })
    const jpg = await rasterize(node)
    return await buildQuoteFiles(jpg, quoteBaseName(quote), `Cotización ${quote.number}`)
  } finally {
    setTimeout(() => {
      root.unmount()
      host.remove()
    })
  }
}
