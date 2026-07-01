import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Samara Cashier',
    short_name: 'Cashier',
    description: 'Samara Liveaboard point-of-sale cashier',
    start_url: '/cashier',
    scope: '/cashier',
    display: 'standalone',
    orientation: 'any',
    background_color: '#fafaf8',
    theme_color: '#bdac7e',
    icons: [
      {
        src: 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  }
}
