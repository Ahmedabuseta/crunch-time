import { contextBridge, ipcRenderer } from 'electron'

function invoke(channel: string, ...args: unknown[]) {
  return ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('api', {
  // ─── Categories ───────────────────────────────────────────
  category: {
    list: () => invoke('category:list'),
    create: (data: unknown) => invoke('category:create', data),
    update: (id: string, data: unknown) => invoke('category:update', id, data),
    delete: (id: string) => invoke('category:delete', id),
    reorder: (ids: string[]) => invoke('category:reorder', ids),
  },

  // ─── Products ─────────────────────────────────────────────
  product: {
    list: (categoryId?: string) => invoke('product:list', categoryId),
    getById: (id: string) => invoke('product:getById', id),
    create: (data: unknown) => invoke('product:create', data),
    update: (id: string, data: unknown) => invoke('product:update', id, data),
    delete: (id: string) => invoke('product:delete', id),
  },

  // ─── Addons ───────────────────────────────────────────────
  addon: {
    list: () => invoke('addon:list'),
    create: (data: unknown) => invoke('addon:create', data),
    update: (id: string, data: unknown) => invoke('addon:update', id, data),
    delete: (id: string) => invoke('addon:delete', id),
    listByProduct: (productId: string) => invoke('addon:listByProduct', productId),
    linkToProduct: (productId: string, addonId: string) => invoke('addon:linkToProduct', productId, addonId),
  },

  // ─── Modifiers ────────────────────────────────────────────
  modifier: {
    listGroups: () => invoke('modifier:listGroups'),
    createGroup: (data: unknown) => invoke('modifier:createGroup', data),
    updateGroup: (id: string, data: unknown) => invoke('modifier:updateGroup', id, data),
    deleteGroup: (id: string) => invoke('modifier:deleteGroup', id),
    listByGroup: (groupId: string) => invoke('modifier:listByGroup', groupId),
    createModifier: (data: unknown) => invoke('modifier:createModifier', data),
    updateModifier: (id: string, data: unknown) => invoke('modifier:updateModifier', id, data),
    deleteModifier: (id: string) => invoke('modifier:deleteModifier', id),
    listByProduct: (productId: string) => invoke('modifier:listByProduct', productId),
    linkToProduct: (productId: string, groupId: string) => invoke('modifier:linkToProduct', productId, groupId),
  },

  // ─── Orders ───────────────────────────────────────────────
  order: {
    create: (data: unknown) => invoke('order:create', data),
    list: (filters?: unknown) => invoke('order:list', filters),
    getById: (id: string) => invoke('order:getById', id),
    updateStatus: (id: string, status: string) => invoke('order:updateStatus', id, status),
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
    delete: (id: string) => invoke('user:delete', id),
    verifyPin: (id: string, pin: string) => invoke('user:verifyPin', id, pin),
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
  },

  // ─── Inventory ────────────────────────────────────────────
  inventory: {
    listIngredients: () => invoke('inventory:listIngredients'),
    createIngredient: (data: unknown) => invoke('inventory:createIngredient', data),
    updateIngredient: (id: string, data: unknown) => invoke('inventory:updateIngredient', id, data),
    deleteIngredient: (id: string) => invoke('inventory:deleteIngredient', id),
    listRecipes: (productId: string) => invoke('inventory:listRecipes', productId),
    upsertRecipe: (data: unknown) => invoke('inventory:upsertRecipe', data),
    deleteRecipe: (id: string) => invoke('inventory:deleteRecipe', id),
    getAlerts: () => invoke('inventory:getAlerts'),
    restock: (ingredientId: string, qty: number, note?: string) => invoke('inventory:restock', ingredientId, qty, note),
    deductForOrder: (orderId: string) => invoke('inventory:deductForOrder', orderId),
  },

  // ─── Reports ──────────────────────────────────────────────
  report: {
    dailySummary: (date?: string) => invoke('report:dailySummary', date),
    hourlyBreakdown: (date?: string) => invoke('report:hourlyBreakdown', date),
    topItems: (limit?: number, from?: string, to?: string) => invoke('report:topItems', limit, from, to),
    categoryRevenue: (from?: string, to?: string) => invoke('report:categoryRevenue', from, to),
    addonStats: (from?: string, to?: string) => invoke('report:addonStats', from, to),
    ticketDistribution: (from?: string, to?: string) => invoke('report:ticketDistribution', from, to),
    orderTypeSplit: (from?: string, to?: string) => invoke('report:orderTypeSplit', from, to),
    shiftReport: (shiftId: string) => invoke('report:shiftReport', shiftId),
    revenueTrend: (days?: number) => invoke('report:revenueTrend', days),
    inventoryAlerts: () => invoke('report:inventoryAlerts'),
    paymentMethodBreakdown: (from?: string, to?: string) => invoke('report:paymentMethodBreakdown', from, to),
  },

  // ─── Backup ───────────────────────────────────────────────
  backup: {
    trigger: () => invoke('backup:trigger'),
    getStatus: () => invoke('backup:getStatus'),
  },
})
