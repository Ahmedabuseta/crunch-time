// IPC adapters. All business logic lives in src/backend/* (plain Node,
// unit-testable, shared with the HTTP server); this file only wires each
// ipcMain channel to the equivalent backend function.
import { ipcMain, app, BrowserWindow, dialog, powerSaveBlocker } from 'electron'
import { runMigrations } from '../db/migrate'
import { seedDatabase } from '../db/seed'
import { createBackend, Backend } from '../backend'
import { applyRemoteServer, getRemoteStatus, setDesktopNotifier } from '../server'
import { ensureRuntime, stopRuntime } from '../ai/runtime'
import { expireStaleActions } from '../ai/config'
import {
  disableFunnel,
  enableFunnel,
  getFunnelStatus,
  getTailscaleStatus,
  installTailscale,
  tailscaleUp,
} from '../backend/tailscale'
import { silentPrint } from './print'

let backend: Backend | null = null

// The phone talks to this machine; if it suspends, a chat dies mid-stream and a
// confirm card stops answering. `prevent-app-suspension` keeps the machine and
// its network alive while still letting the display sleep.
let powerBlockerId: number | null = null

function syncPowerBlocker(running: boolean): void {
  if (running && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    return
  }
  if (!running && powerBlockerId !== null) {
    try {
      powerSaveBlocker.stop(powerBlockerId)
    } catch {
      // already released
    }
    powerBlockerId = null
  }
}

function syncPowerBlockerToServer(): void {
  syncPowerBlocker(getRemoteStatus().running)
}

function getBackend(): Backend {
  if (!backend) {
    backend = createBackend({
      print: silentPrint,
      // The renderer's sender and any main-process window enumerate the
      // same OS printers, so a window's webContents reports the same list.
      listPrinters: async () => {
        try {
          const win = BrowserWindow.getAllWindows()[0]
          if (!win) return []
          return await win.webContents.getPrintersAsync()
        } catch {
          return []
        }
      },
      dialogs: {
        showSaveDialog: (opts) => dialog.showSaveDialog(opts),
        showOpenDialog: (opts) => dialog.showOpenDialog(opts),
      },
      app: {
        getPath: (name) => app.getPath(name),
        relaunch: () => app.relaunch(),
        exit: (code) => app.exit(code),
      },
    })
  }
  return backend
}

export async function initBackend() {
  runMigrations()
  await seedDatabase()
  registerIpcHandlers()
  // A phone-side change (new order, status, driver) is pushed to every window
  // so the desktop order board updates live instead of waiting for its poll.
  setDesktopNotifier((channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('events:push', { channel, payload })
    }
  })
  // Bring the remote POS server up if the owner has it enabled (off by default).
  await applyRemoteServer(getBackend())
  syncPowerBlockerToServer()
  // Housekeeping + the assistant runtime, if the owner turned it on.
  try {
    expireStaleActions()
  } catch {
    // a database without the assistant tables is fine
  }
  await ensureRuntime().catch(() => ({ ok: false }))
  // Nothing must outlive the app: the worker and the Temporal server both keep
  // ports open, and a stale worker would fight the next launch for the queue.
  app.on('will-quit', () => {
    void stopRuntime()
    syncPowerBlocker(false)
  })
}

