import { useRef, useState } from 'react'
import { IconEdit, IconTrash, IconUpload } from './icons'
import { errorMessage, useToast } from './toast'
import { deleteImage, renameImage, uploadImage } from '../data'
import type { Contact, ImageItem } from '../types'

export function LibraryView({ images, contacts }: { images: ImageItem[]; contacts: Contact[] }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [showContact, setShowContact] = useState(false)
  const library = images.filter((i) => i.contactId === null)
  const perContact = images.filter((i) => i.contactId !== null)
  const nameOf = (id: string | null) => contacts.find((c) => c.id === id)?.name ?? 'contacto eliminado'

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    setUploading(list.length)
    const results = await Promise.allSettled(
      list.map((f) => uploadImage(f, null).finally(() => setUploading((n) => n - 1))),
    )
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
    if (failed) toast(errorMessage(failed.reason), 'error')
    else toast(list.length === 1 ? 'Imagen subida' : `${list.length} imágenes subidas`)
  }

  function rename(img: ImageItem) {
    const name = prompt('Nombre de la imagen', img.name)?.trim()
    if (name && name !== img.name) renameImage(img.id, name).catch((err) => toast(errorMessage(err), 'error'))
  }

  function remove(img: ImageItem) {
    if (!confirm(`¿Eliminar "${img.name}"? Los enlaces ya enviados dejarán de funcionar.`)) return
    deleteImage(img)
      .then(() => toast('Imagen eliminada'))
      .catch((err) => toast(errorMessage(err), 'error'))
  }

  const shown = showContact ? perContact : library

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Biblioteca de imágenes</h2>
          <p className="muted small">
            Cotizaciones tipo, catálogos y sugerencias referenciales para reutilizar con cualquier contacto.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={uploading > 0}>
          <IconUpload /> {uploading ? `Subiendo ${uploading}…` : 'Subir imágenes'}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void upload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div className="chip-row">
        <button className={`chip${!showContact ? ' chip-on' : ''}`} onClick={() => setShowContact(false)}>
          Biblioteca <span className="chip-count">{library.length}</span>
        </button>
        <button className={`chip${showContact ? ' chip-on' : ''}`} onClick={() => setShowContact(true)}>
          Subidas a contactos <span className="chip-count">{perContact.length}</span>
        </button>
      </div>

      {shown.length === 0 ? (
        <div
          className="dropzone"
          onClick={() => !showContact && input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void upload(e.dataTransfer.files)
          }}
        >
          {showContact ? 'No hay imágenes subidas a contactos.' : 'Arrastra imágenes aquí o toca para subir.'}
        </div>
      ) : (
        <div
          className="library-grid"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void upload(e.dataTransfer.files)
          }}
        >
          {shown.map((img) => (
            <figure key={img.id} className="lib-card">
              <a href={img.url} target="_blank" rel="noreferrer">
                <img src={img.url} alt={img.name} loading="lazy" />
              </a>
              <figcaption>
                <span className="lib-name" title={img.name}>
                  {img.name}
                </span>
                {img.contactId && <span className="muted small">{nameOf(img.contactId)}</span>}
                <span className="lib-tools">
                  <button className="icon-btn" onClick={() => rename(img)} aria-label="Renombrar">
                    <IconEdit width={16} height={16} />
                  </button>
                  <button className="icon-btn icon-danger" onClick={() => remove(img)} aria-label="Eliminar">
                    <IconTrash width={16} height={16} />
                  </button>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
