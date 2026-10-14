import type { PrintOrder } from '../lib/print'

// Soft-delete by default; admins can request permanent removal with { hard: true }.
export type DeleteOpts = { hard?: boolean }

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'stalled' | 'error'

export interface UpdaterBridge {
  check: () => Promise<{
    ok: boolean
    busy?: boolean
    phase?: UpdatePhase
    version?: string | null
    current?: string
    latest?: string | null
    transferred?: number
    total?: number
    percent?: number
    error?: string
  }>
  version: () => Promise<{ ok: boolean; version?: string; error?: string }>
  state: () => Promise<{
    ok: boolean
    current?: string
    phase?: UpdatePhase
    version?: string | null
    transferred?: number
    total?: number
    percent?: number
    error?: string
  }>
  quitAndInstall: () => Promise<{ ok: boolean }>
  onStatus: (cb: (s: UpdateStatus) => void) => () => void
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'stalled' | 'error'
  version?: string
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  message?: string
}

export interface RemoteStatus {
  enabled: boolean
  port: number
  hasPin: boolean
  running: boolean
  addresses: string[]
  /** Shop-network addresses (192.168.x.x, 10.x.x.x …). */
  lan: string[]
  /** Tailscale addresses (100.64.0.0/10) — what the phone uses away from the shop. */
  remote: string[]
  error: string | null
}

export interface RemoteBridge {
  get: () => Promise<RemoteStatus>
  set: (data: { enabled?: boolean; port?: number }) => Promise<{ ok: boolean; error?: string; status: RemoteStatus }>
  setPin: (pin: string) => Promise<{ ok: boolean; error?: string; status: RemoteStatus }>
  /** Creates a random PIN for the owner; the plaintext is returned once. */
  generatePin: () => Promise<{ ok: boolean; pin?: string; error?: string; status: RemoteStatus }>
  /** Single-use, 10-minute code embedded in the pairing QR. */
  pairCode: () => Promise<{ ok: boolean; code?: string; expiresAt?: string; error?: string }>
  clearPairCode: () => Promise<{ ok: boolean }>
}

export interface TailscaleStatus {
  installed: boolean
  online: boolean
  ipv4: string | null
  dnsName: string | null
  binary: string | null
  error: string | null
  canAutoInstall: boolean
}

export interface TailscaleActionResult {
  ok: boolean
  action: string
  message: string
  error?: string
  url?: string
}

export interface FunnelStatus {
  available: boolean
  enabled: boolean
  /** Public HTTPS URL for the phone, e.g. https://machine.tailnet.ts.net */
  url: string | null
  dnsName: string | null
  publicPort: number | null
  error: string | null
}

export interface TailscaleBridge {
  status: () => Promise<TailscaleStatus>
  install: () => Promise<TailscaleActionResult>
  up: () => Promise<TailscaleActionResult>
  funnelStatus: () => Promise<FunnelStatus>
  funnelEnable: (localPort: number, publicPort?: number) => Promise<TailscaleActionResult>
  funnelDisable: (publicPort?: number) => Promise<TailscaleActionResult>
}

export interface ServerPushEvent {
  channel: string
  payload: unknown
}

export interface EventsBridge {
  /** Subscribes to phone-side changes pushed from the main process. Returns an unsubscribe fn. */
  onPush: (cb: (e: ServerPushEvent) => void) => () => void
}

export interface Customer {
  id: string
  phone: string
  name: string | null
  address: string | null
  orderCount: number
  lastOrderAt: string | null
  createdAt: string
}
export interface DeliveryZone {
  id: string
  name: string
  fee: number
  sortOrder: number
  active: boolean
}

export interface DeliveryProfile {
  id: string
  name: string
  phone: string | null
  active: boolean
}

export interface OsPrinter {
  name: string
  displayName: string
  isDefault: boolean
}

export interface KitchenStation {
  id: string
  name: string
  printerName: string | null
  paperWidth: string
  sortOrder: number
  active: boolean
  categoryIds: string[]
}

