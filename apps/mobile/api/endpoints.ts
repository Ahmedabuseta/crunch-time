// One typed function per server route the app uses.
import { request } from './client';
import type { DiscountRule } from '@/lib/discount';
import type {
  Addon,
  AppUser,
  AssistantConfig,
  AssistantConfigUpdate,
  CashMovement,
  Category,
  ChatActionStatus,
  ChatMessage,
  DeliveryProfile,
  DeliveryZone,
  HealthResponse,
  Ingredient,
  IngredientLedger,
  LoginResponse,
  Menu,
  Order,
  PrinterInfo,
  Product,
  ProductOptions,
  RecipeLine,
  Shift,
  ShiftSummary,
  SubRecipe,
  ZReport,
} from './types';

function qs(query?: Record<string, unknown>): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export interface CreateOrderPayload {
  orderType: 'delivery' | 'dine-in' | 'takeaway';
  paymentType: 'cash' | 'visa';
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  /** Dine-in only — the table the order is served at. */
  tableNumber?: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
    note?: string;
    modifiers?: unknown;
    addons?: string[];
    /** Per-line discount, sent only for the employee product-of-the-day code. */
    itemDiscount?: number;
  }[];
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryZoneId?: string;
  deliveryProfileId?: string;
  deliveryNote?: string;
  note?: string;
  discountCode?: string;
  discountCodeId?: string;
  discountAmount?: number;
}

export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  address: string | null;
  orderCount: number;
  lastOrderAt: string | null;
}

/** Paging metadata the list routes return next to their own key. */
export interface PagedMeta {
  /** The size of the whole match, not of the page. */
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** A type alias, not an interface: only these get an implicit index signature,
 * which is what lets them be passed to the query-string builder. */
export type ListParams = {
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  search?: string;
};

/** The server's ceiling. For the few callers that genuinely need the whole list
 * — a picker that filters locally — rather than a page of it. */
export const ALL_ROWS = 200;

export const api = {
  // ─── Auth / health ──────────────────────────────────────────
  health: () => request<HealthResponse>('/health', { auth: false }),
  login: (pin: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: { pin }, auth: false }),

  /** Exchange a single-use pairing code (from the QR) for a session. */
  pair: (code: string) =>
    request<LoginResponse>('/auth/pair', { method: 'POST', body: { code }, auth: false }),

  // ─── Menu ───────────────────────────────────────────────────
  menu: () => request<Menu>('/menu'),
  productOptions: (id: string) => request<ProductOptions>(`/menu/products/${id}/options`),

  // ─── Orders ─────────────────────────────────────────────────
  orders: (
    filters?: {
      status?: string;
      orderType?: string;
      paymentType?: string;
      /** A driver's profile id, or the 'NONE' sentinel for unassigned. */
      deliveryProfileId?: string;
      from?: string;
      to?: string;
    } & ListParams
  ) => request<{ orders: Order[] } & PagedMeta>(`/orders${qs(filters)}`),
  order: (id: string) => request<{ order: Order }>(`/orders/${id}`),
  createOrder: (body: CreateOrderPayload, idempotencyKey: string) =>
    request<{ ok: boolean; id: string; order: Order }>('/orders', {
      method: 'POST',
      body,
      idempotencyKey,
    }),
  updateOrderStatus: (id: string, status: string, reason?: string) =>
    request<{ ok: boolean }>(`/orders/${id}/status`, { method: 'PATCH', body: { status, reason } }),
  assignDriver: (id: string, profileId: string) =>
    request<{ ok: boolean; receiptReady?: boolean }>(`/orders/${id}/assign-driver`, {
      method: 'POST',
      body: { profileId },
    }),
  refundOrder: (id: string, reason: string, pin?: string) =>
    request<{ ok: boolean; refundedAmount?: number }>(`/orders/${id}/refund`, {
      method: 'POST',
      body: { reason, pin },
    }),
  printOrder: (id: string, kind: 'receipt' | 'kitchen') =>
    request<{ ok: boolean }>(`/orders/${id}/print`, { method: 'POST', body: { kind } }),

  // ─── Delivery + customers ───────────────────────────────────
  deliveryZones: () => request<{ zones: DeliveryZone[] }>('/delivery-zones'),
  deliveryProfiles: () => request<{ profiles: DeliveryProfile[] }>('/delivery-profiles'),
  customersSearch: (q: string) =>
    request<{ customers: Customer[] }>(`/customers/search?q=${encodeURIComponent(q)}`),

