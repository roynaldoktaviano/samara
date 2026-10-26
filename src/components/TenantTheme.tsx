import type { TenantBranding } from '@/lib/tenant-branding'

/**
 * Per-tenant colour overrides. Emits CSS variables only — every component reads
 * colour from tokens (globals.css), so overriding the variables re-themes the app
 * without selector hacks or !important.
 */
export function TenantTheme({ slug, branding }: { slug: string; branding: TenantBranding }) {
  const vars: string[] = []
  if (branding.primaryColor) {
    vars.push(`--primary: ${branding.primaryColor};`, `--ring: ${branding.primaryColor};`, `--brand-teal: ${branding.primaryColor};`)
  }
  if (branding.primaryHover) {
    vars.push(`--primary-hover: ${branding.primaryHover};`, `--brand-teal-hover: ${branding.primaryHover};`)
  }
  if (branding.primaryColor) {
    vars.push(`--sidebar-primary: ${branding.primaryColor};`, `--sidebar-ring: ${branding.primaryColor};`)
  }
  const sidebar: string[] = []
  if (branding.sidebarBg) {
    sidebar.push(
      `--sidebar: ${branding.sidebarBg};`,
      '--sidebar-foreground: rgba(255,255,255,0.86);',
      '--sidebar-muted-foreground: rgba(255,255,255,0.6);',
      '--sidebar-accent: rgba(255,255,255,0.12);',
      '--sidebar-accent-foreground: #ffffff;',
      '--sidebar-active: rgba(255,255,255,0.18);',
      '--sidebar-active-foreground: #ffffff;',
      '--sidebar-border: rgba(255,255,255,0.18);',
    )
  }
  if (!vars.length && !sidebar.length) return null
  const sel = `[data-tenant="${slug.replace(/[^a-z0-9_-]/gi, '')}"]`
  return (
    <style>{`${sel} { ${vars.join(' ')} }\n${sel} [data-sidebar="sidebar"] { ${sidebar.join(' ')} }`}</style>
  )
}
