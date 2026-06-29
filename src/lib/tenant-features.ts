export type TenantFeatureKey = 'sharingCabin' | 'agentContract' | 'purchasing'

export interface TenantFeatures {
  sharingCabin?: boolean
  agentContract?: boolean
  purchasing?: boolean
}

export const TENANT_FEATURE_DEFINITIONS: {
  key: TenantFeatureKey
  label: string
  description: string
}[] = [
  {
    key: 'sharingCabin',
    label: 'Sharing Cabin',
    description: 'Allow guests to share a cabin with other passengers',
  },
  {
    key: 'agentContract',
    label: 'Agent Contract',
    description: 'Allow generating and printing agent agreement contracts',
  },
  {
    key: 'purchasing',
    label: 'Purchasing & Inventory',
    description: 'Purchasing, warehouse management, and ship inventory module',
  },
]

const VALID_KEYS = new Set<string>(TENANT_FEATURE_DEFINITIONS.map(f => f.key))

/** Validates and strips unknown keys from a features object */
export function parseTenantFeatures(raw: unknown): TenantFeatures {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: TenantFeatures = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (VALID_KEYS.has(k) && typeof v === 'boolean') {
      result[k as TenantFeatureKey] = v
    }
  }
  return result
}