  // ─── Shift + drawer ─────────────────────────────────────────
  currentShift: () => request<{ shift: Shift | null }>('/shifts/current'),
  openShift: (openingCash: number) =>
    request<{ ok: boolean; id: string }>('/shifts/open', { method: 'POST', body: { openingCash } }),
  closeShift: (id: string, closingCash: number) =>
    request<{ ok: boolean }>('/shifts/close', { method: 'POST', body: { id, closingCash } }),
  cashDrawer: (shiftId: string) =>
    request<{ movements: CashMovement[]; expected: { expected: number; breakdown: Record<string, number> } | null }>(
      `/cash-drawer/${shiftId}`
    ),
  cashMovement: (body: { shiftId: string; type: string; amount: number; note?: string }) =>
    request<{ ok: boolean; id: string }>('/cash-drawer/movements', { method: 'POST', body }),
  reconcile: (shiftId: string) =>
    request<{ ok: boolean; reconciliation: { openingCash: number; expected: number; actual: number; difference: number; breakdown: Record<string, number> } }>(
      '/cash-drawer/reconcile',
      { method: 'POST', body: { shiftId } }
    ),

  // ─── Reports ────────────────────────────────────────────────
  zReport: (shiftId?: string) =>
    request<{ ok: boolean; report: ZReport }>(`/reports/z${qs({ shiftId })}`),
  report: <T = unknown>(name: string, query?: Record<string, string | number | undefined>) =>
    request<{ report: T }>(`/reports/${name}${qs(query)}`),

  /** Every shift in a range, with its cash position — the shift report list. */
  shiftSummary: (query?: { from?: string; to?: string }) =>
    request<{ report: ShiftSummary }>(`/reports/shift-summary${qs(query)}`),
  /** One shift in full: revenue, cash difference, payments, top items, hourly. */
  shiftReport: (id: string) =>
    request<{ report: ZReport }>(`/reports/shift/${encodeURIComponent(id)}`),

  // ─── Discount codes ─────────────────────────────────────────
  //
  // There is deliberately no `useDiscountCode` here: `POST /orders` already
  // marks the code used as one of its side effects, so calling `/use` as well
  // would count every phone order twice.
  validateDiscountCode: (code: string) =>
    request<{ validation: { valid: boolean; error?: string; discount?: DiscountRule } }>(
      '/discount-codes/validate',
      { method: 'POST', body: { code } }
    ),

  /** Not paged: it feeds a locally-filtered picker, not a list you scroll. */
  subRecipes: () => request<{ subRecipes: SubRecipe[] }>('/sub-recipes'),

