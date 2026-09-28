import { isValidPhone, normalizePhone } from './phone'

const NAME_HEADER = /^(nombre|nombres|name|cliente|contacto|raz[oó]n social)/i
const PHONE_HEADER = /(tel|cel|phone|whats|n[uú]mero|m[oó]vil|movil)/i
const PHONE_IN_TEXT = /(\+?\d[\d\s().-]{7,}\d)/

/** Convierte filas sueltas (CSV, Excel o texto pegado) en pares nombre/teléfono. */
export function rowsToCandidates(rows: string[][]): { name: string; rawPhone: string }[] {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean))
  if (!clean.length) return []

  // Con encabezados reconocibles se usan esas columnas.
  const head = clean[0]
  let nameCol = head.findIndex((h) => NAME_HEADER.test(h))
  let phoneCol = head.findIndex((h) => PHONE_HEADER.test(h))
  const body = nameCol >= 0 || phoneCol >= 0 ? clean.slice(1) : clean

  // Sin encabezados: la columna de teléfono es la que más números válidos tiene.
  if (phoneCol < 0) {
    const width = Math.max(...body.map((r) => r.length))
    let best = -1
    for (let c = 0; c < width; c++) {
      const hits = body.filter((r) => isValidPhone(normalizePhone(r[c] ?? ''))).length
      if (hits > best) [best, phoneCol] = [hits, c]
    }
  }
  if (nameCol < 0) nameCol = body[0]?.findIndex((v, i) => i !== phoneCol && /\p{L}/u.test(v)) ?? -1

  return body.map((r) => {
    // Una sola celda tipo "Pedro Ramírez 931 324 454": se separa por regex.
    if (r.length === 1) {
      const m = PHONE_IN_TEXT.exec(r[0])
      return {
        name: m ? r[0].replace(m[0], '').replace(/[,;:\-–|]+/g, ' ').replace(/\s+/g, ' ').trim() : r[0],
        rawPhone: m?.[0] ?? '',
      }
    }
    return { name: nameCol >= 0 ? (r[nameCol] ?? '') : '', rawPhone: r[phoneCol] ?? '' }
  })
}

export function splitText(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  const sample = lines.slice(0, 5).join('\n')
  const sep = sample.includes('\t') ? '\t' : sample.includes(';') ? ';' : sample.includes(',') ? ',' : null
  return lines.map((l) => (sep ? splitLine(l, sep) : [l]))
}

/** CSV mínimo con comillas ("Ramírez, Pedro"). */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (ch === sep && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}
