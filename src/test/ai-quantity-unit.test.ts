// Reading the quantity the owner spoke.
//
// The bug: "قلل المخزون ٥ كيلو" reached `adjust_stock` as `delta: -5`, and the
// tool — which works in the material's own unit, grams for almost every stock
// row — took it as 5 grams. Five kilos became five grams, a 1000× error, and the
// confirmation card said "+5 g" only after the mistake was already made.
//
// The cause is structural: a write tool cannot state its unit in its schema,
// because the unit belongs to the material named in the same call. So the model
// sends the number it heard and the unit it heard, and the conversion happens
// in the tool where the material is known.
import { describe, expect, it } from 'vitest'
import { readUnit, toMaterialUnits, unitFits } from '../ai/tools/quantity-unit'

describe('readUnit', () => {
  it('reads the ways an owner says kilo', () => {
    for (const word of ['kg', 'كجم', 'كيلو', 'كيلوجرام', 'KG', ' كيلو ']) {
      expect(readUnit(word)).toBe('kg')
    }
  })

  it('reads grams', () => {
    for (const word of ['g', 'جم', 'جرام', 'غرام']) expect(readUnit(word)).toBe('g')
  })

  it('reads liquids', () => {
    expect(readUnit('لتر')).toBe('l')
    expect(readUnit('ml')).toBe('ml')
    expect(readUnit('مل')).toBe('ml')
  })

  it('treats no unit as the material\'s own unit', () => {
    expect(readUnit(undefined)).toBe('unit')
    expect(readUnit('')).toBe('unit')
    expect(readUnit('عبوة')).toBe('unit')
  })
})

describe('toMaterialUnits', () => {
  it('converts kilos to grams for a gram material — the bug', () => {
    // "قلل ٥ كيلو" on a material stocked in grams.
    expect(toMaterialUnits(5, 'kg', 'g')).toBe(5000)
    expect(toMaterialUnits(-5, 'kg', 'g')).toBe(-5000)
  })

  it('leaves grams alone for a gram material', () => {
    expect(toMaterialUnits(500, 'g', 'g')).toBe(500)
  })

  it('converts litres to millilitres for an ml material', () => {
    expect(toMaterialUnits(2, 'l', 'ml')).toBe(2000)
  })

  it('does not convert a bare count', () => {
    // "٣ عبوات" of something stocked in pieces.
    expect(toMaterialUnits(3, 'unit', 'pcs')).toBe(3)
    expect(toMaterialUnits(3, 'unit', 'قطعة')).toBe(3)
  })

  it('does not convert when the units already agree', () => {
    expect(toMaterialUnits(4, 'unit', 'g')).toBe(4)
    expect(toMaterialUnits(4, 'kg', 'kg')).toBe(4)
  })

  it('rounds to two decimals, like stock storage does', () => {
    // Each value is rounded on its own. Two that happen to be fractional in
    // binary still add to a float tail — that is the caller's business, not
    // this function's — so the assertion is about the value, not a sum.
    expect(toMaterialUnits(0.1, 'g', 'g')).toBe(0.1)
    expect(toMaterialUnits(1.005, 'kg', 'g')).toBe(1005)
    expect(toMaterialUnits(0.333, 'kg', 'g')).toBe(333)
  })

  it('returns zero for a non-number rather than NaN in a ledger row', () => {
    expect(toMaterialUnits(Number('x'), 'kg', 'g')).toBe(0)
  })
})

describe('unitFits', () => {
  it('refuses kilos for something counted in pieces', () => {
    // Worth stopping for: "٣ كيلو" of a product sold by the piece is a
    // misunderstanding, not a number to accept silently.
    expect(unitFits('kg', 'pcs')).toBe(false)
    expect(unitFits('kg', 'قطعة')).toBe(false)
  })

  it('accepts weight for weight and volume for volume', () => {
    expect(unitFits('kg', 'g')).toBe(true)
    expect(unitFits('g', 'g')).toBe(true)
    expect(unitFits('l', 'ml')).toBe(true)
    expect(unitFits('ml', 'ml')).toBe(true)
  })

  it('accepts no unit for anything', () => {
    expect(unitFits('unit', 'pcs')).toBe(true)
    expect(unitFits('unit', 'g')).toBe(true)
  })
})

describe('the reported case, end to end', () => {
  it('turns "reduce by five kilo" into five thousand grams', () => {
    // What the model says: delta=-5, unit=kg. What the material is: grams.
    const delta = toMaterialUnits(-5, readUnit('كيلو'), 'g')
    expect(delta).toBe(-5000)
    // And what would have happened before: treated as five grams.
    expect(delta).not.toBe(-5)
  })
})