  // ─── Recipes (what a product consumes) ──────────────────────
  //
  // A line is either an ingredient or a sub-recipe. On an edit both ids must be
  // sent — the server assigns whatever is missing to null, so omitting one
  // would silently clear it.
  productRecipes: (productId: string) =>
    request<{ recipes: RecipeLine[] }>(`/products/${encodeURIComponent(productId)}/recipes`),
  upsertRecipe: (body: {
    id?: string;
    productId: string;
    ingredientId?: string | null;
    subRecipeId?: string | null;
    quantityPerUnit: number;
  }) => request<{ id: string }>('/recipes', { method: 'POST', body }),
  deleteRecipe: (id: string) =>
    request<{ ok: boolean }>(`/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ─── Settings / backup ──────────────────────────────────────
  settings: () => request<{ settings: Record<string, unknown> }>('/settings'),
  audit: (query?: { limit?: number; entity?: string }) => request<{ entries: any[] }>(`/audit${qs(query)}`),
  backupStatus: () => request<{ status: { lastBackup: string | null; backupCount: number } }>('/backup/status'),
  triggerBackup: () => request<{ ok: boolean; path?: string; message?: string }>('/backup', { method: 'POST', body: {} }),

  // ─── Admin: catalogue ───────────────────────────────────────
  categories: (params?: ListParams) =>
    request<{ categories: Category[] } & PagedMeta>(`/categories${qs(params)}`),
  createCategory: (body: Record<string, unknown>) =>
    request<{ id: string }>('/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/categories/${id}`, { method: 'PUT', body }),
  deleteCategory: (id: string, hard = false) =>
    request<{ ok: boolean }>(`/categories/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),

  products: (params?: { categoryId?: string } & ListParams) =>
    request<{ products: Product[] } & PagedMeta>(`/products${qs(params)}`),
  /** One product, for the edit form — instead of downloading the list and
   * searching it, which a paged list would no longer give you. */
  product: (id: string) => request<{ product: Product }>(`/products/${encodeURIComponent(id)}`),
  /** One category, same reason. */
  category: (id: string) => request<{ category: Category }>(`/categories/${encodeURIComponent(id)}`),
  createProduct: (body: Record<string, unknown>) =>
    request<{ id: string }>('/products', { method: 'POST', body }),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/products/${id}`, { method: 'PUT', body }),
  deleteProduct: (id: string, hard = false) =>
    request<{ ok: boolean }>(`/products/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),

  addons: () => request<{ addons: Addon[] }>('/addons'),
  createAddon: (body: Record<string, unknown>) =>
    request<{ id: string }>('/addons', { method: 'POST', body }),
  updateAddon: (id: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/addons/${id}`, { method: 'PUT', body }),
  deleteAddon: (id: string, hard = false) =>
    request<{ ok: boolean }>(`/addons/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),

  // ─── Admin: inventory ───────────────────────────────────────
  ingredients: (params?: { low?: string } & ListParams) =>
    request<{ ingredients: Ingredient[] } & PagedMeta>(`/ingredients${qs(params as any)}`),
  /** One ingredient, for the edit form — instead of downloading the list and
   * searching it, which a paged list would no longer give you. */
  ingredient: (id: string) =>
    request<{ ingredient: Ingredient }>(`/ingredients/${encodeURIComponent(id)}`),
  createIngredient: (body: Record<string, unknown>) =>
    request<{ id: string }>('/ingredients', { method: 'POST', body }),
  updateIngredient: (id: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/ingredients/${id}`, { method: 'PUT', body }),
  deleteIngredient: (id: string, hard = false) =>
    request<{ ok: boolean }>(`/ingredients/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),
  inventoryAlerts: () => request<{ alerts: Ingredient[] }>('/inventory/alerts'),
  restock: (
    id: string,
    body: { qty: number; note?: string; unitCost?: number; packagePrice?: number; supplier?: string }
  ) => request<{ ok: boolean }>(`/ingredients/${id}/restock`, { method: 'POST', body }),
  recordWaste: (id: string, body: { qty: number; note?: string }) =>
    request<{ ok: boolean }>(`/ingredients/${id}/waste`, { method: 'POST', body }),
  adjustStock: (id: string, body: { delta: number; note?: string }) =>
    request<{ ok: boolean }>(`/ingredients/${id}/adjust`, { method: 'POST', body }),
  ledger: (id: string, query?: { page?: number; pageSize?: number; type?: string }) =>
    request<{ ledger: IngredientLedger }>(`/ingredients/${id}/transactions${qs(query as any)}`),

  // ─── Admin: users ───────────────────────────────────────────
  users: (params?: { role?: string } & ListParams) =>
    request<{ users: AppUser[] } & PagedMeta>(`/users${qs(params as any)}`),
  /** One user, for the edit form. */
  user: (id: string) => request<{ user: AppUser }>(`/users/${encodeURIComponent(id)}`),
  createUser: (body: Record<string, unknown>) =>
    request<{ id: string }>('/users', { method: 'POST', body }),
  updateUser: (id: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/users/${id}`, { method: 'PUT', body }),
  deleteUser: (id: string, hard = false) =>
    request<{ ok: boolean }>(`/users/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),

  // ─── Admin: store ───────────────────────────────────────────
  saveSettings: (body: Record<string, unknown>) =>
    request<{ ok: boolean }>('/settings', { method: 'PUT', body }),
  printers: () => request<{ printers: PrinterInfo[] }>('/printers'),

  // ─── Assistant ──────────────────────────────────────────────
  //
  // The chat turn itself is not here: `request()` buffers the whole body, and
  // the answer has to be read as it arrives — see lib/assistantStream.ts.
  // Everything below is one ordinary JSON round trip.
  assistant: {
    config: () => request<{ config: AssistantConfig }>('/assistant/config'),
    /** A partial update: an omitted field is left as it is on the server, and
     * an omitted `apiKey` means "keep the stored key". */
    saveConfig: (body: AssistantConfigUpdate) =>
      request<{ config: AssistantConfig }>('/assistant/config', { method: 'PUT', body }),
    /** Pings the provider with the stored key — the only way to prove it works. */
    test: () =>
      request<{ ok: boolean; model?: string; latencyMs?: number; error?: string }>('/assistant/test', {
        method: 'POST',
        body: {},
      }),
    history: (query?: { before?: string; limit?: number }) =>
      request<{ messages: ChatMessage[] }>(`/assistant/history${qs(query)}`),
    clearHistory: () => request<{ ok: true }>('/assistant/history', { method: 'DELETE' }),
    confirmAction: (id: string) =>
      request<{ ok: boolean; status: ChatActionStatus; error?: string; message?: string }>(
        `/assistant/actions/${encodeURIComponent(id)}/confirm`,
        { method: 'POST', body: {} }
      ),
    cancelAction: (id: string) =>
      request<{ ok: boolean; status: ChatActionStatus }>(
        `/assistant/actions/${encodeURIComponent(id)}/cancel`,
        { method: 'POST', body: {} }
      ),
  },
};
