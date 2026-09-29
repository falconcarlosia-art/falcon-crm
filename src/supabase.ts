import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = import.meta.env
const url = env.VITE_SUPABASE_URL as string | undefined
const key = env.VITE_SUPABASE_ANON_KEY as string | undefined

// Nombres configurables: el esquema real de la tabla vive fuera de este repo.
const cfg = {
  table: env.VITE_PRODUCTS_TABLE || 'productos',
  id: env.VITE_PRODUCTS_COL_ID || 'id',
  name: env.VITE_PRODUCTS_COL_NAME || 'nombre',
  price: env.VITE_PRODUCTS_COL_PRICE || 'precio',
  image: env.VITE_PRODUCTS_COL_IMAGE || '',
  sku: env.VITE_PRODUCTS_COL_SKU || '',
  active: env.VITE_PRODUCTS_COL_ACTIVE || '',
  /** Columnas extra que entran en la búsqueda (p. ej. marca y modelo), separadas por coma. */
  extra: ((env.VITE_PRODUCTS_COL_EXTRA as string | undefined) || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean),
  bucket: env.VITE_PRODUCTS_IMAGE_BUCKET || '',
  // Opcionales: descripción corta en la cotización y portafolio (página 2).
  desc: env.VITE_PRODUCTS_COL_DESC || '',
  category: env.VITE_PRODUCTS_COL_CATEGORY || '',
  brand: env.VITE_PRODUCTS_COL_BRAND || '',
  featured: env.VITE_PRODUCTS_COL_FEATURED || '',
  servicesTable: env.VITE_SERVICES_TABLE || '',
  priceWithoutIgv: env.VITE_PRODUCTS_PRICE_WITHOUT_IGV === 'true',
}

export const productsConfigured = Boolean(url && key)
const client: SupabaseClient | null = productsConfigured ? createClient(url!, key!, { auth: { persistSession: false } }) : null

export interface Product {
  id: string
  name: string
  /** Precio final con IGV, en soles. */
  price: number
  imageUrl: string | null
  sku: string | null
  /** Texto extra para la búsqueda (marca, modelo…). */
  keywords?: string
  /** Descripción corta (una o dos líneas) para la cotización. */
  description: string
  category: string
  brand: string
  /** Destacado: sale primero en el portafolio. */
  featured: boolean
}

export interface Service {
  id: string
  title: string
  category: string
}

let cache: Promise<Product[]> | null = null

/** Catálogo completo (se cachea en la sesión); la búsqueda se hace en el cliente. */
export function loadProducts(force = false): Promise<Product[]> {
  if (!client) return Promise.resolve([])
  if (!cache || force) {
    cache = fetchAll(client).catch((err) => {
      cache = null
      throw err
    })
  }
  return cache
}

async function fetchAll(sb: SupabaseClient): Promise<Product[]> {
  const cols = [
    ...new Set(
      [cfg.id, cfg.name, cfg.price, cfg.image, cfg.sku, cfg.desc, cfg.category, cfg.brand, cfg.featured, ...cfg.extra].filter(
        Boolean,
      ),
    ),
  ].join(',')
  const out: Product[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    // Columnas dinámicas: se tipan como '*' para que supabase-js no intente
    // inferir el tipo de fila a partir del string (explota el compilador).
    let q = sb
      .from(cfg.table)
      .select(cols as '*')
      .order(cfg.name)
      .range(from, from + PAGE - 1)
    if (cfg.active) q = q.filter(cfg.active, 'eq', true)
    const { data, error } = await q
    if (error) throw new Error(`Supabase: ${error.message}`)
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    rows.forEach((r) => out.push(toProduct(sb, r)))
    if (rows.length < PAGE) break
  }
  return out
}

function toProduct(sb: SupabaseClient, r: Record<string, unknown>): Product {
  let price = Number(r[cfg.price] ?? 0) || 0
  if (cfg.priceWithoutIgv) price = Math.round(price * 1.18 * 100) / 100
  // La columna de imagen puede ser un texto o una lista de fotos: se usa la primera.
  const raw = cfg.image ? r[cfg.image] : null
  let img = (Array.isArray(raw) ? raw.find((x) => typeof x === 'string' && x) : raw) as string | null | undefined
  img = typeof img === 'string' ? img.trim() : null
  if (img && !/^https?:|^data:/.test(img) && cfg.bucket) {
    img = sb.storage.from(cfg.bucket).getPublicUrl(img).data.publicUrl
  } else if (img && !/^https?:|^data:/.test(img)) {
    img = null // ruta relativa sin bucket configurado: no hay de dónde cargarla
  }
  return {
    id: String(r[cfg.id]),
    name: String(r[cfg.name] ?? ''),
    price,
    imageUrl: img || null,
    sku: cfg.sku && r[cfg.sku] != null ? String(r[cfg.sku]) : null,
    keywords: cfg.extra.map((c) => (r[c] == null ? '' : String(r[c]))).join(' '),
    description: cfg.desc ? shortText(r[cfg.desc]) : '',
    category: cfg.category && r[cfg.category] != null ? String(r[cfg.category]).trim() : '',
    brand: cfg.brand && r[cfg.brand] != null ? String(r[cfg.brand]).trim() : '',
    featured: cfg.featured ? r[cfg.featured] === true : false,
  }
}

export function searchProducts(all: Product[], text: string): Product[] {
  const words = normalize(text).split(/\s+/).filter(Boolean)
  if (!words.length) return all.slice(0, 30)
  return all
    .filter((p) => {
      const hay = normalize(`${p.name} ${p.sku ?? ''} ${p.keywords ?? ''}`)
      return words.every((w) => hay.includes(w))
    })
    .slice(0, 30)
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/**
 * Resume una descripción larga a una o dos líneas: sin HTML ni markdown, hasta
 * el primer punto si cabe, o cortada en una palabra con "…".
 */
export function shortText(raw: unknown, max = 120): string {
  if (typeof raw !== 'string') return ''
  const s = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_#>`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length <= max) return s
  const dot = s.slice(0, max).search(/[.!?](\s|$)(?!.*[.!?](\s|$))/)
  if (dot >= 40) return s.slice(0, dot + 1)
  const cut = s.slice(0, max - 1)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[,;:\s-]+$/, '') + '…'
}

let servicesCache: Promise<Service[]> | null = null

/** Servicios de la empresa (tabla opcional) para el portafolio. Si no hay permiso, lista vacía. */
export function loadServices(): Promise<Service[]> {
  if (!client || !cfg.servicesTable) return Promise.resolve([])
  if (!servicesCache) {
    const sb = client
    servicesCache = (async () => {
      let q = sb.from(cfg.servicesTable).select('id,title,category' as '*').order('title')
      q = q.filter('active', 'eq', true)
      const { data, error } = await q
      if (error) return []
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        title: String(r.title ?? '').trim(),
        category: String(r.category ?? '').trim(),
      })).filter((x) => x.title)
    })()
  }
  return servicesCache
}
