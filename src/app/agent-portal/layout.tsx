import { Merriweather } from 'next/font/google'

// Never prerender/cache this page's HTML. The production proxy (Cloudways Varnish) honored
// the static page's `s-maxage=31536000` and kept serving days-old HTML that pointed at CSS
// chunks from a previous build — those 404 after every deploy, so the portal rendered
// unstyled until a hard refresh. Dynamic rendering sends `Cache-Control: no-store` instead.
export const dynamic = 'force-dynamic'

// Self-hosted via next/font (was a runtime @import from Google Fonts inside the page) so the
// headline font is ready on first paint instead of swapping in after the hero has rendered.
const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['700', '900'],
  variable: '--font-merriweather',
  display: 'swap',
})

export default function AgentPortalLayout({ children }: { children: React.ReactNode }) {
  return <div className={merriweather.variable}>{children}</div>
}
