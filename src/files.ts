import { useEffect, useState } from 'react'
import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

// Archivos (imágenes y cotizaciones) guardados en Firestore, sin Firebase
// Storage: así el proyecto funciona en el plan gratuito (Spark). Cada archivo
// es files/{id} con sus datos en base64 repartidos en files/{id}/chunks/{0..n}
// para no pasar el límite de 1 MiB por documento.

const CHUNK_CHARS = 900_000
/** Tope después de comprimir: ~7 MB en base64, dentro del límite de 10 MiB por lote. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

export interface StoredFile {
  fileId: string
  size: number
  contentType: string
}

export async function saveFile(blob: Blob): Promise<StoredFile> {
  if (blob.size > MAX_FILE_BYTES) throw new Error('La imagen es demasiado grande (máx. 5 MB después de comprimir).')
  const base64 = await blobToBase64(blob)
  const ref = doc(collection(db, 'files'))
  const chunks = Math.max(1, Math.ceil(base64.length / CHUNK_CHARS))
  const batch = writeBatch(db)
  batch.set(ref, { contentType: blob.type, size: blob.size, chunks, createdAt: serverTimestamp() })
  for (let i = 0; i < chunks; i++) {
    batch.set(doc(db, 'files', ref.id, 'chunks', String(i)), { data: base64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) })
  }
  await batch.commit()
  return { fileId: ref.id, size: blob.size, contentType: blob.type }
}

/** Lee el archivo por id (lectura pública puntual: nunca se listan colecciones). */
export async function loadFile(fileId: string): Promise<Blob> {
  const meta = await getDoc(doc(db, 'files', fileId))
  if (!meta.exists()) throw new Error('El archivo ya no existe.')
  const { chunks, contentType } = meta.data() as { chunks: number; contentType: string }
  const parts = await Promise.all(
    Array.from({ length: chunks }, (_, i) => getDoc(doc(db, 'files', fileId, 'chunks', String(i)))),
  )
  const base64 = parts.map((p) => (p.data()?.data as string) ?? '').join('')
  return base64ToBlob(base64, contentType)
}

export async function deleteFile(fileId: string) {
  const meta = await getDoc(doc(db, 'files', fileId))
  const chunks = meta.exists() ? ((meta.data().chunks as number) ?? 1) : 0
  const batch = writeBatch(db)
  for (let i = 0; i < chunks; i++) batch.delete(doc(db, 'files', fileId, 'chunks', String(i)))
  batch.delete(doc(db, 'files', fileId))
  await batch.commit()
}

// Caché de object URLs en la sesión: la misma imagen no se descarga dos veces.
const urlCache = new Map<string, Promise<string>>()

export function fileObjectUrl(fileId: string): Promise<string> {
  let p = urlCache.get(fileId)
  if (!p) {
    p = loadFile(fileId).then((b) => URL.createObjectURL(b))
    p.catch(() => urlCache.delete(fileId))
    urlCache.set(fileId, p)
  }
  return p
}

/** URL para <img> de la imagen completa; null mientras carga. */
export function useFileUrl(fileId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!fileId) return
    let alive = true
    fileObjectUrl(fileId)
      .then((u) => alive && setUrl(u))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [fileId])
  return url
}

// ---------- Imágenes ----------

/**
 * Comprime para guardar (JPEG, lado mayor ≤ maxSide) y genera la miniatura de
 * las listas, que viaja dentro del documento de la imagen.
 */
export async function prepareImage(src: Blob, maxSide = 1800, quality = 0.88) {
  const bmp = await createImageBitmap(src)
  const full = await drawJpeg(bmp, maxSide, quality)
  const thumbBlob = await drawJpeg(bmp, 360, 0.75)
  bmp.close?.()
  return { blob: full, thumb: await blobToDataUrl(thumbBlob) }
}

async function drawJpeg(bmp: ImageBitmap, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality),
  )
}

// ---------- Descargas ----------

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

/** PDF de una página con el alto de la imagen: se lee igual que la cotización. */
export async function imageToPdf(blob: Blob, title: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const bmp = await createImageBitmap(blob)
  const w = 210
  const h = (bmp.height / bmp.width) * w
  bmp.close?.()
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true })
  pdf.addImage(await blobToDataUrl(blob), 'JPEG', 0, 0, w, h, undefined, 'FAST')
  pdf.setProperties({ title, author: 'Falcon Electronic del Perú' })
  return pdf.output('blob')
}

/** Nombre de archivo sin tildes ni espacios: algunos navegadores descartan el nombre si trae caracteres raros. */
export const safeFileName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_|_$/g, '') || 'archivo'

// ---------- base64 ----------

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function blobToBase64(blob: Blob) {
  const url = await blobToDataUrl(blob)
  return url.slice(url.indexOf(',') + 1)
}

function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}
