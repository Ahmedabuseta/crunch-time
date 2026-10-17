// The one place query keys are defined, so a read, a mutation and its
// invalidation can never drift apart. Keys are built as prefixes: invalidating
// `['orders']` reaches every order list and every order detail.
export const qk = {
  // ─── Menu + catalogue ───────────────────────────────────────
  menu: ['menu'] as const,
  productOptions: (productId: string) => ['menu', 'products', productId, 'options'] as const,
  categories: ['categories'] as const,
  products: (categoryId?: string) => ['products', { categoryId: categoryId ?? null }] as const,
  addons: ['addons'] as const,
  productRecipes: (productId: string) => ['products', productId, 'recipes'] as const,
  subRecipes: ['sub-recipes'] as const,

  // ─── Store ──────────────────────────────────────────────────
  settings: ['settings'] as const,
  printers: ['printers'] as const,
  health: ['health'] as const,
  backupStatus: ['backup', 'status'] as const,

  // ─── Orders ─────────────────────────────────────────────────
  orders: (filters?: object) => ['orders', filters ?? {}] as const,
  order: (id: string) => ['orders', id] as const,

  // ─── Delivery ───────────────────────────────────────────────
  deliveryZones: ['delivery-zones'] as const,
  deliveryProfiles: ['delivery-profiles'] as const,

  // ─── Shift + drawer ─────────────────────────────────────────
  currentShift: ['shifts', 'current'] as const,
  cashDrawer: (shiftId: string) => ['cash-drawer', shiftId] as const,

  // ─── Inventory ──────────────────────────────────────────────
  ingredients: ['ingredients'] as const,
  ingredientLedger: (id: string) => ['ingredients', id, 'ledger'] as const,
  inventoryAlerts: ['inventory', 'alerts'] as const,

  // ─── Reports ────────────────────────────────────────────────
  reports: (name: string, query?: object) => ['reports', name, query ?? {}] as const,
  zReport: (shiftId?: string) => ['reports', 'z', shiftId ?? 'current'] as const,
  shiftSummary: (query?: object) => ['reports', 'shift-summary', query ?? {}] as const,
  shiftReport: (id: string) => ['reports', 'shift', id] as const,

  // ─── Admin: staff ───────────────────────────────────────────
  users: ['users'] as const,

  /**
   * A paged list's key: everything that defines the list except the page, which
   * React Query carries as the page param. Prefixed by the resource, so the
   * existing `qkPrefix` invalidations still reach it.
   */
  paged: (resource: string, query?: object) => [resource, 'paged', query ?? {}] as const,

  /** One record, for an edit form. Same resource prefix, so a write to the list
   * still refreshes the form's copy of a row. */
  product: (id: string) => ['products', id] as const,
  category: (id: string) => ['categories', id] as const,
  ingredient: (id: string) => ['ingredients', id] as const,
  user: (id: string) => ['users', id] as const,
} as const;

/** Prefixes used by mutations to drop everything a write affects. */
export const qkPrefix = {
  orders: () => ['orders'] as const,
  products: () => ['products'] as const,
  menu: () => ['menu'] as const,
  categories: () => ['categories'] as const,
  addons: () => ['addons'] as const,
  users: () => ['users'] as const,
  ingredients: () => ['ingredients'] as const,
  inventory: () => ['inventory'] as const,
  shifts: () => ['shifts'] as const,
  cashDrawer: () => ['cash-drawer'] as const,
  reports: () => ['reports'] as const,
  settings: () => ['settings'] as const,
  deliveryZones: () => ['delivery-zones'] as const,
  deliveryProfiles: () => ['delivery-profiles'] as const,
  subRecipes: () => ['sub-recipes'] as const,
} as const;
