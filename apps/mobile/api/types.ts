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

export interface HealthResponse {
  ok: boolean;
  name: string;
}
