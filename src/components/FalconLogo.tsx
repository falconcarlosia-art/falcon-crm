/** Isotipo de Falcon: anillo naranja con la "F" en degradado y dos nodos laterales. */
export function FalconMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="falcon-f" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbb03b" />
          <stop offset="1" stopColor="#f26522" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="27" fill="none" stroke="#f7941d" strokeWidth="2.5" />
      <circle cx="5" cy="32" r="2.6" fill="#f7941d" />
      <circle cx="59" cy="32" r="2.6" fill="#f7941d" />
      <path d="M22 17h24l-3 8H31.5l-1.6 5H41l-3 8H27.3L24.5 47H16z" fill="url(#falcon-f)" />
    </svg>
  )
}
