export type TenantBranding = {
  logoUrl: string
  name: string
  bgColor: string
  sidebarBg?: string
  primaryColor?: string
  primaryHover?: string
  showName?: boolean
}

const TENANT_MAP: Record<string, TenantBranding> = {
  siloina: {
    logoUrl:      'https://siloina.com/wp-content/uploads/2024/09/Siloina-Logo.png',
    name:         'Siloina Surf Charter',
    bgColor:      '#1a3050',
    sidebarBg:    '#8a9c7e',
    primaryColor: '#5F6957',
    primaryHover: '#4e5847',
    showName:     true,
  },
}

const DEFAULT: TenantBranding = {
  logoUrl:  'https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png',
  name:     'Samara Liveaboard',
  bgColor:  '#0c2e3a',
  showName: true,
}

export function getTenantBranding(slug?: string | null): TenantBranding {
  if (!slug || slug === 'samara') return DEFAULT
  return TENANT_MAP[slug] ?? DEFAULT
}
