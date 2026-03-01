// Simple favicon management with PNG transparent background
export function updateFavicon() {
  // Get or create favicon link element
  let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.rel = 'icon'
    favicon.type = 'image/png'
    document.head.appendChild(favicon)
  }

  // Use single PNG favicon with transparent background
  favicon.href = '/favicon.png'
}

// Initialize favicon
export function initializeFavicon() {
  // Set favicon
  updateFavicon()
}