import { contextBridge, ipcRenderer } from 'electron'

function invoke(channel: string, ...args: unknown[]) {
  return ipcRenderer.invoke(channel, ...args)
}

// Soft-delete by default; admins can request permanent removal with { hard: true }.
type DeleteOpts = { hard?: boolean }

// Preload runs in real Electron with full ipcRenderer; in vitest the electron
// module is mocked with invoke-only, so guard the event-listener methods.
const onIpc = (ipcRenderer as any).on?.bind(ipcRenderer)
const offIpc = (ipcRenderer as any).removeListener?.bind(ipcRenderer)

contextBridge.exposeInMainWorld('updater', {
  check: () => invoke('updater:check'),
  version: () => invoke('updater:version'),
  quitAndInstall: () => invoke('updater:quitAndInstall'),
  onStatus: (cb: (s: UpdateStatusPayload) => void) => {
    if (!onIpc) return () => {}
    const listener = (_e: unknown, payload: UpdateStatusPayload) => cb(payload)
    onIpc('updater:status', listener)
    return () => offIpc?.('updater:status', listener)
  },
})

type UpdateStatusPayload = {
  status: string; version?: string; percent?: number
  transferred?: number; total?: number; bytesPerSecond?: number; message?: string
}

contextBridge.exposeInMainWorld('api', {
  // ─── Session ────────────────────────────────────────────────
  session: {
    setUser: (user: { id: string; role: string } | null) => invoke('session:setUser', user),
    clearUser: () => invoke('session:clearUser'),
  },

  // ─── Settings ──────────────────────────────────────────────
  settings: {
    get: () => invoke('settings:get'),
    update: (data: unknown) => invoke('settings:update', data),
  },

  // ─── Discount codes ────────────────────────────────────────
  discountCode: {
    list: () => invoke('discountCode:list'),
    create: (data: unknown) => invoke('discountCode:create', data),
    update: (id: string, data: unknown) => invoke('discountCode:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('discountCode:delete', id, opts),
    validate: (code: string) => invoke('discountCode:validate', code),
    use: (id: string) => invoke('discountCode:use', id),
  },

  // ─── Delivery zones ───────────────────────────────────────
  deliveryZone: {
    list: (includeInactive?: boolean) => invoke('deliveryZone:list', includeInactive),
    create: (data: unknown) => invoke('deliveryZone:create', data),
    update: (id: string, data: unknown) => invoke('deliveryZone:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('deliveryZone:delete', id, opts),
    reorder: (ids: string[]) => invoke('deliveryZone:reorder', ids),
  },

  // ─── Delivery profiles (delivery boys) ────────────────────
  deliveryProfile: {
    list: (includeInactive?: boolean) => invoke('deliveryProfile:list', includeInactive),
    create: (data: unknown) => invoke('deliveryProfile:create', data),
    update: (id: string, data: unknown) => invoke('deliveryProfile:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('deliveryProfile:delete', id, opts),
  },

  // ─── Printers + kitchen stations ──────────────────────────
  printer: {
    list: () => invoke('printer:list'),
    printHtml: (html: string, opts?: unknown) => invoke('printer:printHtml', html, opts),
    test: (deviceName?: string) => invoke('printer:test', deviceName),
  },
  station: {
    list: (includeInactive?: boolean) => invoke('station:list', includeInactive),
    create: (data: unknown) => invoke('station:create', data),
    update: (id: string, data: unknown) => invoke('station:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('station:delete', id, opts),
    routeOrder: (orderId: string) => invoke('station:routeOrder', orderId),
  },

  // ─── Expenses ──────────────────────────────────────────────
  expense: {
    list: () => invoke('expense:list'),
    create: (data: unknown) => invoke('expense:create', data),
    update: (id: string, data: unknown) => invoke('expense:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('expense:delete', id, opts),
    totalMonthly: () => invoke('expense:totalMonthly'),
  },

  // ─── Categories ───────────────────────────────────────────
  category: {
    list: () => invoke('category:list'),
    create: (data: unknown) => invoke('category:create', data),
    update: (id: string, data: unknown) => invoke('category:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('category:delete', id, opts),
    reorder: (ids: string[]) => invoke('category:reorder', ids),
  },

  // ─── Products ─────────────────────────────────────────────
  product: {
    list: (categoryId?: string) => invoke('product:list', categoryId),
    getById: (id: string) => invoke('product:getById', id),
    create: (data: unknown) => invoke('product:create', data),
    update: (id: string, data: unknown) => invoke('product:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('product:delete', id, opts),
  },

  // ─── Addons ───────────────────────────────────────────────
  addon: {
    list: () => invoke('addon:list'),
    create: (data: unknown) => invoke('addon:create', data),
    update: (id: string, data: unknown) => invoke('addon:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('addon:delete', id, opts),
    listByProduct: (productId: string) => invoke('addon:listByProduct', productId),
    linkToProduct: (productId: string, addonId: string) => invoke('addon:linkToProduct', productId, addonId),
    setProductLinks: (productId: string, addonIds: string[]) => invoke('addon:setProductLinks', productId, addonIds),
    listRecipes: (addonId: string) => invoke('addon:listRecipes', addonId),
    upsertRecipe: (data: unknown) => invoke('addon:upsertRecipe', data),
    deleteRecipe: (id: string) => invoke('addon:deleteRecipe', id),
  },

  // ─── Modifiers ────────────────────────────────────────────
  modifier: {
    listGroups: () => invoke('modifier:listGroups'),
    createGroup: (data: unknown) => invoke('modifier:createGroup', data),
    updateGroup: (id: string, data: unknown) => invoke('modifier:updateGroup', id, data),
    deleteGroup: (id: string, opts?: DeleteOpts) => invoke('modifier:deleteGroup', id, opts),
    listByGroup: (groupId: string) => invoke('modifier:listByGroup', groupId),
    createModifier: (data: unknown) => invoke('modifier:createModifier', data),
    updateModifier: (id: string, data: unknown) => invoke('modifier:updateModifier', id, data),
    deleteModifier: (id: string, opts?: DeleteOpts) => invoke('modifier:deleteModifier', id, opts),
    listByProduct: (productId: string) => invoke('modifier:listByProduct', productId),
    linkToProduct: (productId: string, groupId: string) => invoke('modifier:linkToProduct', productId, groupId),
    setProductLinks: (productId: string, groupIds: string[]) => invoke('modifier:setProductLinks', productId, groupIds),
    listRecipes: (modifierId: string) => invoke('modifier:listRecipes', modifierId),
    upsertRecipe: (data: unknown) => invoke('modifier:upsertRecipe', data),
    deleteRecipe: (id: string) => invoke('modifier:deleteRecipe', id),
  },

  // ─── Orders ───────────────────────────────────────────────
  order: {
    create: (data: unknown) => invoke('order:create', data),
    list: (filters?: unknown) => invoke('order:list', filters),
    getById: (id: string) => invoke('order:getById', id),
    updateStatus: (id: string, status: string, reason?: string) => invoke('order:updateStatus', id, status, reason),
    assignDriver: (orderId: string, profileId: string) => invoke('order:assignDriver', orderId, profileId),
    unassignedCount: () => invoke('order:unassignedCount'),
    delete: (id: string) => invoke('order:delete', id),
  },

  // ─── Payments ─────────────────────────────────────────────
  payment: {
    create: (data: unknown) => invoke('payment:create', data),
    listByOrder: (orderId: string) => invoke('payment:listByOrder', orderId),
    getTotalPaid: (orderId: string) => invoke('payment:getTotalPaid', orderId),
  },

  // ─── Users ────────────────────────────────────────────────
  user: {
    list: () => invoke('user:list'),
    create: (data: unknown) => invoke('user:create', data),
    update: (id: string, data: unknown) => invoke('user:update', id, data),
    delete: (id: string, opts?: DeleteOpts) => invoke('user:delete', id, opts),
    verifyPin: (id: string, pin: string) => invoke('user:verifyPin', id, pin),
  },

  // ─── Customers ────────────────────────────────────────────
  customer: {
    search: (prefix: string) => invoke('customer:search', prefix),
    upsert: (data: unknown) => invoke('customer:upsert', data),
  },

  // ─── Shifts ───────────────────────────────────────────────
  shift: {
    open: (data: unknown) => invoke('shift:open', data),
    close: (id: string, closingCash: number) => invoke('shift:close', id, closingCash),
    getCurrent: () => invoke('shift:getCurrent'),
    list: (filters?: unknown) => invoke('shift:list', filters),
  },

  // ─── Cash Drawer ──────────────────────────────────────────
  cashDrawer: {
    addMovement: (data: unknown) => invoke('cashDrawer:addMovement', data),
    listByShift: (shiftId: string) => invoke('cashDrawer:listByShift', shiftId),
    reconcile: (shiftId: string) => invoke('cashDrawer:reconcile', shiftId),
    reconcileBatch: (shiftIds: string[]) => invoke('cashDrawer:reconcileBatch', shiftIds),
    expectedCash: (shiftId: string) => invoke('cashDrawer:expectedCash', shiftId),
  },

  // ─── Sub-recipes (reusable prepared components) ────────────
  subRecipe: {
    listAll: () => invoke('subRecipe:listAll'),
    upsert: (data: unknown) => invoke('subRecipe:upsert', data),
    delete: (id: string, opts?: DeleteOpts) => invoke('subRecipe:delete', id, opts),
    listIngredients: (subRecipeId: string) => invoke('subRecipe:listIngredients', subRecipeId),
    upsertIngredient: (data: unknown) => invoke('subRecipe:upsertIngredient', data),
    deleteIngredient: (id: string) => invoke('subRecipe:deleteIngredient', id),
  },

  // ─── Inventory ────────────────────────────────────────────
  inventory: {
    listIngredients: () => invoke('inventory:listIngredients'),
    createIngredient: (data: unknown) => invoke('inventory:createIngredient', data),
    updateIngredient: (id: string, data: unknown) => invoke('inventory:updateIngredient', id, data),
    deleteIngredient: (id: string, opts?: DeleteOpts) => invoke('inventory:deleteIngredient', id, opts),
    listRecipes: (productId: string) => invoke('inventory:listRecipes', productId),
    upsertRecipe: (data: unknown) => invoke('inventory:upsertRecipe', data),
    deleteRecipe: (id: string) => invoke('inventory:deleteRecipe', id),
    getAlerts: () => invoke('inventory:getAlerts'),
    getPurchaseSavings: () => invoke('inventory:getPurchaseSavings'),
    restock: (ingredientId: string, qty: number, note?: string, opts?: { unitCost?: number; supplier?: string }) => invoke('inventory:restock', ingredientId, qty, note, opts),
    deductForOrder: (orderId: string) => invoke('inventory:deductForOrder', orderId),
    listTransactions: (ingredientId: string, filters?: unknown) => invoke('inventory:listTransactions', ingredientId, filters),
    recordWaste: (ingredientId: string, qty: number, note?: string) => invoke('inventory:recordWaste', ingredientId, qty, note),
    adjust: (ingredientId: string, delta: number, note?: string) => invoke('inventory:adjust', ingredientId, delta, note),
  },

  // ─── Reports ──────────────────────────────────────────────
  report: {
    dailySummary: (date?: string) => invoke('report:dailySummary', date),
    periodSummary: (from?: string, to?: string) => invoke('report:periodSummary', from, to),
    hourlyBreakdown: (date?: string) => invoke('report:hourlyBreakdown', date),
    topItems: (limit?: number, from?: string, to?: string) => invoke('report:topItems', limit, from, to),
    categoryRevenue: (from?: string, to?: string) => invoke('report:categoryRevenue', from, to),
    addonStats: (from?: string, to?: string) => invoke('report:addonStats', from, to),
    ticketDistribution: (from?: string, to?: string) => invoke('report:ticketDistribution', from, to),
    orderTypeSplit: (from?: string, to?: string) => invoke('report:orderTypeSplit', from, to),
    shiftReport: (shiftId: string) => invoke('report:shiftReport', shiftId),
    shiftSummary: (from?: string, to?: string) => invoke('report:shiftSummary', from, to),
    laborSummary: (from?: string, to?: string) => invoke('report:laborSummary', from, to),
    voidSummary: (from?: string, to?: string) => invoke('report:voidSummary', from, to),
    revenueTrend: (days?: number) => invoke('report:revenueTrend', days),
    inventoryAlerts: () => invoke('report:inventoryAlerts'),
    paymentMethodBreakdown: (from?: string, to?: string) => invoke('report:paymentMethodBreakdown', from, to),
    profitSummary: (from?: string, to?: string) => invoke('report:profitSummary', from, to),
    abcXyz: (from?: string, to?: string) => invoke('report:abcXyz', from, to),
    inventoryTurnover: (from?: string, to?: string) => invoke('report:inventoryTurnover', from, to),
    purchasePriceVariance: (from?: string, to?: string) => invoke('report:purchasePriceVariance', from, to),
    salesTrend: (opts?: { days?: number; forecastDays?: number }) => invoke('report:salesTrend', opts),
    daysOnHand: () => invoke('report:daysOnHand'),
    discountSummary: (from?: string, to?: string) => invoke('report:discountSummary', from, to),
    driverSummary: (opts?: { from?: string; to?: string }) => invoke('report:driverSummary', opts),
  },

  // ─── Backup ───────────────────────────────────────────────
  backup: {
    trigger: () => invoke('backup:trigger'),
    getStatus: () => invoke('backup:getStatus'),
    export: () => invoke('backup:export'),
    restore: () => invoke('backup:restore'),
  },

  // ─── Export ───────────────────────────────────────────────
  exportCsv: (name: string, rows: string[][]) => invoke('export:csv', name, rows),
})