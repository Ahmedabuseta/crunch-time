import { describe, expect, it } from 'vitest'
import { selectToolNames } from '../ai/tools/select'
import { ALL_TOOLS, TOOLS } from '../ai/tools'

const has = (names: string[], name: string) => names.includes(name)

describe('tool router', () => {
  it('always exposes the small core', () => {
    const names = selectToolNames('إزيك')
    for (const core of ['query_metrics', 'product_price', 'product_list', 'inventory_status']) {
      expect(has(names, core)).toBe(true)
    }
    expect(names.length).toBeLessThan(10)
  })

  it('routes a price-range listing to product_list with no writes', () => {
    const names = selectToolNames('المنتجات اللي سعرها أقل من 100 جنيه وتكلفتها كام')
    expect(has(names, 'product_list')).toBe(true)
    expect(has(names, 'query_metrics')).toBe(true)
    expect(names.some((name) => TOOLS.get(name)?.write)).toBe(false)
    expect(names.length).toBeLessThan(10)
  })

  it('routes a price question to product_price without any write tools', () => {
    const names = selectToolNames('السجق بكام')
    expect(has(names, 'product_price')).toBe(true)
    expect(has(names, 'product_details')).toBe(true)
    expect(names.some((name) => TOOLS.get(name)?.write)).toBe(false)
  })

  it('routes an explicit product action to product writes', () => {
    const names = selectToolNames('ضيف منتج جديد اسمه كريب')
    expect(has(names, 'create_product')).toBe(true)
    expect(has(names, 'update_product')).toBe(true)
    expect(has(names, 'category_list')).toBe(true)
  })

  it('routes a recipe action to recipe writes', () => {
    const names = selectToolNames('ضيف مكون للوصفة')
    expect(has(names, 'add_recipe_line')).toBe(true)
    expect(has(names, 'recipe_costs')).toBe(true)
    expect(has(names, 'ingredient_list')).toBe(true)
  })

  it('routes alias learning to the alias tools', () => {
    const names = selectToolNames('سحيق يعني سجق')
    expect(has(names, 'learn_alias')).toBe(true)
    expect(has(names, 'list_aliases')).toBe(true)
  })

  it('routes an open-ended why question to metrics', () => {
    const names = selectToolNames('ليه الربح قل الشهر ده؟')
    expect(has(names, 'query_metrics')).toBe(true)
    expect(has(names, 'profit_summary')).toBe(true)
    expect(names.some((name) => TOOLS.get(name)?.write)).toBe(false)
  })
  it('never returns a name outside the registry', () => {
    for (const message of ['السجق بكام', 'ضيف منتج', 'ضيف وصفة', 'سحيق يعني سجق', 'ليه الربح قل']) {
      for (const name of selectToolNames(message)) {
        expect(TOOLS.has(name)).toBe(true)
        expect(ALL_TOOLS.some((tool) => tool.name === name)).toBe(true)
      }
    }
  })
})
