import localFont from 'next/font/local'

// Never prerender/cache this page's HTML. The production proxy (Cloudways Varnish) honored
// the static page's `s-maxage=31536000` and kept serving days-old HTML that pointed at CSS
// chunks from a previous build — those 404 after every deploy, so the portal rendered
// unstyled until a hard refresh. Dynamic rendering sends `Cache-Control: no-store` instead.
export const dynamic = 'force-dynamic'

// Self-hosted from @fontsource/merriweather via next/font/local. next/font/google broke
// `next build` under Turbopack ("next/font/google queries have exactly one entry") and also
// made the build depend on reaching Google Fonts; local files avoid both.
const merriweather = localFont({
  src: [
    { path: '../../../node_modules/@fontsource/merriweather/files/merriweather-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../../../node_modules/@fontsource/merriweather/files/merriweather-latin-900-normal.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-merriweather',
  display: 'swap',
})

export default function AgentPortalLayout({ children }: { children: React.ReactNode }) {
  return <div className={merriweather.variable}>{children}</div>
}
