export type InventoryCategoryId =
  | 'protein'
  | 'dairy'
  | 'produce'
  | 'frozen'
  | 'sauces'
  | 'dry'
  | 'packaging'
  | 'other'

export type InventoryStorageId = 'freezer' | 'fridge' | 'dry'

export interface InventoryCategory {
  id: InventoryCategoryId
  label: string
  defaultStorage: InventoryStorageId
}

export const INVENTORY_CATEGORIES: InventoryCategory[] = [
  { id: 'protein', label: 'بروتين ولحوم', defaultStorage: 'freezer' },
  { id: 'dairy', label: 'أجبان وألبان', defaultStorage: 'fridge' },
  { id: 'produce', label: 'خضار وفواكه طازجة', defaultStorage: 'fridge' },
  { id: 'frozen', label: 'بطاطس ومقبلات مجمدة', defaultStorage: 'freezer' },
  { id: 'sauces', label: 'صوصات وتوابل', defaultStorage: 'dry' },
  { id: 'dry', label: 'مواد جافة وعجائن', defaultStorage: 'dry' },
  { id: 'packaging', label: 'تغليف ومستلزمات', defaultStorage: 'dry' },
  { id: 'other', label: 'مشروبات وأخرى', defaultStorage: 'dry' },
]

export const STORAGE_OPTIONS: { id: InventoryStorageId; label: string }[] = [
  { id: 'freezer', label: 'فريزر' },
  { id: 'fridge', label: 'ثلاجة' },
  { id: 'dry', label: 'رف جاف' },
]

const CATEGORY_BY_INGREDIENT_ID: Record<string, InventoryCategoryId> = {
  'ing-shawarma-cold': 'protein',
  'ing-shawarma-hot': 'protein',
  'ing-baniye': 'protein',
  'ing-pepperoni': 'protein',
  'ing-burger': 'protein',
  'ing-basturma': 'protein',
  'ing-beef': 'protein',
  'ing-bacon': 'protein',
  'ing-turkey': 'protein',
  'ing-zinger': 'protein',
  'ing-shish': 'protein',
  'ing-chicken-breast': 'protein',
  'ing-breast-marinated': 'protein',
  'ing-crunchy-cold': 'protein',
  'ing-crunchy-hot': 'protein',
  'ing-kofta': 'protein',
  'ing-cordon-blue': 'protein',
  'ing-hotdog': 'protein',
  'ing-shrimp': 'protein',
  'ing-fajita': 'protein',
  'ing-sausage': 'protein',
  'ing-sosis': 'protein',

  'ing-mozzarella': 'dairy',
  'ing-rome-cheese': 'dairy',
  'ing-cheddar': 'dairy',
  'ing-milk-powder': 'dairy',
  'ing-butter': 'dairy',

  'ing-onion': 'produce',
  'ing-lettuce': 'produce',
  'ing-olives': 'produce',
  'ing-tomato': 'produce',
  'ing-pepper': 'produce',
  'ing-pepper-mix': 'produce',
  'ing-jalapeno': 'produce',
  'ing-mushroom': 'produce',
  'ing-pickle': 'produce',

  'ing-crispy-potato': 'frozen',
  'ing-mozz-stick': 'frozen',
  'ing-onion-rings': 'frozen',
  'ing-farm': 'frozen',

  'ing-bbq': 'sauces',
  'ing-buffalo': 'sauces',
  'ing-tiger': 'sauces',
  'ing-teriyaki': 'sauces',
  'ing-texas': 'sauces',
  'ing-spices': 'sauces',
  'ing-chicken-cold': 'sauces',
  'ing-pomegranate': 'sauces',
  'ing-ranch': 'sauces',
  'ing-cancheese': 'sauces',
  'ing-ketchup': 'sauces',
  'ing-mayo': 'sauces',
  'ing-mayo-classic': 'sauces',
  'ing-mustard': 'sauces',
  'ing-sauce-bbq': 'sauces',
  'ing-balsamic': 'sauces',
  'ing-sauce-garlic': 'sauces',
  'ing-sauce-spicy': 'sauces',
  'ing-sauce-jalapeno': 'sauces',
  'ing-fajita-sauce': 'sauces',
  'ing-pistachio-sauce': 'sauces',
  'ing-kinder-sauce': 'sauces',
  'ing-lotus-sauce': 'sauces',
  'ing-hot-sauce': 'sauces',
  'ing-harissa': 'sauces',

  'ing-egg-white-powder': 'dry',
  'ing-egg-powder': 'dry',
  'ing-baking-powder': 'dry',
  'ing-flour': 'dry',
  'ing-sugar': 'dry',
  'ing-powdered-sugar': 'dry',
  'ing-oil': 'dry',
  'ing-water': 'dry',
  'ing-vanilla': 'dry',
  'ing-honey': 'dry',
  'ing-hall-crepe': 'dry',
  'ing-tiktaway-crepe': 'dry',
  'ing-waffle': 'dry',

  'ing-sticky-disc': 'packaging',
  'ing-prod-sticker': 'packaging',
  'ing-sandwich-paper': 'packaging',
  'ing-potato-box': 'packaging',
  'ing-potato-box-mix': 'packaging',
  'ing-butter-paper': 'packaging',

  'ing-tatj': 'other',
  'ing-mint-syrup': 'other',

  // Browser-demo / legacy ids
  'ing-eggs': 'protein',
  'ing-milk': 'dairy',
  'ing-bread': 'dry',
  'ing-dough': 'dry',
  'ing-cheese': 'dairy',
  'ing-mozz': 'dairy',
  'ing-potato': 'frozen',
  'ing-cola': 'other',
  'ing-nutella': 'other',
  'ing-banana': 'produce',
  'ing-nuts': 'dry',
  'ing-sauce-ketchup': 'sauces',
  'ing-sauce-mayo': 'sauces',
  'ing-sauce-ranch': 'sauces',
  'ing-lemon': 'produce',
  'ing-mango': 'produce',
  'ing-strawberry': 'produce',
  'ing-tea': 'other',
}

