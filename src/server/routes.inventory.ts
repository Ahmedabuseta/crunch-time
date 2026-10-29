// Inventory routes: ingredients, recipes, sub-recipes, stock movements,
// alerts, savings and order deduction.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Backend } from '../backend'
import { mutate } from './route-helpers'
import { readListQuery, pageMeta, flag } from './list-query'

const hardOpt = (req: FastifyRequest) => {
  const q = (req.query || {}) as any
  return { hard: q.hard === '1' || q.hard === 'true' }
}

export function registerInventoryRoutes(app: FastifyInstance, backend: Backend) {
  // ─── Ingredients ────────────────────────────────────────────
  app.get('/ingredients', async (req) => {
    const query = readListQuery(req, {
      sortable: ['name', 'stock', 'cost'],
      defaultSort: 'name',
      defaultDir: 'asc',
    })
    const { items, total } = await backend.inventory.listIngredientsPaged({
      search: query.search || undefined,
      lowOnly: flag(query, 'low'),
      limit: query.pageSize,
      offset: query.offset,
      sort: query.sort as any,
      dir: query.dir,
    })
    return { ingredients: items, ...pageMeta(query, total) }
  })
  app.get('/ingredients/:id', async (req, reply) => {
    const ingredient = await backend.inventory.getIngredientById((req.params as any).id)
    if (!ingredient) return reply.code(404).send({ ok: false, error: 'المادة غير موجودة' })
    return { ingredient }
  })
  app.post('/ingredients', async (req) =>
    mutate(req, { action: 'ingredient.create', entity: 'ingredient' }, () => backend.inventory.createIngredient(req.body)))
  app.put('/ingredients/:id', async (req) =>
    mutate(req, { action: 'ingredient.update', entity: 'ingredient', entityId: (req.params as any).id }, () =>
      backend.inventory.updateIngredient((req.params as any).id, req.body)))
  app.delete('/ingredients/:id', async (req) =>
    mutate(req, { action: 'ingredient.delete', entity: 'ingredient', entityId: (req.params as any).id }, () =>
      backend.inventory.deleteIngredient((req.params as any).id, hardOpt(req))))
  app.get('/inventory/alerts', async () => ({ alerts: await backend.inventory.getAlerts() }))
  app.get('/inventory/savings', async () => ({ savings: await backend.inventory.getPurchaseSavings() }))

  // ─── Product recipes ────────────────────────────────────────
  app.get('/products/:id/recipes', async (req) => ({ recipes: await backend.inventory.listRecipes((req.params as any).id) }))
  app.post('/recipes', async (req) =>
    mutate(req, { action: 'recipe.upsert', entity: 'recipe' }, () => backend.inventory.upsertRecipe(req.body)))
  app.delete('/recipes/:id', async (req) =>
    mutate(req, { action: 'recipe.delete', entity: 'recipe', entityId: (req.params as any).id }, () =>
      backend.inventory.deleteRecipe((req.params as any).id)))

  // ─── Sub-recipes ────────────────────────────────────────────
  app.get('/sub-recipes', async () => ({ subRecipes: await backend.inventory.listSubRecipes() }))
  app.post('/sub-recipes', async (req) =>
    mutate(req, { action: 'subRecipe.upsert', entity: 'sub_recipe' }, () => backend.inventory.upsertSubRecipe(req.body as any)))
  app.delete('/sub-recipes/:id', async (req) =>
    mutate(req, { action: 'subRecipe.delete', entity: 'sub_recipe', entityId: (req.params as any).id }, () =>
      backend.inventory.deleteSubRecipe((req.params as any).id, hardOpt(req))))
  app.get('/sub-recipes/:id/ingredients', async (req) =>
    ({ ingredients: await backend.inventory.listSubRecipeIngredients((req.params as any).id) }))
  app.post('/sub-recipes/ingredients', async (req) =>
    mutate(req, { action: 'subRecipe.ingredient.upsert', entity: 'sub_recipe_ingredient' }, () =>
      backend.inventory.upsertSubRecipeIngredient(req.body as any)))
  app.delete('/sub-recipes/ingredients/:id', async (req) =>
    mutate(req, { action: 'subRecipe.ingredient.delete', entity: 'sub_recipe_ingredient', entityId: (req.params as any).id }, () =>
      backend.inventory.deleteSubRecipeIngredient((req.params as any).id)))

  // ─── Stock movements ────────────────────────────────────────
  app.post('/ingredients/:id/restock', async (req) => {
    const body = (req.body || {}) as any
    return mutate(req, { action: 'inventory.restock', entity: 'ingredient', entityId: (req.params as any).id }, () =>
      backend.inventory.restock((req.params as any).id, body.qty, body.note, {
        unitCost: body.unitCost, packagePrice: body.packagePrice, supplier: body.supplier,
      }))
  })
  app.get('/ingredients/:id/transactions', async (req) => {
    const q = (req.query || {}) as any
    return {
      ledger: await backend.inventory.listTransactions((req.params as any).id, {
        type: q.type ? String(q.type) : undefined,
        from: q.from ? String(q.from) : undefined,
        to: q.to ? String(q.to) : undefined,
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      }),
    }
  })
  app.post('/ingredients/:id/waste', async (req) => {
    const body = (req.body || {}) as any
    return mutate(req, { action: 'inventory.waste', entity: 'ingredient', entityId: (req.params as any).id }, () =>
      backend.inventory.recordWaste((req.params as any).id, body.qty, body.note))
  })
  app.post('/ingredients/:id/adjust', async (req) => {
    const body = (req.body || {}) as any
    return mutate(req, { action: 'inventory.adjust', entity: 'ingredient', entityId: (req.params as any).id }, () =>
      backend.inventory.adjust((req.params as any).id, body.delta, body.note))
  })

  // Deduction normally happens inside POST /orders; this is the manual replay
  // the desktop exposes as inventory:deductForOrder.
  app.post('/ingredients/:id/exchange', async (req) => {
    const body = (req.body || {}) as any
    return mutate(req, { action: 'inventory.exchange', entity: 'ingredient', entityId: (req.params as any).id }, () =>
      backend.inventory.exchange({ ...body, fromIngredientId: (req.params as any).id }))
  })
  app.post('/orders/:id/deduct-inventory', async (req) =>
    mutate(req, { action: 'inventory.deduct', entity: 'order', entityId: (req.params as any).id }, () =>
      backend.inventory.deductForOrder((req.params as any).id)))
}
