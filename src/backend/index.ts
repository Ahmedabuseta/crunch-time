// Backend assembly. createBackend() injects the Electron-only capabilities
// (print, printer enumeration, dialogs, app lifecycle) so every domain module
// stays plain Node — the same functions serve the desktop IPC adapters and,
// later, the HTTP server.
import * as settings from './settings'
import * as delivery from './delivery'
import * as stations from './stations'
import * as expenses from './expenses'
import * as catalog from './catalog'
import * as addons from './addons'
import * as modifiers from './modifiers'
import * as orders from './orders'
import * as payments from './payments'
import * as users from './users'
import * as customers from './customers'
import * as shifts from './shifts'
import * as cashdrawer from './cashdrawer'
import * as inventory from './inventory'
import * as reports from './reports'
import * as backup from './backup'
import * as printing from './printing'
import * as session from './session'
import { setElectron, ElectronBits } from './electron'

export interface Backend {
  session: typeof session
  settings: typeof settings
  delivery: typeof delivery
  stations: typeof stations
  expenses: typeof expenses
  catalog: typeof catalog
  addons: typeof addons
  modifiers: typeof modifiers
  orders: typeof orders
  payments: typeof payments
  users: typeof users
  customers: typeof customers
  shifts: typeof shifts
  cashdrawer: typeof cashdrawer
  inventory: typeof inventory
  reports: typeof reports
  backup: typeof backup
  printing: typeof printing
}

export function createBackend(bits: ElectronBits): Backend {
  setElectron(bits)
  return {
    session,
    settings,
    delivery,
    stations,
    expenses,
    catalog,
    addons,
    modifiers,
    orders,
    payments,
    users,
    customers,
    shifts,
    cashdrawer,
    inventory,
    reports,
    backup,
    printing,
  }
}

export { setElectron, getElectron } from './electron'
export { setUser, clearUser, getUser, requireAdmin } from './session'
export * from './shared'
