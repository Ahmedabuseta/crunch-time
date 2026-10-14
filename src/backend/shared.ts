// Shared helpers for the backend domain modules.
// Plain Node — raw SQL via getSqlite(), drizzle via getDb(). No Electron imports.
import { randomUUID } from 'crypto'
import { getSqlite } from '../db/client'

export function now() { return new Date().toISOString() }
export function uuid() { return randomUUID() }
export const r2 = (n: number) => Math.round(n * 100) / 100

// ─── Inventory helpers (raw SQL, snake_case) ─────────────────
export function getOpenShiftId(dataShiftId?: string | null): string | null {
  const row = getSqlite().prepare("SELECT id FROM shifts WHERE status = 'open' LIMIT 1").get() as { id: string } | undefined
  return row?.id || dataShiftId || null
}

// Recalculate a product's cost_price from its recipe (Σ quantity × ingredient cost)
export function recomputeProductCost(productId: string) {
  const s = getSqlite()
  const rows = s.prepare(`
    SELECT r.quantity_per_unit AS qty, i.cost_per_unit AS unitCost
    FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.product_id = ? AND r.ingredient_id IS NOT NULL
    UNION ALL
    SELECT r.quantity_per_unit * sri.quantity_per_unit AS qty, i.cost_per_unit AS unitCost
    FROM recipes r
    JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
    JOIN ingredients i ON i.id = sri.ingredient_id
    WHERE r.product_id = ? AND r.sub_recipe_id IS NOT NULL
  `).all(productId, productId) as any[]
  const cost = rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0)
  s.prepare('UPDATE products SET cost_price = ? WHERE id = ?').run(cost, productId)
}

// Expand recipe rows (ingredients AND sub-recipes) into flat ingredient consumptions
export function expandRecipes(rows: { ingredient_id?: string | null; sub_recipe_id?: string | null; quantity_per_unit: number }[]): { ingredientId: string; qty: number }[] {
  const s = getSqlite()
  const out: { ingredientId: string; qty: number }[] = []
  for (const r of rows) {
    const factor = Number(r.quantity_per_unit) || 0
    if (r.sub_recipe_id) {
      const parts = s.prepare('SELECT sri.ingredient_id AS ingredientId, sri.quantity_per_unit AS qty FROM sub_recipe_ingredients sri WHERE sri.sub_recipe_id = ?').all(r.sub_recipe_id) as { ingredientId: string; qty: number }[]
      for (const p of parts) out.push({ ingredientId: p.ingredientId, qty: factor * (Number(p.qty) || 0) })
    } else if (r.ingredient_id) {
      out.push({ ingredientId: r.ingredient_id, qty: factor })
    }
  }
  return out
}

// Unified recipe rows (ingredient rows + sub-recipe rows) for a product/addon/modifier
export function listRecipeRows(table: string, entityCol: string, entityId: string) {
  const s = getSqlite()
  const ingredientRows = s.prepare(`
    SELECT r.id, r.ingredient_id AS ingredientId, NULL AS subRecipeId,
           r.quantity_per_unit AS quantityPerUnit,
           i.name AS ingredientName, NULL AS subRecipeName, i.unit, NULL AS subRecipeUnit,
           i.cost_per_unit AS costPerUnit, NULL AS subRecipeCostPerUnit,
           i.cost_per_unit * r.quantity_per_unit AS lineCost
    FROM ${table} r JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.${entityCol} = ? AND r.ingredient_id IS NOT NULL
  `).all(entityId) as any[]
  const subRows = s.prepare(`
    SELECT r.id, NULL AS ingredientId, r.sub_recipe_id AS subRecipeId,
           r.quantity_per_unit AS quantityPerUnit,
           NULL AS ingredientName, sr.name AS subRecipeName, NULL AS unit, sr.unit AS subRecipeUnit,
           NULL AS costPerUnit,
           (SELECT COALESCE(SUM(i.cost_per_unit * sri.quantity_per_unit), 0)
            FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
            WHERE sri.sub_recipe_id = sr.id) AS subRecipeCostPerUnit,
           (SELECT COALESCE(SUM(i.cost_per_unit * sri.quantity_per_unit), 0)
            FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
            WHERE sri.sub_recipe_id = sr.id) * r.quantity_per_unit AS lineCost
    FROM ${table} r JOIN sub_recipes sr ON sr.id = r.sub_recipe_id
    WHERE r.${entityCol} = ? AND r.sub_recipe_id IS NOT NULL
  `).all(entityId) as any[]
  return [...ingredientRows, ...subRows]
}

