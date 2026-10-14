// One typed function per server route the app uses.
import { request } from './client';
import type {
  Addon,
  AppUser,
  CashMovement,
  Category,
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
  Shift,
  ZReport,
} from './types';

function qs(query?: Record<string, string | number | undefined | null>): string {
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
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
    note?: string;
    modifiers?: unknown;
    addons?: string[];
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
  orders: (filters?: { status?: string; orderType?: string; search?: string }) =>
    request<{ orders: Order[] }>(`/orders${qs(filters)}`),
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

  // ─── Settings / backup ──────────────────────────────────────
  settings: () => request<{ settings: Record<string, unknown> }>('/settings'),
  audit: (query?: { limit?: number; entity?: string }) => request<{ entries: any[] }>(`/audit${qs(query)}`),
  backupStatus: () => request<{ status: { lastBackup: string | null; backupCount: number } }>('/backup/status'),
  triggerBackup: () => request<{ ok: boolean; path?: string; message?: string }>('/backup', { method: 'POST', body: {} }),

  // ─── Admin: catalogue ───────────────────────────────────────
  categories: () => request<{ categories: Category[] }>('/categories'),
  createCategory: (body: Record<string, unknown>) =>
    request<{ id: string }>('/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/categories/${id}`, { method: 'PUT', body }),
  deleteCategory: (id: string, hard = false) =>
    request<{ ok: boolean }>(`/categories/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' }),

  products: (categoryId?: string) =>
    request<{ products: Product[] }>(`/products${qs({ categoryId })}`),
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
  ingredients: () => request<{ ingredients: Ingredient[] }>('/ingredients'),
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
  users: () => request<{ users: AppUser[] }>('/users'),
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
};
