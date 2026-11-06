// Admin catalogue routes: categories, products, addons and modifier groups —
// the same capabilities the desktop exposes over IPC, now over HTTP.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Backend } from '../backend'
import { mutate } from './route-helpers'
import { readListQuery, pageMeta, filter } from './list-query'

const hardOpt = (req: FastifyRequest) => {
  const q = (req.query || {}) as any
  return { hard: q.hard === '1' || q.hard === 'true' }
}

const includeInactive = (req: FastifyRequest) => {
  const q = (req.query || {}) as any
  return q.includeInactive === '1' || q.includeInactive === 'true'
}

export function registerCatalogRoutes(app: FastifyInstance, backend: Backend) {
  // ─── Categories ─────────────────────────────────────────────
  app.get('/categories', async (req) => {
    const query = readListQuery(req, {
      sortable: ['sortOrder', 'name'],
      defaultSort: 'sortOrder',
      defaultDir: 'asc',
    })
    const { items, total } = await backend.catalog.listCategoriesPaged({
      search: query.search || undefined,
      limit: query.pageSize,
      offset: query.offset,
      sort: query.sort as any,
      dir: query.dir,
    })
    return { categories: items, ...pageMeta(query, total) }
  })
  app.get('/categories/:id', async (req, reply) => {
    const category = await backend.catalog.getCategoryById((req.params as any).id)
    if (!category) return reply.code(404).send({ ok: false, error: 'القسم غير موجود' })
    return { category }
  })
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
  app.get('/products', async (req) => {
    const query = readListQuery(req, {
      sortable: ['name', 'price', 'cost'],
      defaultSort: 'name',
      defaultDir: 'asc',
    })
    const active = filter(query, 'active')
    const { items, total } = await backend.catalog.listProductsPaged({
      categoryId: filter(query, 'categoryId'),
      active: active === '1' ? true : active === '0' ? false : undefined,
      includeInactive: includeInactive(req),
      search: query.search || undefined,
      limit: query.pageSize,
      offset: query.offset,
      sort: query.sort as any,
      dir: query.dir,
    })
    return { products: items, ...pageMeta(query, total) }
  })
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
  app.post('/products/:id/duplicate', async (req) =>
    mutate(req, { action: 'product.duplicate', entity: 'product', entityId: (req.params as any).id }, () =>
      backend.catalog.duplicateProduct((req.params as any).id)))

  // ─── Addons ─────────────────────────────────────────────────
  app.get('/addons', async (req) => ({ addons: await backend.addons.listAddons(includeInactive(req)) }))
  app.post('/addons', async (req) =>
    mutate(req, { action: 'addon.create', entity: 'addon' }, () => backend.addons.createAddon(req.body)))
  app.put('/addons/:id', async (req) =>
    mutate(req, { action: 'addon.update', entity: 'addon', entityId: (req.params as any).id }, () =>
      backend.addons.updateAddon((req.params as any).id, req.body)))
  app.delete('/addons/:id', async (req) =>
    mutate(req, { action: 'addon.delete', entity: 'addon', entityId: (req.params as any).id }, () =>
      backend.addons.deleteAddon((req.params as any).id, hardOpt(req))))
  app.get('/addons/:id', async (req, reply) => {
    const addon = await backend.addons.getAddonById((req.params as any).id)
    if (!addon) return reply.code(404).send({ ok: false, error: 'الإضافة غير موجودة' })
    return { addon }
  })
  app.get('/products/:id/addons', async (req) => ({ addons: await backend.addons.listAddonsByProduct((req.params as any).id) }))
  app.put('/products/:id/addons', async (req) =>
    mutate(req, { action: 'product.addons.set', entity: 'product', entityId: (req.params as any).id }, () =>
      backend.addons.setAddonLinks((req.params as any).id, (req.body as any)?.addonIds || [])))
  app.get('/addons/:id/products', async (req) => ({ products: await backend.addons.listAddonProducts((req.params as any).id) }))
  app.put('/addons/:id/products', async (req) =>
    mutate(req, { action: 'addon.products.set', entity: 'addon', entityId: (req.params as any).id }, () =>
      backend.addons.setAddonProducts((req.params as any).id, (req.body as any)?.productIds || [])))
  app.get('/addons/:id/recipes', async (req) => ({ recipes: await backend.addons.listAddonRecipes((req.params as any).id) }))
  app.post('/addons/recipes', async (req) =>
    mutate(req, { action: 'addon.recipe.upsert', entity: 'addon_recipe' }, () => backend.addons.upsertAddonRecipe(req.body)))
  app.delete('/addons/recipes/:id', async (req) =>
    mutate(req, { action: 'addon.recipe.delete', entity: 'addon_recipe', entityId: (req.params as any).id }, () =>
      backend.addons.deleteAddonRecipe((req.params as any).id)))

  // ─── Modifiers ──────────────────────────────────────────────
  app.get('/modifier-groups', async (req) => ({ groups: await backend.modifiers.listModifierGroups(includeInactive(req)) }))
  app.get('/modifier-groups/:id', async (req, reply) => {
    const group = await backend.modifiers.getModifierGroupById((req.params as any).id)
    if (!group) return reply.code(404).send({ ok: false, error: 'مجموعة الخيارات غير موجودة' })
    return { group }
  })
  app.post('/modifier-groups', async (req) =>
    mutate(req, { action: 'modifierGroup.create', entity: 'modifier_group' }, () => backend.modifiers.createModifierGroup(req.body)))
  app.put('/modifier-groups/:id', async (req) =>
    mutate(req, { action: 'modifierGroup.update', entity: 'modifier_group', entityId: (req.params as any).id }, () =>
      backend.modifiers.updateModifierGroup((req.params as any).id, req.body)))
  app.delete('/modifier-groups/:id', async (req) =>
    mutate(req, { action: 'modifierGroup.delete', entity: 'modifier_group', entityId: (req.params as any).id }, () =>
      backend.modifiers.deleteModifierGroup((req.params as any).id, hardOpt(req))))
  app.post('/modifier-groups/reorder', async (req) =>
    mutate(req, { action: 'modifierGroup.reorder', entity: 'modifier_group', afterFrom: () => ({ ids: (req.body as any)?.ids }) }, () =>
      backend.modifiers.reorderModifierGroups((req.body as any)?.ids || [])))
  app.get('/modifier-groups/:id/modifiers', async (req) => ({
    modifiers: await backend.modifiers.listModifiersByGroup((req.params as any).id, includeInactive(req)),
  }))
  app.get('/modifier-groups/:id/products', async (req) => ({
    products: await backend.modifiers.listModifierGroupProducts((req.params as any).id),
  }))
  app.put('/modifier-groups/:id/products', async (req) =>
    mutate(req, { action: 'modifierGroup.products.set', entity: 'modifier_group', entityId: (req.params as any).id }, () =>
      backend.modifiers.setModifierGroupProducts((req.params as any).id, (req.body as any)?.productIds || [])))
  app.get('/modifiers/:id', async (req, reply) => {
    const modifier = await backend.modifiers.getModifierById((req.params as any).id)
    if (!modifier) return reply.code(404).send({ ok: false, error: 'الخيار غير موجود' })
    return { modifier }
  })
  app.post('/modifiers', async (req) =>
    mutate(req, { action: 'modifier.create', entity: 'modifier' }, () => backend.modifiers.createModifier(req.body)))
  app.put('/modifiers/:id', async (req) =>
    mutate(req, { action: 'modifier.update', entity: 'modifier', entityId: (req.params as any).id }, () =>
      backend.modifiers.updateModifier((req.params as any).id, req.body)))
  app.delete('/modifiers/:id', async (req) =>
    mutate(req, { action: 'modifier.delete', entity: 'modifier', entityId: (req.params as any).id }, () =>
      backend.modifiers.deleteModifier((req.params as any).id, hardOpt(req))))
  app.post('/modifiers/reorder', async (req) =>
    mutate(req, { action: 'modifier.reorder', entity: 'modifier', afterFrom: () => ({ ids: (req.body as any)?.ids }) }, () =>
      backend.modifiers.reorderModifiers((req.body as any)?.ids || [])))
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