// Full rollback — CANCELLED: return ALL ingredients (products + addons)
export function rollbackInventory(orderId: string) {
  const s = getSqlite()
  const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[]
  const restore = (ingredientId: string, qty: number, note: string) => {
    s.prepare('UPDATE ingredients SET stock_quantity = stock_quantity + ? WHERE id = ?').run(qty, ingredientId)
    s.prepare(`INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
      VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?)`)
      .run(uuid(), ingredientId, qty, orderId, note, now())
  }
  for (const item of items) {
    for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM recipes WHERE product_id = ?').all(item.product_id) as any[])) {
      restore(c.ingredientId, c.qty * item.quantity, `إرجاع منتج — طلب ${orderId}`)
    }
    if (item.selected_addons_json) {
      try {
        const addonIds = JSON.parse(item.selected_addons_json) as string[]
        for (const addonId of addonIds) {
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM addon_recipes WHERE addon_id = ?').all(addonId) as any[])) {
            restore(c.ingredientId, c.qty * item.quantity, `إرجاع إضافة — طلب ${orderId}`)
          }
        }
      } catch {}
    }
    if (item.selected_modifiers_json) {
      try {
        const mods = JSON.parse(item.selected_modifiers_json) as { modifierId: string }[]
        for (const mod of mods) {
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM modifier_recipes WHERE modifier_id = ?').all(mod.modifierId) as any[])) {
            restore(c.ingredientId, c.qty * item.quantity, `إرجاع تعديل — طلب ${orderId}`)
          }
        }
      } catch {}
    }
  }
}

// Partial rollback — REFUNDED: only products+addons that support rollback
export function rollbackInventoryPartial(orderId: string): number {
  const s = getSqlite()
  const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[]
  let refundedAmount = 0
  const restore = (ingredientId: string, qty: number, note: string) => {
    s.prepare('UPDATE ingredients SET stock_quantity = stock_quantity + ? WHERE id = ?').run(qty, ingredientId)
    s.prepare(`INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
      VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?)`)
      .run(uuid(), ingredientId, qty, orderId, note, now())
  }
  for (const item of items) {
    const product = s.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any | undefined
    if (!product) continue
    let itemRefund = 0

    if (product.supports_rollback) {
      for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM recipes WHERE product_id = ?').all(item.product_id) as any[])) {
        restore(c.ingredientId, c.qty * item.quantity, `إرجاع جزئي ${orderId} — ${product.name}`)
      }
      if (item.selected_modifiers_json) {
        try {
          const mods = JSON.parse(item.selected_modifiers_json) as { modifierId: string }[]
          for (const mod of mods) {
            for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM modifier_recipes WHERE modifier_id = ?').all(mod.modifierId) as any[])) {
              restore(c.ingredientId, c.qty * item.quantity, `إرجاع جزئي ${orderId} — ${product.name}`)
            }
          }
        } catch {}
      }
      itemRefund += (item.unit_price ?? product.price) * item.quantity
    }

    if (item.selected_addons_json) {
      try {
        const addonIds = JSON.parse(item.selected_addons_json) as string[]
        for (const addonId of addonIds) {
          const addon = s.prepare('SELECT * FROM addons WHERE id = ?').get(addonId) as any | undefined
          if (!addon || !addon.supports_rollback) continue
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM addon_recipes WHERE addon_id = ?').all(addonId) as any[])) {
            restore(c.ingredientId, c.qty * item.quantity, `إرجاع إضافة ${orderId} — ${addon.name}`)
          }
          itemRefund += addon.price * item.quantity
        }
      } catch {}
    }
    refundedAmount += itemRefund
  }
  return refundedAmount
}

// Deduct inventory for an order (products + addons + modifiers)
export function deductInventory(orderId: string) {
  const s = getSqlite()
  const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[]
  const consume = (ingredientId: string, qty: number, note: string) => {
    s.prepare('UPDATE ingredients SET stock_quantity = stock_quantity - ? WHERE id = ?').run(qty, ingredientId)
    s.prepare(`INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
      VALUES (?, ?, 'CONSUMPTION', ?, ?, ?, ?)`)
      .run(uuid(), ingredientId, -qty, orderId, note, now())
  }
  for (const item of items) {
    for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM recipes WHERE product_id = ?').all(item.product_id) as any[])) {
      consume(c.ingredientId, c.qty * item.quantity, `استهلاك منتج — طلب ${orderId}`)
    }
    if (item.selected_addons_json) {
      try {
        const addonIds = JSON.parse(item.selected_addons_json) as string[]
        for (const addonId of addonIds) {
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM addon_recipes WHERE addon_id = ?').all(addonId) as any[])) {
            consume(c.ingredientId, c.qty * item.quantity, `استهلاك إضافة — طلب ${orderId}`)
          }
        }
      } catch {}
    }
    if (item.selected_modifiers_json) {
      try {
        const mods = JSON.parse(item.selected_modifiers_json) as { modifierId: string }[]
        for (const mod of mods) {
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM modifier_recipes WHERE modifier_id = ?').all(mod.modifierId) as any[])) {
            consume(c.ingredientId, c.qty * item.quantity, `استهلاك تعديل — طلب ${orderId}`)
          }
        }
      } catch {}
    }
  }
}

// ─── Resilience analytics helpers ─────────────────────────────
// ABC class by cumulative revenue share (A ≤ 70%, B ≤ 90%, C rest)
export function abcClass(cumShare: number) {
  if (cumShare <= 0.7) return 'A'
  if (cumShare <= 0.9) return 'B'
  return 'C'
}

