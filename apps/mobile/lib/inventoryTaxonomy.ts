// The inventory taxonomy labels, mirrored from the till's
// src/lib/inventory-taxonomy.ts. Metro cannot reach the Electron root, and the
// server stores the ids, so only the labels need to match.

export type InventoryCategoryId =
  | 'protein'
  | 'dairy'
  | 'produce'
  | 'frozen'
  | 'sauces'
  | 'dry'
  | 'packaging'
  | 'other';

export type InventoryStorageId = 'freezer' | 'fridge' | 'dry';

export interface InventoryCategory {
  id: InventoryCategoryId;
  label: string;
  defaultStorage: InventoryStorageId;
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
];

export const STORAGE_OPTIONS: { id: InventoryStorageId; label: string }[] = [
  { id: 'freezer', label: 'فريزر' },
  { id: 'fridge', label: 'ثلاجة' },
  { id: 'dry', label: 'رف جاف' },
];

export const categoryLabel = (id: string | null | undefined): string =>
  INVENTORY_CATEGORIES.find((category) => category.id === id)?.label ?? 'غير مصنف';

export const storageLabel = (id: string | null | undefined): string =>
  STORAGE_OPTIONS.find((storage) => storage.id === id)?.label ?? '—';
