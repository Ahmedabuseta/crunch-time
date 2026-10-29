// DTOs for the remote POS API. These mirror the shapes the server routes return
// (see src/server/routes*.ts in the desktop app); they are declared locally
// rather than shared through Metro, which would drag the Electron root into the
// phone's bundler for the sake of ~150 lines.

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sortOrder: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  categoryId: string;
  emoji: string;
  description: string;
  active: boolean;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  emoji: string;
  supportsRollback?: boolean;
}

export interface Modifier {
  id: string;
  modifierGroupId: string;
  name: string;
  priceAdjustment: number;
  sortOrder: number;
  active: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  type: string;
  modifiers: Modifier[];
}

export interface Menu {
  categories: Category[];
  products: Product[];
}

export interface ProductOptions {
  product: Product;
  addons: Addon[];
  modifierGroups: ModifierGroup[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  itemDiscount: number;
  note: string | null;
  selectedModifiersJson: string | null;
  selectedAddonsJson: string | null;
  productName?: string;
  productEmoji?: string;
  supportsRollback?: boolean;
  addonRollbackInfo?: { name: string; emoji: string; supportsRollback: boolean; price: number }[];
}

export interface Order {
  id: string;
  status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  orderType: 'delivery' | 'dine-in' | 'takeaway';
  tableNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  deliveryZoneId: string | null;
  deliveryZoneName: string | null;
  deliveryNote: string | null;
  deliveryProfileId: string | null;
  deliveryProfileName: string | null;
  driverStatus: string | null;
  discountCode: string | null;
  discountAmount: number;
  total: number;
  paymentType: string;
  cashierName: string | null;
  note: string | null;
  statusReason: string | null;
  refundedAmount: number;
  userId: string | null;
  shiftId: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  sortOrder: number;
  active: boolean;
}

export interface DeliveryProfile {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
}

export interface Shift {
  id: string;
  number: number;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  openingCash: number;
  closingCash: number | null;
  status: 'open' | 'closed';
}

export interface CashMovement {
  id: string;
  shiftId: string;
  type: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface ZReport {
  shiftId: string;
  userName: string;
  startedAt: string;
  endedAt: string | null;
  orderCount: number;
  totalRevenue: number;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number;
  cashDifference: number | null;
  payments: { method: string; count: number; total: number }[];
  topItems: { name: string; emoji: string; qty: number; revenue: number }[];
  hourly: { hour: number; orderCount: number; revenue: number }[];
  movements: { type: string; amount: number }[];
}

export interface LoginResponse {
  ok: boolean;
  token: string;
  expiresIn: number;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  minStock: number;
  costPerUnit: number;
  purchaseQty: number;
  active: boolean;
  supplier: string | null;
  secondarySupplier: string | null;
  supplierRatio: number;
  plannedCost: number;
}

export interface InventoryTransaction {
  id: string;
  ingredientId: string;
  type: string;
  quantity: number;
  unitCost: number | null;
  supplier: string | null;
  referenceOrderId: string | null;
  note: string | null;
  createdAt: string;
}

export interface IngredientLedger {
  ingredient: Ingredient | null;
  currentStock: number;
  openingBalance: number;
  movements: (InventoryTransaction & { balance: number })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * One line of a product's recipe. The server returns a union of two shapes:
 * a line is *either* an ingredient or a sub-recipe, and the fields belonging to
 * the other kind come back null. `lineCost` is computed server-side.
 */
export interface RecipeLine {
  id: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  quantityPerUnit: number;
  ingredientName: string | null;
  subRecipeName: string | null;
  unit: string | null;
  subRecipeUnit: string | null;
  costPerUnit: number | null;
  subRecipeCostPerUnit: number | null;
  lineCost: number;
}

/** A reusable prepared component (صوص، عجينة) that a recipe can include. */
export interface SubRecipe {
  id: string;
  name: string;
  unit: string;
  active: boolean;
  costPerUnit: number;
  ingredientCount: number;
}

export interface AppUser {
  id: string;
  name: string;
  role: 'admin' | 'cashier';
  active: boolean;
  createdAt: string;
  hourlyRate: number;
  commissionRate: number;
}

export interface StoreSettings {
  restaurantName?: string;
  storeTagline?: string | null;
  storePhone?: string | null;
  storePhone2?: string | null;
  storeAddress?: string | null;
  taxNumber?: string | null;
  vatNumber?: string | null;
  receiptFooter?: string;
  currencyLabel?: string;
  taxRate?: number;
  [key: string]: unknown;
}

export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

// ─── Reports: shifts ──────────────────────────────────────────
export interface ShiftSummaryRow {
  id: string;
  userName: string;
  startedAt: string;
  endedAt: string | null;
  status: 'open' | 'closed';
  /** Whole hours the shift ran, or null while it is still open. */
  duration: number | null;
  orderCount: number;
  revenue: number;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number;
  /** counted − expected; null while the shift is open. */
  difference: number | null;
  breakdown: Record<string, number>;
}

export interface ShiftSummary {
  totalShifts: number;
  closedCount: number;
  openCount: number;
  totalRevenue: number;
  totalOrders: number;
  avgRevenuePerShift: number;
  avgOrdersPerShift: number;
  totalExpectedCash: number;
  totalActualCash: number;
  totalShorts: number;
  totalOverages: number;
  shifts: ShiftSummaryRow[];
}

export interface HealthResponse {
  ok: boolean;
  name: string;
}

// ─── Assistant ────────────────────────────────────────────────
//
// The chat card union mirrors the server's zod schema (src/ai/schemas.ts)
// exactly: the phone renders what it is given and never infers a shape. A card
// kind this build has never heard of is dropped rather than guessed at.
export type ChatCard =
  | { kind: 'report'; title: string; report: unknown }
  | { kind: 'metrics'; title?: string; items: { label: string; value: string; tone?: 'good'|'warn'|'bad' }[] }
  | { kind: 'table'; title: string; columns: string[]; rows: string[][] }
  | { kind: 'action'; actionId: string; title: string; subject: string;
      status: 'proposed'|'executed'|'failed'|'cancelled'|'expired';
      rows: { label: string; before?: string; after?: string; value?: string; tone?: 'up'|'down'|'warn'|'good' }[];
      result: string; warning?: string }

/** The confirm/cancel card, narrowed out of the union where it is rendered. */
export type ActionChatCard = Extract<ChatCard, { kind: 'action' }>;

/** Derived from the card so a new server status can never drift from it. */
export type ChatActionStatus = ActionChatCard['status'];

export interface ChatMessage { id: string; role: 'user'|'assistant'; content: string; cards?: ChatCard[]; followups?: string[]; createdAt: string; blocked?: string }
export interface AssistantConfig { enabled: boolean; provider: string; baseUrl: string; model: string; hasKey: boolean; keyHint?: string|null; dailyTokenLimit: number; temporalPort: number; today?: { promptTokens: number; completionTokens: number; total: number; requests: number }; temporalRunning?: boolean }
export interface AssistantConfigUpdate { enabled?: boolean; provider?: string; baseUrl?: string; model?: string; apiKey?: string; dailyTokenLimit?: number }
