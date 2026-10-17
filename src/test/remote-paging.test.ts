// Paging, sorting and filtering on the list routes — driven over HTTP against
// the real Fastify server and a throwaway database.
//
// This is the only place those properties can be checked: "page 2 does not
// repeat page 1" and "the sort covers the whole set, not just the page" are
// statements about SQL, and no type can tell you either of them.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'remote-paging-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

// A port of its own: the other remote suites use 45217–45220, and two servers
// competing for one port fails the collection rather than the assertions.
const PORT = 45221
const { createBackend } = await import('../backend')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { applyRemoteServer, stopRemoteServer } = await import('../server')

type Backend = ReturnType<typeof createBackend>
let backend: Backend
let token = ''
let categoryId = ''
let productId = ''
let ingredientId = ''
let productPrice = 0

const base = `http://127.0.0.1:${PORT}`

const api = (pathname: string, init: RequestInit = {}) => {
  // Only declare a JSON content-type when there actually is a body — Fastify
  // rejects a bodyless request that claims to carry JSON.
  const hasBody = init.body !== undefined
  return fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })
}

const get = async (pathname: string) => (await api(pathname)).json()

/** Enough rows that a page boundary falls in the middle of the real data. */
const SEEDED = 30

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  backend = createBackend({
    print: async () => ({ ok: true }),
    listPrinters: async () => [{ name: 'Test Printer', isDefault: true }],
    dialogs: {
      showSaveDialog: async () => ({ canceled: true }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    },
    app: { getPath: () => tempDir, relaunch: () => {}, exit: () => {} },
  })

  const admin = getSqlite().prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as {
    id: string
  }
  backend.session.setUser({ id: admin.id, role: 'admin' })
  backend.shifts.openShift({ userId: admin.id, openingCash: 0 })

  const seedCategory = getSqlite().prepare('SELECT id FROM categories LIMIT 1').get() as { id: string }
  categoryId = seedCategory.id

  // Names and prices that make sorting obviously wrong if it only covered a
  // single page: name order is not price order.
  for (let i = 0; i < SEEDED; i++) {
    const n = String(i).padStart(2, '0')
    backend.catalog.createProduct({
      name: `صنف ${n}`,
      price: 100 - i,
      emoji: '🍔',
      description: '',
      categoryId,
    })
  }

  const seededIngredient = getSqlite()
    .prepare('SELECT id FROM ingredients WHERE active = 1 LIMIT 1')
    .get() as { id: string }
  ingredientId = seededIngredient.id

  const p = getSqlite()
    .prepare('SELECT id, price FROM products WHERE active = 1 ORDER BY name LIMIT 1')
    .get() as { id: string; price: number }
  productId = p.id
  productPrice = p.price

  // More orders than one page, too.
  for (let i = 0; i < 12; i++) {
    backend.orders.createOrder({
      orderType: 'takeaway',
      paymentType: 'cash',
      subtotal: productPrice,
      tax: 0,
      deliveryFee: 0,
      total: productPrice + i,
      items: [{ productId, quantity: 1, unitPrice: productPrice }],
    })
  }

  await backend.settings.setRemotePin('1234')
  backend.settings.setRemoteConfig({ enabled: true, port: PORT })
  const started = await applyRemoteServer(backend)
  expect(started.ok).toBe(true)

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  })
  token = (await login.json()).token
})

