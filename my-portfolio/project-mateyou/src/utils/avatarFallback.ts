const FALLBACK_COLORS = [
  'bg-red-400',
  'bg-blue-400',
  'bg-green-400',
  'bg-yellow-400',
  'bg-purple-400',
  'bg-pink-400',
  'bg-indigo-400',
  'bg-teal-400',
]

export function getInitialsFromName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function getAvatarBgColor(name?: string | null): string {
  if (!name || typeof name !== 'string' || !name.trim()) return 'bg-gray-400'
  const index = name.trim().charCodeAt(0) % FALLBACK_COLORS.length
  return FALLBACK_COLORS[index]
}

