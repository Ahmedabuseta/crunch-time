/**
 * One-time normalization for the 10× stock-scale inflation on gram-based
 * ingredients (the owner saw 100,000 where the real count was 10,000).
 *
 * Rules:
 *  - Only ingredients with unit = 'g' are rescaled: stock := stock / 10.
 *  - NO inventory_transactions row is deleted or modified — the owner's own
 *    manual correction attempts stay verbatim in the ledger.
 *  - Each corrected item WITHOUT any prior owner ADJUSTMENT row gets ONE
 *    ADJUSTMENT row (q = new − old) so the ledger running balance replays
 *    consistently.
 *  - Packaged items (قطعة/كرتونة/etc.) and prices are untouched.
 *
 * Usage:
 *   npx tsx scripts/reset-inventory.mts --db="~/.config/Electron/fastfood.db"          (dry-run)
 *   npx tsx scripts/reset-inventory.mts --db="..." --apply
 */
import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dbArg = args.find((a) => a.startsWith('--db='))
let dbPath = dbArg ? dbArg.slice(5).replace(/^~(?=\/)/, os.homedir()) : path.join(os.homedir(), '.config', 'Electron', 'fastfood.db')
if (!fs.existsSync(dbPath)) {
  const cfg = path.join(os.homedir(), '.config')
  const hit = fs.existsSync(cfg) ? fs.readdirSync(cfg).find((d) => fs.existsSync(path.join(cfg, d, 'fastfood.db'))) : undefined
  if (!hit) { console.error(`fastfood.db not found (tried ${dbPath}); pass --db=path`); process.exit(1) }
  dbPath = path.join(cfg, hit, 'fastfood.db')
}

const db = new Database(dbPath, { fileMustExist: true })
const now = new Date().toISOString()

const ingRows = db.prepare(`SELECT id, name, unit, stock_quantity, purchase_qty
                            FROM ingredients WHERE unit = 'g' ORDER BY name`).all() as any[]
const adjustedIds = new Set(
  (db.prepare(`SELECT DISTINCT ingredient_id FROM inventory_transactions WHERE type = 'ADJUSTMENT'`).all() as any[])
    .map((r) => r.ingredient_id),
)

const round2 = (n: number) => Math.round(n * 100) / 100
const rows: { id: string; name: string; old: number; renewed: number; ledgerNeeded: boolean }[] = []
for (const ing of ingRows) {
  if (!(ing.stock_quantity > 0)) continue
  const renewed = round2(ing.stock_quantity / 10)
  rows.push({ id: ing.id, name: ing.name, old: ing.stock_quantity, renewed, ledgerNeeded: !adjustedIds.has(ing.id) })
}

console.log(`DB: ${dbPath}`)
console.log(apply ? 'MODE: APPLY' : 'MODE: dry-run (pass --apply to write)\n')
console.log('id                        | name                        | old            | new            | ledger')
console.log('-'.repeat(110))
for (const r of rows) {
  console.log(
    `${r.id.padEnd(25)} | ${r.name.padEnd(27)} | ${String(Math.round(r.old)).padStart(14)} | ${String(Math.round(r.renewed)).padStart(14)} | ${r.ledgerNeeded ? 'add ADJUSTMENT' : 'owner row kept'}`,
  )
}

if (!apply) {
  console.log('\nnothing written — review the table then run with --apply')
} else {
  const fmtQty = (n: number) => Math.round(n * 100) / 100
  const adjustIns = db.prepare(
    `INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, note, created_at)
     VALUES (?, ?, 'ADJUSTMENT', ?, 'تسوية مقياس المخزون (÷10)', ?)`,
  )
  const updt = db.prepare(`UPDATE ingredients SET stock_quantity = ? WHERE id = ?`)
  const done = db.transaction(() => {
    let count = 0
    for (const r of rows) {
      updt.run(r.renewed, r.id)
      if (r.ledgerNeeded && r.renewed - r.old !== 0) {
        adjustIns.run(crypto.randomUUID(), r.id, fmtQty(r.renewed - r.old), now)
      }
      count++
    }
    return count
  })
  const n = done()
  console.log(`\nwrote scale correction for ${n} gram-based ingredients.`)
}
db.close()
