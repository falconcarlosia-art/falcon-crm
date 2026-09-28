import { useEffect, useState } from 'react'
import { resolveShortLink } from '../data'

/** /v/{código}: página pública que abre la imagen enviada por WhatsApp. */
export function ShortLinkRedirect({ code }: { code: string }) {
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    resolveShortLink(code)
      .then((url) => (url ? window.location.replace(url) : setMissing(true)))
      .catch(() => setMissing(true))
  }, [code])
  return (
    <div className="center-screen">
      <div className="login-card">
        <div className="brand">
          <img src="/icon.svg" alt="" width={34} height={34} />
          <div>
            <strong>FALCON</strong>
            <span>ELECTRONIC</span>
          </div>
        </div>
        <p className="muted">{missing ? 'Este enlace ya no está disponible.' : 'Abriendo…'}</p>
      </div>
    </div>
  )
}