export function registerIpcHandlers() {
  const b = getBackend()
  // Fresh session per registration — matches the original per-call closure.
  b.session.clearUser()

  // ─── Session: track current user for role-based access ─────
  ipcMain.handle('session:setUser', (_e, user: { id: string; role: string } | null) => {
    b.session.setUser(user)
  })
  ipcMain.handle('session:clearUser', () => {
    b.session.clearUser()
  })

  // ═══════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('settings:get', () =>
    b.settings.getSettings()
  )

  ipcMain.handle('settings:update', async (e, data: any) =>
    b.settings.updateSettings(data, { listPrinters: () => e.sender.getPrintersAsync() })
  )

  // ═══════════════════════════════════════════════════════════
  // DISCOUNT CODES
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('discountCode:list', () =>
    b.settings.listDiscountCodes()
  )

  ipcMain.handle('discountCode:create', (_e, data: any) =>
    b.settings.createDiscountCode(data)
  )

  ipcMain.handle('discountCode:update', (_e, id: string, data: any) =>
    b.settings.updateDiscountCode(id, data)
  )

  ipcMain.handle('discountCode:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.settings.deleteDiscountCode(id, opts)
  )

  ipcMain.handle('discountCode:validate', (_e, code: string) =>
    b.settings.validateDiscountCode(code)
  )

  ipcMain.handle('discountCode:use', (_e, id: string) =>
    b.settings.useDiscountCode(id)
  )

  // ═══════════════════════════════════════════════════════════
  // DELIVERY ZONES
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('deliveryZone:list', (_e, includeInactive?: boolean) =>
    b.delivery.listDeliveryZones(includeInactive)
  )

  ipcMain.handle('deliveryZone:create', (_e, data: any) =>
    b.delivery.createDeliveryZone(data)
  )

  ipcMain.handle('deliveryZone:update', (_e, id: string, data: any) =>
    b.delivery.updateDeliveryZone(id, data)
  )

  ipcMain.handle('deliveryZone:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.delivery.deleteDeliveryZone(id, opts)
  )

  ipcMain.handle('deliveryZone:reorder', (_e: any, ids: string[]) =>
    b.delivery.reorderDeliveryZones(ids)
  )

  // ═══════════════════════════════════════════════════════════
  // DELIVERY PROFILES (delivery boys)
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('deliveryProfile:list', (_e, includeInactive?: boolean) =>
    b.delivery.listDeliveryProfiles(includeInactive)
  )
  ipcMain.handle('deliveryProfile:create', (_e, data: any) =>
    b.delivery.createDeliveryProfile(data)
  )
  ipcMain.handle('deliveryProfile:update', (_e, id: string, data: any) =>
    b.delivery.updateDeliveryProfile(id, data)
  )
  ipcMain.handle('deliveryProfile:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.delivery.deleteDeliveryProfile(id, opts)
  )

  // ═══════════════════════════════════════════════════════════
  // PRINTERS + KITCHEN STATIONS (print routing)
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('printer:list', async (e) =>
    b.stations.listPrinters(() => e.sender.getPrintersAsync())
  )

  ipcMain.handle('printer:printHtml', async (_e, html: string, opts?: { deviceName?: string; copies?: number; paperWidth?: string }) =>
    b.stations.printHtml(html, opts)
  )

  ipcMain.handle('printer:test', async (_e, deviceName?: string) =>
    b.stations.testPrint(deviceName)
  )

  ipcMain.handle('station:list', (_e, includeInactive?: boolean) =>
    b.stations.listStations(includeInactive)
  )

  ipcMain.handle('station:create', async (e, data: any) =>
    b.stations.createStation(data, { listPrinters: () => e.sender.getPrintersAsync() })
  )

  ipcMain.handle('station:update', async (e, id: string, data: any) =>
    b.stations.updateStation(id, data, { listPrinters: () => e.sender.getPrintersAsync() })
  )

  ipcMain.handle('station:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.stations.deleteStation(id, opts)
  )

  // Print routing preview for an order: station → its items
  ipcMain.handle('station:routeOrder', (_e, orderId: string) =>
    b.stations.routeOrder(orderId)
  )

  // ═══════════════════════════════════════════════════════════
  // EXPENSES
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('expense:list', () =>
    b.expenses.listExpenses()
  )

  ipcMain.handle('expense:create', (_e, data: any) =>
    b.expenses.createExpense(data)
  )

  ipcMain.handle('expense:update', (_e, id: string, data: any) =>
    b.expenses.updateExpense(id, data)
  )

  ipcMain.handle('expense:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.expenses.deleteExpense(id, opts)
  )

  ipcMain.handle('expense:totalMonthly', () =>
    b.expenses.totalMonthlyExpenses()
  )

  // ═══════════════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('category:list', () =>
    b.catalog.listCategories()
  )

  ipcMain.handle('category:create', (_e, data: any) =>
    b.catalog.createCategory(data)
  )

  ipcMain.handle('category:update', (_e, id: string, data: any) =>
    b.catalog.updateCategory(id, data)
  )

  ipcMain.handle('category:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.catalog.deleteCategory(id, opts)
  )

  ipcMain.handle('category:reorder', (_e: any, ids: string[]) =>
    b.catalog.reorderCategories(ids)
  )

  // ═══════════════════════════════════════════════════════════
  // PRODUCTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('product:list', (_e, categoryId?: string, includeInactive?: boolean) =>
    b.catalog.listProducts(categoryId, includeInactive)
  )

  ipcMain.handle('product:getById', (_e, id: string) =>
    b.catalog.getProductById(id)
  )

  ipcMain.handle('product:create', (_e, data: any) =>
    b.catalog.createProduct(data)
  )

  ipcMain.handle('product:update', (_e, id: string, data: any) =>
    b.catalog.updateProduct(id, data)
  )

  ipcMain.handle('product:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.catalog.deleteProduct(id, opts)
  )

  // ═══════════════════════════════════════════════════════════
  // ADDONS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('addon:list', () =>
    b.addons.listAddons()
  )

  ipcMain.handle('addon:create', (_e, data: any) =>
    b.addons.createAddon(data)
  )

  ipcMain.handle('addon:update', (_e, id: string, data: any) =>
    b.addons.updateAddon(id, data)
  )

  ipcMain.handle('addon:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.addons.deleteAddon(id, opts)
  )

  ipcMain.handle('addon:listByProduct', (_e, productId: string) =>
    b.addons.listAddonsByProduct(productId)
  )

  ipcMain.handle('addon:linkToProduct', (_e, productId: string, addonId: string) =>
    b.addons.linkAddonToProduct(productId, addonId)
  )

  ipcMain.handle('addon:setProductLinks', (_e, productId: string, addonIds: string[]) =>
    b.addons.setAddonLinks(productId, addonIds)
  )

  ipcMain.handle('addon:listRecipes', (_e, addonId: string) =>
    b.addons.listAddonRecipes(addonId)
  )

  ipcMain.handle('addon:upsertRecipe', (_e, data: any) =>
    b.addons.upsertAddonRecipe(data)
  )

  ipcMain.handle('addon:deleteRecipe', (_e, id: string) =>
    b.addons.deleteAddonRecipe(id)
  )

  // ═══════════════════════════════════════════════════════════
  // MODIFIERS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('modifier:listGroups', () =>
    b.modifiers.listModifierGroups()
  )

  ipcMain.handle('modifier:createGroup', (_e, data: any) =>
    b.modifiers.createModifierGroup(data)
  )

  ipcMain.handle('modifier:updateGroup', (_e, id: string, data: any) =>
    b.modifiers.updateModifierGroup(id, data)
  )

  ipcMain.handle('modifier:deleteGroup', (_e, id: string, opts?: { hard?: boolean }) =>
    b.modifiers.deleteModifierGroup(id, opts)
  )

  ipcMain.handle('modifier:listByGroup', (_e, groupId: string) =>
    b.modifiers.listModifiersByGroup(groupId)
  )

  ipcMain.handle('modifier:createModifier', (_e, data: any) =>
    b.modifiers.createModifier(data)
  )

  ipcMain.handle('modifier:updateModifier', (_e, id: string, data: any) =>
    b.modifiers.updateModifier(id, data)
  )

  ipcMain.handle('modifier:deleteModifier', (_e, id: string, opts?: { hard?: boolean }) =>
    b.modifiers.deleteModifier(id, opts)
  )

  ipcMain.handle('modifier:listByProduct', (_e: any, productId: string) =>
    b.modifiers.listModifiersByProduct(productId)
  )

  ipcMain.handle('modifier:linkToProduct', (_e, productId: string, groupId: string) =>
    b.modifiers.linkModifierToProduct(productId, groupId)
  )

  ipcMain.handle('modifier:setProductLinks', (_e, productId: string, groupIds: string[]) =>
    b.modifiers.setModifierLinks(productId, groupIds)
  )

  ipcMain.handle('modifier:listRecipes', (_e, modifierId: string) =>
    b.modifiers.listModifierRecipes(modifierId)
  )

  ipcMain.handle('modifier:upsertRecipe', (_e, data: any) =>
    b.modifiers.upsertModifierRecipe(data)
  )

  ipcMain.handle('modifier:deleteRecipe', (_e, id: string) =>
    b.modifiers.deleteModifierRecipe(id)
  )

  // ═══════════════════════════════════════════════════════════
  // ORDERS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('order:create', (_e, data: any) =>
    b.orders.createOrder(data)
  )

  ipcMain.handle('order:list', (_e, filters?: any) =>
    b.orders.listOrders(filters)
  )

  ipcMain.handle('order:getById', (_e, id: string) =>
    b.orders.getOrderById(id)
  )

  ipcMain.handle('order:updateStatus', (_e, id: string, status: string, reason?: string) =>
    b.orders.updateOrderStatus(id, status, reason)
  )

  // ─── Delivery driver workflow ─────────────────────────────
  // Cashier *and* admin may assign: the cashier hands orders to drivers all
  // day, so this deliberately has no requireAdmin() (unlike updateStatus).
  ipcMain.handle('order:assignDriver', (_e, orderId: string, profileId: string) =>
    b.orders.assignDriver(orderId, profileId)
  )

  // Badge feed for the الديلفري top tab — today's unresolved delivery orders
  // only, so old backfilled rows never keep the badge lit forever. A NULL
  // driver_status on a delivery order means the same as 'unassigned' (rows
  // written outside order:create, e.g. by the demo seed) — count those too.
  ipcMain.handle('order:unassignedCount', () =>
    b.orders.unassignedCount()
  )

  ipcMain.handle('order:delete', (_e, id: string) =>
    b.orders.deleteOrder(id)
  )

  // ═══════════════════════════════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('payment:create', (_e, data: any) =>
    b.payments.createPayment(data)
  )

  ipcMain.handle('payment:listByOrder', (_e, orderId: string) =>
    b.payments.listPaymentsByOrder(orderId)
  )

  ipcMain.handle('payment:getTotalPaid', (_e, orderId: string) =>
    b.payments.getTotalPaid(orderId)
  )

  // ═══════════════════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('user:list', () =>
    b.users.listUsers()
  )

  ipcMain.handle('user:create', async (_e, data: any) =>
    b.users.createUser(data)
  )

  ipcMain.handle('user:update', async (_e, id: string, data: any) =>
    b.users.updateUser(id, data)
  )

  ipcMain.handle('user:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.users.deleteUser(id, opts)
  )

  ipcMain.handle('user:verifyPin', async (_e, id: string, pin: string) =>
    b.users.verifyPin(id, pin)
  )

  // ═══════════════════════════════════════════════════════════
  // CUSTOMERS (delivery autocomplete)
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('customer:search', (_e, prefix: string) =>
    b.customers.searchCustomers(prefix)
  )

  ipcMain.handle('customer:upsert', (_e, data: any) =>
    b.customers.upsertCustomer(data)
  )

  // ═══════════════════════════════════════════════════════════
  // SHIFTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('shift:open', (_e, data: any) =>
    b.shifts.openShift(data)
  )

  ipcMain.handle('shift:close', async (_e, id: string, closingCash: number) => {
    const result = b.shifts.closeShift(id, closingCash)
    if (!result?.ok) return result
    const print = await b.printing.printShiftSummary(id)
    return { ...result, print }
  })

  ipcMain.handle('shift:getCurrent', () =>
    b.shifts.getCurrentShift()
  )

  ipcMain.handle('shift:list', (_e, filters?: any) =>
    b.shifts.listShifts(filters)
  )

  // ═══════════════════════════════════════════════════════════
  // CASH DRAWER
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('cashDrawer:addMovement', (_e, data: any) =>
    b.cashdrawer.addMovement(data)
  )

  ipcMain.handle('cashDrawer:listByShift', (_e, shiftId: string) =>
    b.cashdrawer.listMovementsByShift(shiftId)
  )

  ipcMain.handle('cashDrawer:reconcile', (_e, shiftId: string) =>
    b.cashdrawer.reconcile(shiftId)
  )

  ipcMain.handle('cashDrawer:reconcileBatch', (_e, shiftIds: string[]) =>
    b.cashdrawer.reconcileBatch(shiftIds)
  )

  ipcMain.handle('cashDrawer:expectedCash', (_e, shiftId: string) =>
    b.cashdrawer.expectedCash(shiftId)
  )

  // ═══════════════════════════════════════════════════════════
  // INVENTORY
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('inventory:listIngredients', (_e, opts?: { includeInactive?: boolean }) =>
    b.inventory.listIngredients(opts)
  )

  ipcMain.handle('inventory:createIngredient', (_e, data: any) =>
    b.inventory.createIngredient(data)
  )

  ipcMain.handle('inventory:updateIngredient', (_e, id: string, data: any) =>
    b.inventory.updateIngredient(id, data)
  )

  ipcMain.handle('inventory:deleteIngredient', (_e, id: string, opts?: { hard?: boolean }) =>
    b.inventory.deleteIngredient(id, opts)
  )

  ipcMain.handle('inventory:setIngredientActive', (_e, id: string, active: boolean) =>
    b.inventory.setIngredientActive(id, active)
  )

  ipcMain.handle('inventory:listIngredientProducts', (_e, ingredientId: string) =>
    b.inventory.listIngredientProducts(ingredientId)
  )

  ipcMain.handle('inventory:consumptionSummary', (_e, opts?: { from?: string; to?: string }) =>
    b.inventory.consumptionSummary(opts)
  )

  ipcMain.handle('inventory:backfillConsumption', (_e, opts?: {
    from?: string
    to?: string
    statuses?: string[]
    orderType?: string
    dryRun?: boolean
  }) => b.inventory.backfillConsumption(opts))

  ipcMain.handle('inventory:listRecipes', (_e, productId: string) =>
    b.inventory.listRecipes(productId)
  )

  ipcMain.handle('inventory:upsertRecipe', (_e, data: any) =>
    b.inventory.upsertRecipe(data)
  )

  ipcMain.handle('inventory:deleteRecipe', (_e, id: string) =>
    b.inventory.deleteRecipe(id)
  )

  ipcMain.handle('inventory:getAlerts', () =>
    b.inventory.getAlerts()
  )

  // ─── Sub-recipes (reusable prepared components) ──────────────
  ipcMain.handle('subRecipe:listAll', () =>
    b.inventory.listSubRecipes()
  )

  ipcMain.handle('subRecipe:upsert', (_e, data: { id?: string; name: string; unit: string; active?: boolean }) =>
    b.inventory.upsertSubRecipe(data)
  )

  ipcMain.handle('subRecipe:delete', (_e, id: string, opts?: { hard?: boolean }) =>
    b.inventory.deleteSubRecipe(id, opts)
  )

  ipcMain.handle('subRecipe:listIngredients', (_e, subRecipeId: string) =>
    b.inventory.listSubRecipeIngredients(subRecipeId)
  )

  ipcMain.handle('subRecipe:upsertIngredient', (_e, data: { id?: string; subRecipeId: string; ingredientId: string; quantityPerUnit: number }) =>
    b.inventory.upsertSubRecipeIngredient(data)
  )

  ipcMain.handle('subRecipe:deleteIngredient', (_e, id: string) =>
    b.inventory.deleteSubRecipeIngredient(id)
  )

  ipcMain.handle('inventory:getPurchaseSavings', () =>
    b.inventory.getPurchaseSavings()
  )

  ipcMain.handle('inventory:restock', (_e, ingredientId: string, qty: number, note?: string, opts?: { unitCost?: number; packagePrice?: number; totalPrice?: number; supplier?: string; byQuantity?: boolean }) =>
    b.inventory.restock(ingredientId, qty, note, opts)
  )

  ipcMain.handle('inventory:listTransactions', (_e, ingredientId: string, filters?: { type?: string; from?: string; to?: string; page?: number; pageSize?: number }) =>
    b.inventory.listTransactions(ingredientId, filters)
  )

  ipcMain.handle('inventory:recordWaste', (_e, ingredientId: string, qty: number, note?: string) =>
    b.inventory.recordWaste(ingredientId, qty, note)
  )

  ipcMain.handle('inventory:adjust', (_e, ingredientId: string, delta: number, note?: string) =>
    b.inventory.adjust(ingredientId, delta, note)
  )

  ipcMain.handle('inventory:exchange', (_e, input: {
    fromIngredientId: string; fromPackages: number; toIngredientId: string; toPackages: number;
    packagePrice?: number; supplier?: string; note?: string
  }) => b.inventory.exchange(input))

  ipcMain.handle('inventory:deductForOrder', (_e, orderId: string) =>
    b.inventory.deductForOrder(orderId)
  )

  // ═══════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('report:dailySummary', (_e, date?: string) =>
    b.reports.dailySummary(date)
  )

  ipcMain.handle('report:periodSummary', (_e, from?: string, to?: string) =>
    b.reports.periodSummary(from, to)
  )

  ipcMain.handle('report:profitSummary', (_e, from?: string, to?: string) =>
    b.reports.profitSummary(from, to)
  )

  ipcMain.handle('report:hourlyBreakdown', (_e, date?: string) =>
    b.reports.hourlyBreakdown(date)
  )

  ipcMain.handle('report:topItems', (_e, limit = 10, from?: string, to?: string) =>
    b.reports.topItems(limit, from, to)
  )

  ipcMain.handle('report:categoryRevenue', (_e, from?: string, to?: string) =>
    b.reports.categoryRevenue(from, to)
  )

  ipcMain.handle('report:addonStats', (_e, from?: string, to?: string) =>
    b.reports.addonStats(from, to)
  )

  ipcMain.handle('report:ticketDistribution', (_e, from?: string, to?: string) =>
    b.reports.ticketDistribution(from, to)
  )

  ipcMain.handle('report:orderTypeSplit', (_e, from?: string, to?: string) =>
    b.reports.orderTypeSplit(from, to)
  )

  ipcMain.handle('report:shiftReport', (_e, shiftId: string) =>
    b.reports.shiftReport(shiftId)
  )

  ipcMain.handle('report:shiftSummary', (_e, from?: string, to?: string) =>
    b.reports.shiftSummary(from, to)
  )

  ipcMain.handle('report:laborSummary', (_e, from?: string, to?: string) =>
    b.reports.laborSummary(from, to)
  )

  ipcMain.handle('report:voidSummary', (_e, from?: string, to?: string) =>
    b.reports.voidSummary(from, to)
  )

  // ─── Delivery settlement (report-only) ─────────────────────
  // Groups a day's (or a range's) delivery orders by driver. cashTotal is the
  // COD money that driver collected and hands over at end of day; visa is
  // shown separately because it never passes through their hands.
  ipcMain.handle('report:driverSummary', (_e, opts?: { from?: string; to?: string }) =>
    b.reports.driverSummary(opts)
  )

  ipcMain.handle('report:revenueTrend', (_e, days = 7) =>
    b.reports.revenueTrend(days)
  )

  ipcMain.handle('report:inventoryAlerts', () =>
    b.reports.inventoryAlerts()
  )

  ipcMain.handle('report:paymentMethodBreakdown', (_e, from?: string, to?: string) =>
    b.reports.paymentMethodBreakdown(from, to)
  )

  ipcMain.handle('report:discountSummary', (_e, from?: string, to?: string) =>
    b.reports.discountSummary(from, to)
  )

  ipcMain.handle('report:abcXyz', (_e, from?: string, to?: string) =>
    b.reports.abcXyz(from, to)
  )

  ipcMain.handle('report:inventoryTurnover', (_e, from?: string, to?: string) =>
    b.reports.inventoryTurnover(from, to)
  )

  ipcMain.handle('report:purchasePriceVariance', (_e, from?: string, to?: string) =>
    b.reports.purchasePriceVariance(from, to)
  )

  ipcMain.handle('report:salesTrend', (_e, opts?: { days?: number; forecastDays?: number }) =>
    b.reports.salesTrend(opts)
  )

  ipcMain.handle('report:daysOnHand', () =>
    b.reports.daysOnHand()
  )

  // ═══════════════════════════════════════════════════════════
  // BACKUP
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('backup:trigger', async () =>
    b.backup.triggerBackup()
  )

  ipcMain.handle('backup:getStatus', () =>
    b.backup.getBackupStatus()
  )

  // ═══════════════════════════════════════════════════════════
  // EXPORT / RESTORE — move the whole dataset between machines
  // ═══════════════════════════════════════════════════════════

  // Save a consistent single-file snapshot anywhere the user picks
  // (USB stick, network share, another PC).
  ipcMain.handle('backup:export', async () =>
    b.backup.exportBackup()
  )

  // Export any table to a CSV file that opens directly in
  // Excel. The UTF-8 BOM makes Excel detect the Arabic text
  // correctly (without it Excel mangles the Arabic glyphs).
  ipcMain.handle('export:csv', async (_e, name: string, rows: string[][]) =>
    b.backup.exportCsv(name, rows)
  )

  // Replace the live database with a picked .db file: validate first,
  // snapshot what's on disk now, swap the file, restart so migrations run.
  ipcMain.handle('backup:restore', async () =>
    b.backup.restoreBackup()
  )

  // ═══════════════════════════════════════════════════════════
  // REMOTE POS SERVER (owner's phone)
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('remote:get', () => getRemoteStatus())

  // Toggle/port change: persist first, then (re)start the listener so the
  // config on disk and the open port never disagree.
  ipcMain.handle('remote:set', async (_e, data: any) => {
    const res = b.settings.setRemoteConfig(data)
    if (!res.ok) return { ...res, status: getRemoteStatus() }
    const started = await applyRemoteServer(b)
    syncPowerBlockerToServer()
    return { ok: started.ok, error: started.error, status: getRemoteStatus() }
  })

  // New PIN → new signing secret → every phone token is invalidated at once.
  ipcMain.handle('remote:setPin', async (_e, pin: string) => {
    const res = await b.settings.setRemotePin(pin)
    return { ...res, status: getRemoteStatus() }
  })

  // Let the app invent the PIN so the owner never has to.
  ipcMain.handle('remote:generatePin', async () => {
    const res = await b.settings.generateRemotePin()
    return { ...res, status: getRemoteStatus() }
  })

  // Single-use code for the pairing QR (10 minutes).
  ipcMain.handle('remote:pairCode', () => b.settings.createRemotePairCode())
  ipcMain.handle('remote:clearPairCode', () => b.settings.clearRemotePairCode())

  // ═══════════════════════════════════════════════════════════
  // TAILSCALE (remote access helper)
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('tailscale:status', () => getTailscaleStatus())
  ipcMain.handle('tailscale:install', () => installTailscale())
  ipcMain.handle('tailscale:up', () => tailscaleUp())
  ipcMain.handle('tailscale:funnelStatus', () => getFunnelStatus())
  ipcMain.handle('tailscale:funnelEnable', (_e, localPort: number, publicPort?: number) =>
    enableFunnel(localPort, publicPort))
  ipcMain.handle('tailscale:funnelDisable', (_e, publicPort?: number) => disableFunnel(publicPort))
}