export interface ApiBridge {
  session: {
    setUser: (user: { id: string; role: string } | null) => Promise<void>
    clearUser: () => Promise<void>
  }
  settings: {
    get: () => Promise<any>
    update: (data: any) => Promise<{ ok: boolean }>
  }
  remote: RemoteBridge
  tailscale: TailscaleBridge
  events: EventsBridge
  discountCode: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    validate: (code: string) => Promise<any>
    use: (id: string) => Promise<{ ok: boolean }>
  }
  deliveryZone: {
    list: (includeInactive?: boolean) => Promise<DeliveryZone[]>
    create: (data: { name: string; fee: number }) => Promise<{ id: string }>
    update: (id: string, data: Partial<{ name: string; fee: number; active: boolean; sortOrder: number }>) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    reorder: (ids: string[]) => Promise<{ ok: boolean }>
  }
  deliveryProfile: {
    list: (includeInactive?: boolean) => Promise<DeliveryProfile[]>
    create: (data: { name: string; phone?: string }) => Promise<{ id: string }>
    update: (id: string, data: Partial<{ name: string; phone: string; active: boolean }>) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
  }
  printer: {
    list: () => Promise<OsPrinter[]>
    printHtml: (html: string, opts?: { deviceName?: string; copies?: number; paperWidth?: string; order?: PrintOrder }) => Promise<{ ok: boolean; error?: string }>
    test: (deviceName?: string) => Promise<{ ok: boolean; error?: string }>
  }
  station: {
    list: (includeInactive?: boolean) => Promise<KitchenStation[]>
    create: (data: { name: string; printerName?: string; paperWidth?: string; categoryIds?: string[] }) => Promise<{ id: string }>
    update: (id: string, data: Partial<{ name: string; printerName: string | null; paperWidth: string; active: boolean; categoryIds: string[] }>) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    routeOrder: (orderId: string) => Promise<{ routes: { station: KitchenStation; items: any[] }[]; unrouted: any[] }>
  }
  expense: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    totalMonthly: () => Promise<number>
  }
  category: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    reorder: (ids: string[]) => Promise<{ ok: boolean }>
  }
  product: {
    list: (categoryId?: string) => Promise<any[]>
    getById: (id: string) => Promise<any>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
  }
  addon: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    listByProduct: (productId: string) => Promise<any[]>
    linkToProduct: (productId: string, addonId: string) => Promise<{ ok: boolean }>
    setProductLinks: (productId: string, addonIds: string[]) => Promise<{ ok: boolean }>
    listRecipes: (addonId: string) => Promise<any[]>
    upsertRecipe: (data: any) => Promise<{ id: string }>
    deleteRecipe: (id: string) => Promise<{ ok: boolean; error?: string }>
  }
  modifier: {
    listGroups: () => Promise<any[]>
    createGroup: (data: any) => Promise<{ id: string }>
    updateGroup: (id: string, data: any) => Promise<{ ok: boolean }>
    deleteGroup: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    listByGroup: (groupId: string) => Promise<any[]>
    createModifier: (data: any) => Promise<{ id: string }>
    updateModifier: (id: string, data: any) => Promise<{ ok: boolean }>
    deleteModifier: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    listByProduct: (productId: string) => Promise<any[]>
    linkToProduct: (productId: string, groupId: string) => Promise<{ ok: boolean }>
    setProductLinks: (productId: string, groupIds: string[]) => Promise<{ ok: boolean }>
    listRecipes: (modifierId: string) => Promise<any[]>
    upsertRecipe: (data: any) => Promise<{ id: string }>
    deleteRecipe: (id: string) => Promise<{ ok: boolean; error?: string }>
  }
  order: {
    create: (data: any) => Promise<{ id: string }>
    list: (filters?: any) => Promise<any[]>
    getById: (id: string) => Promise<any>
    updateStatus: (id: string, status: string, reason?: string) => Promise<{ ok: boolean }>
    assignDriver: (orderId: string, profileId: string) => Promise<{ ok: boolean; error?: string; receiptReady?: boolean }>
    unassignedCount: () => Promise<number>
    delete: (id: string) => Promise<{ ok: boolean; error?: string }>
  }
  payment: {
    create: (data: any) => Promise<{ id: string }>
    listByOrder: (orderId: string) => Promise<any[]>
    getTotalPaid: (orderId: string) => Promise<number>
  }
  user: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    verifyPin: (id: string, pin: string) => Promise<{ ok: boolean; user?: any; error?: string }>
  }
  customer: {
    search: (prefix: string) => Promise<Customer[]>
    upsert: (data: any) => Promise<{ ok: boolean; id?: string }>
  }
  shift: {
    open: (data: any) => Promise<{ id: string }>
    close: (id: string, closingCash: number) => Promise<{ ok: boolean }>
    getCurrent: () => Promise<any>
    list: (filters?: any) => Promise<any[]>
  }
  cashDrawer: {
    addMovement: (data: any) => Promise<{ id: string }>
    listByShift: (shiftId: string) => Promise<any[]>
    reconcile: (shiftId: string) => Promise<any>
    reconcileBatch: (shiftIds: string[]) => Promise<Record<string, any>>
    expectedCash: (shiftId: string) => Promise<{ expected: number; breakdown: Record<string, number> } | null>
  }
  subRecipe: {
    listAll: () => Promise<{ id: string; name: string; unit: string; active: boolean; costPerUnit: number; ingredientCount: number }[]>
    upsert: (data: { id?: string; name: string; unit: string; active?: boolean }) => Promise<{ id: string }>
    delete: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    listIngredients: (subRecipeId: string) => Promise<{ id: string; subRecipeId: string; ingredientId: string; quantityPerUnit: number; ingredientName: string; unit: string; costPerUnit: number; lineCost: number }[]>
    upsertIngredient: (data: { id?: string; subRecipeId: string; ingredientId: string; quantityPerUnit: number }) => Promise<{ id: string }>
    deleteIngredient: (id: string) => Promise<{ ok: boolean; error?: string }>
  }
  inventory: {
    listIngredients: () => Promise<any[]>
    createIngredient: (data: any) => Promise<{ id: string }>
    updateIngredient: (id: string, data: any) => Promise<{ ok: boolean }>
    deleteIngredient: (id: string, opts?: DeleteOpts) => Promise<{ ok: boolean; error?: string }>
    listRecipes: (productId: string) => Promise<any[]>
    upsertRecipe: (data: any) => Promise<{ id: string }>
    deleteRecipe: (id: string) => Promise<{ ok: boolean; error?: string }>
    getAlerts: () => Promise<any[]>
    getPurchaseSavings: () => Promise<Record<string, { name: string; standard: number; lastUnitCost: number | null; totalSaved: number }>>
    restock: (ingredientId: string, qty: number, note?: string, opts?: { unitCost?: number; supplier?: string }) => Promise<{ ok: boolean; ppv?: number }>
    deductForOrder: (orderId: string) => Promise<{ ok: boolean }>
    listTransactions: (ingredientId: string, filters?: { type?: string; from?: string; to?: string; page?: number; pageSize?: number }) => Promise<{ ingredient: any; currentStock: number; openingBalance: number; movements: any[]; total: number; page: number; pageSize: number; totalPages: number }>
    recordWaste: (ingredientId: string, qty: number, note?: string) => Promise<{ ok: boolean }>
    adjust: (ingredientId: string, delta: number, note?: string) => Promise<{ ok: boolean }>
  }
  report: {
    dailySummary: (date?: string) => Promise<any>
    periodSummary: (from?: string, to?: string) => Promise<any>
    hourlyBreakdown: (date?: string) => Promise<any[]>
    topItems: (limit?: number, from?: string, to?: string) => Promise<any[]>
    categoryRevenue: (from?: string, to?: string) => Promise<any[]>
    addonStats: (from?: string, to?: string) => Promise<any[]>
    ticketDistribution: (from?: string, to?: string) => Promise<any[]>
    orderTypeSplit: (from?: string, to?: string) => Promise<any>
    shiftReport: (shiftId: string) => Promise<any>
    shiftSummary: (from?: string, to?: string) => Promise<any>
    laborSummary: (from?: string, to?: string) => Promise<any>
    voidSummary: (from?: string, to?: string) => Promise<any>
    revenueTrend: (days?: number) => Promise<any[]>
    inventoryAlerts: () => Promise<any[]>
    paymentMethodBreakdown: (from?: string, to?: string) => Promise<any[]>
    profitSummary: (from?: string, to?: string) => Promise<any>
    abcXyz: (from?: string, to?: string) => Promise<any>
    inventoryTurnover: (from?: string, to?: string) => Promise<any>
    purchasePriceVariance: (from?: string, to?: string) => Promise<any>
    salesTrend: (opts?: { days?: number; forecastDays?: number }) => Promise<any>
    daysOnHand: () => Promise<any>
    discountSummary: (from?: string, to?: string) => Promise<any>
    driverSummary: (opts?: { from?: string; to?: string }) => Promise<any>
  }
  backup: {
    trigger: () => Promise<any>
    getStatus: () => Promise<any>
    export: () => Promise<any>
    restore: () => Promise<any>
  }
  exportCsv: (name: string, rows: string[][]) => Promise<{ ok: boolean; canceled?: boolean; path?: string; message?: string; error?: string }>
}

declare global {
  interface Window {
    api: ApiBridge
    updater?: UpdaterBridge
  }
}