// XYZ class by coefficient of variation of daily demand (stable → volatile)
export function xyzClass(cv: number) {
  if (cv < 0.2) return 'X'
  if (cv < 0.4) return 'Y'
  return 'Z'
}

// Supplier spend concentration for the 70/30 strategy check
export function supplierConcentration(ingredientId: string, from?: string, to?: string) {
  const s = getSqlite()
  let where = 'WHERE ingredient_id = ?'
  const params: any[] = [ingredientId]
  if (from) { where += ' AND purchased_at >= ?'; params.push(from) }
  if (to) { where += ' AND purchased_at <= ?'; params.push(to + '￿') }
  const rows = s.prepare(
    `SELECT supplier, SUM(quantity) AS qty, SUM(unit_cost * quantity) AS spend
     FROM purchase_price_history ${where} GROUP BY supplier`
  ).all(...params) as any[]
  const totalQty = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
  const mapped = rows.map(r => ({
    supplier: r.supplier || 'غير محدد',
    qty: Number(r.qty) || 0,
    spend: r2(Number(r.spend) || 0),
    share: r2(totalQty > 0 ? (Number(r.qty) || 0) / totalQty : 0),
  })).sort((a, b) => b.share - a.share)
  return {
    rows: mapped,
    topSupplierPct: mapped.length ? mapped[0].share * 100 : 0,
    singleSupplierConcentration: mapped.length >= 1 && mapped[0].share > 0.7,
  }
}

// Hard delete: permanently remove a row plus the link rows that only exist to
// join it. Refuses when historical data still points at the row (order items,
// inventory ledgers, past orders) so reports can never be silently corrupted.
// Any table with a foreign key to this one that the caller did not list is
// discovered from PRAGMA foreign_key_list and treated as a refusal — an
// unlisted dependency fails safely instead of crashing the renderer.
export function hardDelete(
  table: string,
  id: string,
  checks: { countSql: string; label: string }[] = [],
  deletes: string[] = [],
): { ok: boolean; error?: string } {
  const sqlite = getSqlite()
  const exists = sqlite.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id)
  if (!exists) return { ok: false, error: 'العنصر غير موجود' }

  // Tables the caller already handles — as a history check or as join rows
  // to cascade. Parsed from the SQL so the discovery below can skip them.
  const handled = new Set<string>()
  for (const c of checks) {
    const m = c.countSql.match(/\bFROM\s+(\w+)/i)
    if (m) handled.add(m[1])
  }
  for (const d of deletes) {
    const m = d.match(/\bFROM\s+(\w+)/i)
    if (m) handled.add(m[1])
  }

  // Every other table with a FK to this one becomes an automatic refusal
  // check, so a new or forgotten dependency can never crash the delete.
  // PRAGMA foreign_key_list(T) lists the tables T points AT, so scan
  // every table and keep the FKs that land on this one.
  const extra: { countSql: string; params: string[]; label: string }[] = []
  const childColumns = new Map<string, string[]>()
  const allTables = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all() as { name: string }[]
  for (const t of allTables) {
    const fks = sqlite.prepare(`PRAGMA foreign_key_list(${t.name})`).all() as { table: string; from: string }[]
    for (const fk of fks) {
      if (fk.table !== table) continue
      if (handled.has(t.name)) continue
      if (!childColumns.has(t.name)) childColumns.set(t.name, [])
      childColumns.get(t.name)!.push(fk.from)
    }
  }
  for (const [child, columns] of childColumns) {
    extra.push({
      countSql: `SELECT COUNT(*) FROM ${child} WHERE ${columns.map(c => `${c} = ?`).join(' OR ')}`,
      params: columns.map(() => id),
      label: child,
    })
  }

  const remove = sqlite.transaction(() => {
    for (const c of [...checks, ...extra]) {
      const params = 'params' in c ? (c as { params: string[] }).params : [id]
      // COUNT(*) returns its value under the expression's own
      // column name, so read the first column instead of
      // assuming a "count" key that the query never sets.
      const row = sqlite.prepare(c.countSql).get(...params) as Record<string, unknown> | undefined
      const count = Number(Object.values(row ?? {})[0] ?? 0)
      if (count > 0) {
        return { ok: false as const, error: `لا يمكن الحذف النهائي — العنصر مرتبط بـ ${c.label}. عطّله بدل حذفه للحفاظ على سجل الطلبات.` }
      }
    }
    for (const d of deletes) sqlite.prepare(d).run(id)
    sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    return { ok: true as const }
  })
  try {
    return remove()
  } catch (e: any) {
    // Last resort: a constraint that slipped past the checks (e.g. a race)
    // becomes a refusal, never a raw crash in the renderer.
    if (e?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /foreign key constraint failed/i.test(String(e?.message || ''))) {
      return { ok: false, error: 'لا يمكن الحذف النهائي — العنصر مرتبط ببيانات أخرى. عطّله بدل حذفه.' }
    }
    throw e
  }
}