const STORAGE_OVERRIDES: Record<string, InventoryStorageId> = {
  'ing-milk-powder': 'dry',
  'ing-pepperoni': 'fridge',
  'ing-basturma': 'fridge',
  'ing-beef': 'fridge',
  'ing-bacon': 'fridge',
  'ing-turkey': 'fridge',
  'ing-chicken-breast': 'fridge',
  'ing-breast-marinated': 'fridge',
  'ing-fajita': 'fridge',
  'ing-baniye': 'freezer',
  'ing-shrimp': 'freezer',
  'ing-eggs': 'fridge',
  'ing-milk': 'fridge',
  'ing-cheese': 'fridge',
  'ing-mozz': 'fridge',
  'ing-banana': 'fridge',
  'ing-lemon': 'fridge',
  'ing-mango': 'fridge',
  'ing-strawberry': 'fridge',
}

const CATEGORY_IDS = new Set(INVENTORY_CATEGORIES.map((c) => c.id))
const STORAGE_IDS = new Set(STORAGE_OPTIONS.map((s) => s.id))

export function categoryForIngredient(id: string): InventoryCategoryId {
  return CATEGORY_BY_INGREDIENT_ID[id] || 'other'
}

export function defaultStorageForCategory(category: string): InventoryStorageId {
  return INVENTORY_CATEGORIES.find((c) => c.id === category)?.defaultStorage || 'dry'
}

export function storageForIngredient(id: string): InventoryStorageId {
  return STORAGE_OVERRIDES[id] || defaultStorageForCategory(categoryForIngredient(id))
}

export function categoryLabel(id: string | null | undefined): string {
  return INVENTORY_CATEGORIES.find((c) => c.id === id)?.label || INVENTORY_CATEGORIES[7].label
}

export function storageLabel(id: string | null | undefined): string {
  return STORAGE_OPTIONS.find((s) => s.id === id)?.label || STORAGE_OPTIONS[2].label
}

export function normalizeCategory(value: unknown): InventoryCategoryId {
  return CATEGORY_IDS.has(String(value) as InventoryCategoryId)
    ? String(value) as InventoryCategoryId
    : 'other'
}

export function normalizeStorage(value: unknown, category?: unknown): InventoryStorageId {
  if (STORAGE_IDS.has(String(value) as InventoryStorageId)) return String(value) as InventoryStorageId
  return defaultStorageForCategory(normalizeCategory(category))
}
