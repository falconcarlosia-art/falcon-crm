import { useEffect, useState } from 'react'
import { resolveShortLink } from '../data'
import { downloadBlob, imageToPdf, loadFile, safeFileName } from '../files'
import { FalconMark } from './FalconLogo'

/**
 * /v/{código}: página pública que ve el cliente al tocar el enlace de WhatsApp.
 * Muestra la imagen (cotización o sugerencia) y permite bajarla como imagen o PDF.
 */
export function ShortLinkRedirect({ code }: { code: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [name, setName] = useState('')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    resolveShortLink(code)
      .then(async (link) => {
        if (!link) return setState('missing')
        const b = await loadFile(link.fileId)
        objectUrl = URL.createObjectURL(b)
        setName(link.name)
        document.title = `${link.name} · Falcon Electronic`
        setBlob(b)
        setUrl(objectUrl)
        setState('ok')
      })
      .catch(() => setState('missing'))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [code])

  const ext = blob?.type === 'image/png' ? 'png' : 'jpg'

  async function downloadPdf() {
    if (!blob) return
    setPdfBusy(true)
    try {
      downloadBlob(await imageToPdf(blob, name), `${safeFileName(name)}.pdf`)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="shared">
      <header className="shared-head">
        <FalconMark size={34} />
        <div>
          <strong>FALCON</strong>
          <span>ELECTRONIC</span>
        </div>
      </header>

      {state === 'loading' && <p className="shared-msg">Cargando…</p>}
      {state === 'missing' && <p className="shared-msg">Este enlace ya no está disponible.</p>}
      {state === 'ok' && url && blob && (
        <>
          <div className="shared-actions">
            <button className="btn btn-ghost" onClick={() => downloadBlob(blob, `${safeFileName(name)}.${ext}`)}>
              Descargar imagen
            </button>
            <button className="btn btn-primary" onClick={downloadPdf} disabled={pdfBusy}>
              {pdfBusy ? 'Generando…' : 'Descargar PDF'}
            </button>
          </div>
          <img className="shared-img" src={url} alt={name} />
        </>
      )}
      <footer className="shared-foot">Falcon Electronic del Perú · +51 931 324 454 · falcem.com</footer>
    </div>
  )
}
