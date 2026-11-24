// Item Category codes (PurchaseItem.type). The live list is PurchaseItemTypeConfig in the DB;
// these constants back the hard-coded catalog filter chips. Restructured 2026-11-24 —
// Maintenance/Housekeeping merged into Supply, Material/Diving retired (see
// scripts/migrate-item-categories-supply.ts).
export type PurchaseItemType = 'FOOD' | 'BEVERAGE' | 'FUEL' | 'ASSET' | 'SUPPLY'

export const ITEM_TYPES: PurchaseItemType[] = ['FOOD', 'BEVERAGE', 'FUEL', 'ASSET', 'SUPPLY']

export const ITEM_TYPE_LABELS: Record<PurchaseItemType, string> = {
  FOOD: 'Food',
  BEVERAGE: 'Beverage',
  FUEL: 'Fuel',
  ASSET: 'Asset',
  SUPPLY: 'Supply',
}

export const TYPE_CATEGORIES: Record<PurchaseItemType, string[]> = {
  FOOD: ['Dairy', 'Dry Food', 'Frozen Food', 'Seasoning', 'Meat & Seafood', 'Fruit & Vegetable', 'Bakery', 'Other'],
  BEVERAGE: ['White Wine', 'Red Wine', 'Rosé Wine', 'Sparkling Wine', 'Champagne', 'Liquor', 'Cocktail', 'Beer', 'Soft Drink', 'Other'],
  FUEL: [],
  ASSET: ['General', 'Other'],
  SUPPLY: ['Engine', 'Electrical', 'Plumbing', 'Safety Equipment', 'Tools', 'Housekeeping', 'Linen', 'General', 'Other'],
}

export const SKU_PREFIX: Record<PurchaseItemType, string> = {
  FOOD: 'FOOD',
  BEVERAGE: 'BEV',
  FUEL: 'FUEL',
  ASSET: 'AST',
  SUPPLY: 'SUP',
}
