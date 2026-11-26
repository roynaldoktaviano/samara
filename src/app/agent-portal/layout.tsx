import localFont from 'next/font/local'
import './portal.css'

// Never prerender/cache this page's HTML. The production proxy (Cloudways Varnish) honored
// the static page's `s-maxage=31536000` and kept serving days-old HTML that pointed at CSS
// chunks from a previous build — those 404 after every deploy, so the portal rendered
// unstyled until a hard refresh. Dynamic rendering sends `Cache-Control: no-store` instead.
export const dynamic = 'force-dynamic'

// Self-hosted via next/font/local (files copied from @fontsource/*). next/font/google broke
// `next build` under Turbopack ("next/font/google queries have exactly one entry") and also
// made the build depend on reaching Google Fonts. The files live in the repo rather than
// node_modules so the build works even when the server skips `npm install`.
// Only used for the SAMARA wordmark (see BrandLogo in ./page.tsx).
const serif = localFont({
  src: [{ path: './fonts/cormorant-garamond-latin-600-normal.woff2', weight: '600', style: 'normal' }],
  variable: '--font-ap-serif',
  display: 'swap',
})

const sans = localFont({
  src: [
    { path: './fonts/dm-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/dm-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/dm-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/dm-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-ap-sans',
  display: 'swap',
})

export default function AgentPortalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${serif.variable} ${sans.variable} ap-root`}>{children}</div>
}
