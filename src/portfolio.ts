import { loadProducts, loadServices, type Product, type Service } from './supabase'
import { toDataUrl } from './quotes'

export interface PortfolioGroup {
  category: string
  items: Product[]
}

export interface PortfolioData {
  groups: PortfolioGroup[]
  /** Todas las líneas de producto (aunque no entren todos sus productos). */
  categories: { name: string; count: number }[]
  total: number
  services: Service[]
  /** Miniaturas como data URL por id de producto (null si la foto no se pudo leer). */
  thumbs: Record<string, string | null>
}

const OTHER = 'Otros'

/**
 * Elige qué productos van al portafolio: los destacados primero y repartidos
 * entre categorías (uno por categoría por vuelta), para que se vea la variedad
 * aunque el límite no alcance para todo el catálogo. Luego se agrupan.
 */
export function pickPortfolio(products: Product[], max: number): PortfolioGroup[] {
  const byCat = new Map<string, Product[]>()
  for (const p of products) {
    const k = p.category || OTHER
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k)!.push(p)
  }
  const cats = [...byCat.entries()]
    .map(([category, items]) => ({
      category,
      queue: [...items].sort(
        (a, b) => Number(b.featured) - Number(a.featured) || Number(!!b.imageUrl) - Number(!!a.imageUrl) || a.name.localeCompare(b.name),
      ),
    }))
    // Categorías grandes primero; "Otros" siempre al final.
    .sort((a, b) => Number(a.category === OTHER) - Number(b.category === OTHER) || b.queue.length - a.queue.length)
  const picked = new Map<string, Product[]>(cats.map((c) => [c.category, []]))
  let left = max
  // Primera pasada: solo destacados; después, el resto, siempre por turnos.
  for (const featuredOnly of [true, false]) {
    let progress = true
    while (left > 0 && progress) {
      progress = false
      for (const c of cats) {
        if (left <= 0) break
        const i = c.queue.findIndex((p) => !featuredOnly || p.featured)
        if (i < 0) continue
        picked.get(c.category)!.push(...c.queue.splice(i, 1))
        left--
        progress = true
      }
    }
  }
  return cats.map((c) => ({ category: c.category, items: picked.get(c.category)! })).filter((g) => g.items.length)
}

const thumbCache = new Map<string, Promise<string | null>>()
function thumb(p: Product) {
  if (!p.imageUrl) return Promise.resolve(null)
  if (!thumbCache.has(p.id)) thumbCache.set(p.id, toDataUrl(p.imageUrl, 240))
  return thumbCache.get(p.id)!
}

/** Junta todo lo que dibuja la página 2. null si no hay catálogo que mostrar. */
export async function loadPortfolio(max: number): Promise<PortfolioData | null> {
  const [products, services] = await Promise.all([loadProducts().catch(() => []), loadServices().catch(() => [])])
  if (!products.length && !services.length) return null
  const groups = pickPortfolio(products, max)
  const chosen = groups.flatMap((g) => g.items)
  // Descargas de a pocas para no saturar la conexión del celular.
  const thumbs: Record<string, string | null> = {}
  for (let i = 0; i < chosen.length; i += 6) {
    const batch = chosen.slice(i, i + 6)
    const got = await Promise.all(batch.map(thumb))
    batch.forEach((p, j) => (thumbs[p.id] = got[j]))
  }
  const counts = new Map<string, number>()
  products.forEach((p) => counts.set(p.category || OTHER, (counts.get(p.category || OTHER) ?? 0) + 1))
  const categories = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => Number(a.name === OTHER) - Number(b.name === OTHER) || b.count - a.count)
  return { groups, categories, total: products.length, services, thumbs }
}
