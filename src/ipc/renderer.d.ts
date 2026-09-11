export interface ApiBridge {
  category: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string) => Promise<{ ok: boolean }>
    reorder: (ids: string[]) => Promise<{ ok: boolean }>
  }
  product: {
    list: (categoryId?: string) => Promise<any[]>
    getById: (id: string) => Promise<any>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string) => Promise<{ ok: boolean }>
  }
  addon: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<{ id: string }>
    update: (id: string, data: any) => Promise<{ ok: boolean }>
    delete: (id: string) => Promise<{ ok: boolean }>
    listByProduct: (productId: string) => Promise<any[]>
    linkToProduct: (productId: string, addonId: string) => Promise<{ ok: boolean }>
  }
  modifier: {
    listGroups: () => Promise<any[]>
    createGroup: (data: any) => Promise<{ id: string }>
    updateGroup: (id: string, data: any) => Promise<{ ok: boolean }>
    deleteGroup: (id: string) => Promise<{ ok: boolean }>
    listByGroup: (groupId: string) => Promise<any[]>
    createModifier: (data: any) => Promise<{ id: string }>
    updateModifier: (id: string, data: any) => Promise<{ ok: boolean }>
    deleteModifier: (id: string) => Promise<{ ok: boolean }>
    listByProduct: (productId: string) => Promise<any[]>
    linkToProduct: (productId: string, groupId: string) => Promise<{ ok: boolean }>
  }
  order: {
    create: (data: any) => Promise<{ id: string }>
    list: (filters?: any) => Promise<any[]>
    getById: (id: string) => Promise<any>
    updateStatus: (id: string, status: string) => Promise<{ ok: boolean }>
    delete: (id: string) => Promise<{ ok: boolean }>
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
    delete: (id: string) => Promise<{ ok: boolean }>
    verifyPin: (id: string, pin: string) => Promise<{ ok: boolean; user?: any; error?: string }>
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
  }
  inventory: {
    listIngredients: () => Promise<any[]>
    createIngredient: (data: any) => Promise<{ id: string }>
    updateIngredient: (id: string, data: any) => Promise<{ ok: boolean }>
    deleteIngredient: (id: string) => Promise<{ ok: boolean }>
    listRecipes: (productId: string) => Promise<any[]>
    upsertRecipe: (data: any) => Promise<{ id: string }>
    deleteRecipe: (id: string) => Promise<{ ok: boolean }>
    getAlerts: () => Promise<any[]>
    restock: (ingredientId: string, qty: number, note?: string) => Promise<{ ok: boolean }>
    deductForOrder: (orderId: string) => Promise<{ ok: boolean }>
  }
  report: {
    dailySummary: (date?: string) => Promise<any>
    hourlyBreakdown: (date?: string) => Promise<any[]>
    topItems: (limit?: number, from?: string, to?: string) => Promise<any[]>
    categoryRevenue: (from?: string, to?: string) => Promise<any[]>
    addonStats: (from?: string, to?: string) => Promise<any[]>
    ticketDistribution: (from?: string, to?: string) => Promise<any[]>
    orderTypeSplit: (from?: string, to?: string) => Promise<any>
    shiftReport: (shiftId: string) => Promise<any>
    revenueTrend: (days?: number) => Promise<any[]>
    inventoryAlerts: () => Promise<any[]>
    paymentMethodBreakdown: (from?: string, to?: string) => Promise<any[]>
  }
  backup: {
    trigger: () => Promise<any>
    getStatus: () => Promise<any>
  }
}

declare global {
  interface Window {
    api: ApiBridge
  }
}
