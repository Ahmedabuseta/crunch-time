// Reading a quantity the owner spoke, not the number the model typed.
//
// The bug this exists for: "قلل المخزون ٥ كيلو" arrived at `adjust_stock` as
// `delta: -5`, and the tool — which works in the material's own unit, grams for
// almost every stock row — took 5 as **5 grams**. A five-kilo correction became
// five grams, and nothing in the schema said which one it meant.
//
// The cause is structural: a write tool cannot state its unit in the schema
// because the unit belongs to the material named in the same call, and only the
// tool body resolves that. So the model is asked for the unit it heard, and the
// conversion happens where the unit is known.

/** The units stock rows actually use, plus the words owners say for them. */
const GRAM = ['g', 'جم', 'جرام', 'جرامات', 'غرام', 'gram', 'grams']
const KILO = ['kg', 'كجم', 'كيلو', 'كيلوجرام', 'كيلو جرام', 'كيلوغرام', 'kilo', 'kilos']
const MILLILITRE = ['ml', 'مل', 'ملي', 'مليلتر', 'millilitre', 'milliliter']
const LITRE = ['l', 'لتر', 'liter', 'litre']

export type QuantityUnit = 'g' | 'kg' | 'ml' | 'l' | 'unit'

/**
 * The unit the owner said, as a canonical name. `unit` means "as the material
 * is stocked" — pieces, sachets, boxes — and needs no conversion.
 */
export function readUnit(raw: unknown): QuantityUnit {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return 'unit'
  if (KILO.includes(text)) return 'kg'
  if (GRAM.includes(text)) return 'g'
  if (MILLILITRE.includes(text)) return 'ml'
  if (LITRE.includes(text)) return 'l'
  return 'unit'
}

/** How many of a material's own units one of `said` is worth. */
function factor(said: QuantityUnit, material: string): number {
  const unit = String(material ?? '').trim().toLowerCase()
  const grams = unit === 'g' || unit === 'جم' || unit === 'جرام'
  const millilitres = unit === 'ml' || unit === 'مل'

  if (said === 'kg' && grams) return 1000
  if (said === 'g' && grams) return 1
  if (said === 'l' && millilitres) return 1000
  if (said === 'ml' && millilitres) return 1

  // A material stocked in kg while the owner spoke in grams (rare, but a `kg`
  // row exists in shops that buy by the sack).
  if (said === 'g' && unit === 'kg') return 0.001
  if (said === 'kg' && unit === 'kg') return 1

  // "unit" — pieces, sachets, boxes — or a mismatch. No conversion: the number
  // is already in the material's terms.
  return 1
}

/**
 * The quantity expressed in the material's own unit.
 *
 * `amount` is what the owner said ("5" for «٥ كيلو»), `said` is the unit they
 * said it in, and `material` is the stock row's unit. Returns the amount
 * unchanged when the two already agree, so the common path is untouched.
 */
export function toMaterialUnits(amount: number, said: QuantityUnit, material: string): number {
  const value = Number(amount)
  if (!Number.isFinite(value)) return 0
  const scaled = value * factor(said, material)
  // Two decimals: stock is stored that way, and 0.1 + 0.2 must not produce
  // 0.30000000000000004 in a ledger row.
  return Math.round(scaled * 100) / 100
}

/**
 * Whether a stated unit can be applied to a material at all.
 *
 * Buying "3 kilo" of something stocked in *pieces* is a misunderstanding worth
 * stopping for, not a number to silently accept.
 */
export function unitFits(said: QuantityUnit, material: string): boolean {
  if (said === 'unit') return true
  const unit = String(material ?? '').trim().toLowerCase()
  const grams = unit === 'g' || unit === 'جم' || unit === 'جرام'
  const millilitres = unit === 'ml' || unit === 'مل'
  if (said === 'kg' || said === 'g') return grams || unit === 'kg'
  if (said === 'l' || said === 'ml') return millilitres || unit === 'l'
  return true
}
