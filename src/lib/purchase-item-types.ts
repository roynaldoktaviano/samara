export type PurchaseItemType = 'FOOD' | 'BEVERAGE' | 'MAINTENANCE' | 'MATERIAL' | 'DIVING' | 'HOUSEKEEPING'

export const ITEM_TYPES: PurchaseItemType[] = ['FOOD', 'BEVERAGE', 'MAINTENANCE', 'MATERIAL', 'DIVING', 'HOUSEKEEPING']

export const ITEM_TYPE_LABELS: Record<PurchaseItemType, string> = {
  FOOD: 'Food',
  BEVERAGE: 'Beverage',
  MAINTENANCE: 'Maintenance',
  MATERIAL: 'Material',
  DIVING: 'Diving',
  HOUSEKEEPING: 'Housekeeping',
}

export const TYPE_CATEGORIES: Record<PurchaseItemType, string[]> = {
  FOOD: ['Dairy', 'Dry Food', 'Frozen Food', 'Seasoning', 'Meat & Seafood', 'Fruit & Vegetable', 'Bakery', 'Other'],
  BEVERAGE: ['White Wine', 'Red Wine', 'Rosé Wine', 'Sparkling Wine', 'Champagne', 'Liquor', 'Cocktail', 'Beer', 'Soft Drink', 'Other'],
  MAINTENANCE: ['Engine', 'Electrical', 'Plumbing', 'Safety Equipment', 'Tools', 'Other'],
  MATERIAL: ['General', 'Other'],
  DIVING: ['General', 'Other'],
  HOUSEKEEPING: ['General', 'Other'],
}

export const SKU_PREFIX: Record<PurchaseItemType, string> = {
  FOOD: 'FOOD',
  BEVERAGE: 'BEV',
  MAINTENANCE: 'MAINT',
  MATERIAL: 'MAT',
  DIVING: 'DIVE',
  HOUSEKEEPING: 'HSKP',
}
