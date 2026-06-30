export type PurchaseItemType = 'FOOD' | 'BEVERAGE' | 'SPAREPART'

export const ITEM_TYPES: PurchaseItemType[] = ['FOOD', 'BEVERAGE', 'SPAREPART']

export const ITEM_TYPE_LABELS: Record<PurchaseItemType, string> = {
  FOOD: 'Food',
  BEVERAGE: 'Beverage',
  SPAREPART: 'Sparepart',
}

export const ITEM_TYPE_ICONS: Record<PurchaseItemType, string> = {
  FOOD: '🍽️',
  BEVERAGE: '🍷',
  SPAREPART: '🔧',
}

export const TYPE_CATEGORIES: Record<PurchaseItemType, string[]> = {
  FOOD: ['Dairy', 'Dry Food', 'Frozen Food', 'Seasoning', 'Meat & Seafood', 'Fruit & Vegetable', 'Bakery', 'Other'],
  BEVERAGE: ['White Wine', 'Red Wine', 'Rosé Wine', 'Sparkling Wine', 'Champagne', 'Liquor', 'Cocktail', 'Beer', 'Soft Drink', 'Other'],
  SPAREPART: ['Engine', 'Electrical', 'Plumbing', 'Safety Equipment', 'Tools', 'Other'],
}

export const SKU_PREFIX: Record<PurchaseItemType, string> = {
  FOOD: 'FOOD',
  BEVERAGE: 'BEV',
  SPAREPART: 'SPARE',
}
