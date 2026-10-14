// Admin catalogue routes: categories, products, addons and modifier groups —
// the same capabilities the desktop exposes over IPC, now over HTTP.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Backend } from '../backend'
import { mutate } from './route-helpers'

const hardOpt = (req: FastifyRequest) => {
  const q = (req.query || {}) as any
  return { hard: q.hard === '1' || q.hard === 'true' }
}

export function registerCatalogRoutes(app: FastifyInstance, backend: Backend) {
  // ─── Categories ─────────────────────────────────────────────
  app.get('/categories', async () => ({ categories: await backend.catalog.listCategories() }))
  app.post('/categories', async (req) =>
    mutate(req, { action: 'category.create', entity: 'category' }, () => backend.catalog.createCategory(req.body)))
  app.put('/categories/:id', async (req) =>
    mutate(req, { action: 'category.update', entity: 'category', entityId: (req.params as any).id }, () =>
      backend.catalog.updateCategory((req.params as any).id, req.body)))
  app.delete('/categories/:id', async (req) =>
    mutate(req, { action: 'category.delete', entity: 'category', entityId: (req.params as any).id }, () =>
      backend.catalog.deleteCategory((req.params as any).id, hardOpt(req))))
  app.post('/categories/reorder', async (req) =>
    mutate(req, { action: 'category.reorder', entity: 'category', afterFrom: () => ({ ids: (req.body as any)?.ids }) }, () =>
      backend.catalog.reorderCategories((req.body as any)?.ids || [])))

  // ─── Products ───────────────────────────────────────────────
  app.get('/products', async (req) => ({
    products: await backend.catalog.listProducts((req.query as any)?.categoryId),
  }))
  app.get('/products/:id', async (req, reply) => {
    const product = await backend.catalog.getProductById((req.params as any).id)
    if (!product) return reply.code(404).send({ ok: false, error: 'المنتج غير موجود' })
    return { product }
  })
  app.post('/products', async (req) =>
    mutate(req, { action: 'product.create', entity: 'product' }, () => backend.catalog.createProduct(req.body)))
  app.put('/products/:id', async (req) => {
    const id = (req.params as any).id
    const before = await backend.catalog.getProductById(id)
    return mutate(req, { action: 'product.update', entity: 'product', entityId: id, before }, () =>
      backend.catalog.updateProduct(id, req.body))
  })
  app.delete('/products/:id', async (req) =>
    mutate(req, { action: 'product.delete', entity: 'product', entityId: (req.params as any).id }, () =>
      backend.catalog.deleteProduct((req.params as any).id, hardOpt(req))))

  // ─── Addons ─────────────────────────────────────────────────
  app.get('/addons', async () => ({ addons: await backend.addons.listAddons() }))
  app.post('/addons', async (req) =>
    mutate(req, { action: 'addon.create', entity: 'addon' }, () => backend.addons.createAddon(req.body)))
  app.put('/addons/:id', async (req) =>
    mutate(req, { action: 'addon.update', entity: 'addon', entityId: (req.params as any).id }, () =>
      backend.addons.updateAddon((req.params as any).id, req.body)))
  app.delete('/addons/:id', async (req) =>
    mutate(req, { action: 'addon.delete', entity: 'addon', entityId: (req.params as any).id }, () =>
      backend.addons.deleteAddon((req.params as any).id, hardOpt(req))))
  app.get('/products/:id/addons', async (req) => ({ addons: await backend.addons.listAddonsByProduct((req.params as any).id) }))
  app.put('/products/:id/addons', async (req) =>
    mutate(req, { action: 'product.addons.set', entity: 'product', entityId: (req.params as any).id }, () =>
      backend.addons.setAddonLinks((req.params as any).id, (req.body as any)?.addonIds || [])))
  app.get('/addons/:id/recipes', async (req) => ({ recipes: await backend.addons.listAddonRecipes((req.params as any).id) }))
  app.post('/addons/recipes', async (req) =>
    mutate(req, { action: 'addon.recipe.upsert', entity: 'addon_recipe' }, () => backend.addons.upsertAddonRecipe(req.body)))
  app.delete('/addons/recipes/:id', async (req) =>
    mutate(req, { action: 'addon.recipe.delete', entity: 'addon_recipe', entityId: (req.params as any).id }, () =>
      backend.addons.deleteAddonRecipe((req.params as any).id)))

  // ─── Modifiers ──────────────────────────────────────────────
  app.get('/modifier-groups', async () => ({ groups: await backend.modifiers.listModifierGroups() }))
  app.post('/modifier-groups', async (req) =>
    mutate(req, { action: 'modifierGroup.create', entity: 'modifier_group' }, () => backend.modifiers.createModifierGroup(req.body)))
  app.put('/modifier-groups/:id', async (req) =>
    mutate(req, { action: 'modifierGroup.update', entity: 'modifier_group', entityId: (req.params as any).id }, () =>
      backend.modifiers.updateModifierGroup((req.params as any).id, req.body)))
  app.delete('/modifier-groups/:id', async (req) =>
    mutate(req, { action: 'modifierGroup.delete', entity: 'modifier_group', entityId: (req.params as any).id }, () =>
      backend.modifiers.deleteModifierGroup((req.params as any).id, hardOpt(req))))
  app.get('/modifier-groups/:id/modifiers', async (req) => ({ modifiers: await backend.modifiers.listModifiersByGroup((req.params as any).id) }))
  app.post('/modifiers', async (req) =>
    mutate(req, { action: 'modifier.create', entity: 'modifier' }, () => backend.modifiers.createModifier(req.body)))
  app.put('/modifiers/:id', async (req) =>
    mutate(req, { action: 'modifier.update', entity: 'modifier', entityId: (req.params as any).id }, () =>
      backend.modifiers.updateModifier((req.params as any).id, req.body)))
  app.delete('/modifiers/:id', async (req) =>
    mutate(req, { action: 'modifier.delete', entity: 'modifier', entityId: (req.params as any).id }, () =>
      backend.modifiers.deleteModifier((req.params as any).id, hardOpt(req))))
  app.get('/products/:id/modifiers', async (req) => ({ groups: await backend.modifiers.listModifiersByProduct((req.params as any).id) }))
  app.put('/products/:id/modifiers', async (req) =>
    mutate(req, { action: 'product.modifiers.set', entity: 'product', entityId: (req.params as any).id }, () =>
      backend.modifiers.setModifierLinks((req.params as any).id, (req.body as any)?.groupIds || [])))
  app.get('/modifiers/:id/recipes', async (req) => ({ recipes: await backend.modifiers.listModifierRecipes((req.params as any).id) }))
  app.post('/modifiers/recipes', async (req) =>
    mutate(req, { action: 'modifier.recipe.upsert', entity: 'modifier_recipe' }, () => backend.modifiers.upsertModifierRecipe(req.body)))
  app.delete('/modifiers/recipes/:id', async (req) =>
    mutate(req, { action: 'modifier.recipe.delete', entity: 'modifier_recipe', entityId: (req.params as any).id }, () =>
      backend.modifiers.deleteModifierRecipe((req.params as any).id)))
}