afterAll(async () => {
  await stopRemoteServer()
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('paging', () => {
  it('returns a page, the unpaged total, and how much is left', async () => {
    const page1 = await get('/products?page=1&pageSize=10')
    expect(page1.products).toHaveLength(10)
    expect(page1.page).toBe(1)
    expect(page1.pageSize).toBe(10)
    expect(page1.total).toBeGreaterThanOrEqual(SEEDED)
    expect(page1.hasMore).toBe(true)
  })

  it('returns different rows on the next page', async () => {
    const page1 = await get('/products?page=1&pageSize=10')
    const page2 = await get('/products?page=2&pageSize=10')
    const first = page1.products.map((p: any) => p.id)
    const second = page2.products.map((p: any) => p.id)

    expect(second).toHaveLength(10)
    // The tiebreaker matters here: without one, a shared sort value lets SQLite
    // order two queries differently and a row can appear on both pages.
    expect(second.filter((id: string) => first.includes(id))).toEqual([])
  })

  it('walks every row exactly once across the pages', async () => {
    const seen: string[] = []
    let page = 1
    for (;;) {
      const res = await get(`/products?page=${page}&pageSize=7`)
      seen.push(...res.products.map((p: any) => p.id))
      if (!res.hasMore) break
      page += 1
      if (page > 20) throw new Error('paging did not terminate')
    }
    const all = await get('/products?pageSize=200')
    expect(seen).toHaveLength(all.total)
    expect(new Set(seen).size).toBe(all.total)
    expect([...seen].sort()).toEqual(all.products.map((p: any) => p.id).sort())
  })

  it('stops offering more on the last page', async () => {
    const all = await get('/products?pageSize=200')
    const lastPage = Math.ceil(all.total / 10)
    const last = await get(`/products?page=${lastPage}&pageSize=10`)
    expect(last.hasMore).toBe(false)
  })

  it('clamps pageSize instead of trusting the client', async () => {
    const huge = await get('/products?pageSize=100000')
    expect(huge.pageSize).toBeLessThanOrEqual(200)
    const zero = await get('/products?pageSize=0')
    expect(zero.pageSize).toBeGreaterThanOrEqual(1)
    const negative = await get('/products?page=-5')
    expect(negative.page).toBe(1)
  })
})

describe('sorting', () => {
  it('sorts across the whole set, not just the page it returned', async () => {
    const page = await get('/products?sort=price&dir=desc&pageSize=5')
    const everything = await get('/products?sort=price&dir=desc&pageSize=200')

    expect(page.products.map((p: any) => p.price)).toEqual(
      everything.products.slice(0, 5).map((p: any) => p.price)
    )
    // And the top of the whole list is what page 1 shows.
    const prices = page.products.map((p: any) => p.price)
    expect(prices).toEqual([...prices].sort((a, b) => b - a))
  })

  it('honours ascending as well as descending', async () => {
    const asc = await get('/products?sort=price&dir=asc&pageSize=200')
    const prices = asc.products.map((p: any) => p.price)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })

  it('sorts by name by default', async () => {
    const res = await get('/products?pageSize=200')
    const names = res.products.map((p: any) => p.name)
    expect(names).toEqual([...names].sort())
  })

  it('falls back to the default for a sort key it does not know', async () => {
    // An unknown key must not error and must not reach SQL — an older app
    // version asking for a removed sort should still get a list back.
    const res = await api('/products?sort=price;DROP TABLE products')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.products.length).toBeGreaterThan(0)
    expect((await get('/products?pageSize=200')).total).toBe(body.total)
  })
})

describe('filtering', () => {
  it('narrows the rows and the total together', async () => {
    const filtered = await get('/products?search=صنف 0&pageSize=200')
    const all = await get('/products?pageSize=200')
    expect(filtered.total).toBeLessThan(all.total)
    expect(filtered.products.length).toBe(filtered.total)
    for (const p of filtered.products) expect(p.name).toContain('صنف 0')
  })

  it('pages a filtered list, not the unfiltered one', async () => {
    const page1 = await get('/products?search=صنف&pageSize=3&page=1')
    const page2 = await get('/products?search=صنف&pageSize=3&page=2')
    const first = page1.products.map((p: any) => p.id)
    expect(page2.products.map((p: any) => p.id).filter((id: string) => first.includes(id))).toEqual([])
    expect(page1.total).toBe(SEEDED)
  })

  it('filters ingredients by the low-stock flag', async () => {
    const low = await get('/ingredients?low=1&pageSize=200')
    for (const item of low.ingredients) {
      expect(item.stockQuantity).toBeLessThanOrEqual(item.minStock)
    }
    const all = await get('/ingredients?pageSize=200')
    expect(low.total).toBeLessThanOrEqual(all.total)
  })

  it('sorts ingredients by stock', async () => {
    const res = await get('/ingredients?sort=stock&dir=asc&pageSize=200')
    const stock = res.ingredients.map((i: any) => i.stockQuantity)
    expect(stock).toEqual([...stock].sort((a, b) => a - b))
  })
})

describe('orders', () => {
  it('orders by total across the whole set, not just the page', async () => {
    const all = await get('/orders?sort=total&dir=desc&pageSize=200')
    expect(all.orders.length).toBeGreaterThanOrEqual(12)
    expect(all.total).toBe(all.orders.length)
    const totals = all.orders.map((o: any) => o.total)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
  })

  it('pages in that same order', async () => {
    const everything = await get('/orders?sort=total&dir=desc&pageSize=200')
    const page1 = await get('/orders?sort=total&dir=desc&pageSize=5&page=1')
    const page2 = await get('/orders?sort=total&dir=desc&pageSize=5&page=2')

    expect(page1.products).toBeUndefined()
    expect(page1.orders).toHaveLength(5)
    // Page 1 is the top of the whole ordering, and page 2 continues it.
    expect(page1.orders.map((o: any) => o.id)).toEqual(
      everything.orders.slice(0, 5).map((o: any) => o.id)
    )
    expect(page2.orders.map((o: any) => o.id)).toEqual(
      everything.orders.slice(5, 10).map((o: any) => o.id)
    )
  })

  it('still hydrates each order’s items on a page', async () => {
    const res = await get('/orders?pageSize=3')
    expect(res.orders[0].items.length).toBeGreaterThan(0)
  })

  it('keeps the existing filters working alongside paging', async () => {
    const res = await get('/orders?status=COMPLETED&pageSize=200')
    for (const order of res.orders) expect(order.status).toBe('COMPLETED')
  })

  it('filters by driver, including the unassigned sentinel', async () => {
    // The board's driver tab. Every seeded order is takeaway, so all of them
    // are undelivered and NONE must match the lot — a sentinel that quietly
    // matched nothing would look like "no unassigned deliveries" instead.
    const all = await get('/orders?pageSize=200')
    expect(all.total).toBeGreaterThan(0)

    const unassigned = await get('/orders?deliveryProfileId=NONE&pageSize=200')
    expect(unassigned.total).toBe(all.total)

    // An unknown driver id is a real filter, and matches nothing.
    const nobody = await get('/orders?deliveryProfileId=no-such-driver&pageSize=200')
    expect(nobody.total).toBe(0)
  })
})

describe('single-item routes', () => {
  it('fetches an ingredient by id', async () => {
    const res = await get(`/ingredients/${ingredientId}`)
    expect(res.ingredient.id).toBe(ingredientId)
  })

  it('fetches a category by id, so a paged list cannot hide it', async () => {
    const res = await get(`/categories/${categoryId}`)
    expect(res.category.id).toBe(categoryId)
    expect((await api('/categories/nope')).status).toBe(404)
  })

  it('fetches a product by id', async () => {
    const res = await get(`/products/${productId}`)
    expect(res.product.id).toBe(productId)
  })

  it('404s for an ingredient that is not there', async () => {
    const res = await api('/ingredients/nope')
    expect(res.status).toBe(404)
  })

  it('fetches a user by id without ever leaking the pin hash', async () => {
    const admin = getSqlite().prepare("SELECT id FROM users LIMIT 1").get() as { id: string }
    const res = await get(`/users/${admin.id}`)
    expect(res.user.id).toBe(admin.id)
    expect(res.user).not.toHaveProperty('pinHash')
  })

  it('does not leak pin hashes through the user list either', async () => {
    const res = await get('/users?pageSize=200')
    for (const user of res.users) expect(user).not.toHaveProperty('pinHash')
  })
})

describe('recipes, end to end', () => {
  let recipeId = ''

  it('adds an ingredient line and reports its cost', async () => {
    const res = await api('/recipes', {
      method: 'POST',
      body: JSON.stringify({ productId, ingredientId, quantityPerUnit: 2 }),
    })
    expect(res.status).toBe(200)
    recipeId = (await res.json()).id
    expect(recipeId).toBeTruthy()

    const lines = await get(`/products/${productId}/recipes`)
    const line = lines.recipes.find((r: any) => r.id === recipeId)
    expect(line.ingredientId).toBe(ingredientId)
    expect(line.subRecipeId).toBeNull()
    expect(line.ingredientName).toBeTruthy()
    expect(line.lineCost).toBeCloseTo((line.costPerUnit ?? 0) * 2, 6)
  })

  it('edits the quantity in place', async () => {
    await api('/recipes', {
      method: 'POST',
      body: JSON.stringify({ id: recipeId, productId, ingredientId, subRecipeId: null, quantityPerUnit: 5 }),
    })
    const lines = await get(`/products/${productId}/recipes`)
    const line = lines.recipes.find((r: any) => r.id === recipeId)
    expect(line.quantityPerUnit).toBe(5)
  })

  it('removes the line', async () => {
    await api(`/recipes/${recipeId}`, { method: 'DELETE' })
    const lines = await get(`/products/${productId}/recipes`)
    expect(lines.recipes.find((r: any) => r.id === recipeId)).toBeUndefined()
  })
})
