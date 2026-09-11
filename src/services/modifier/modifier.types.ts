export interface ModifierGroup {
  id: string
  name: string
  type: 'single-select' | 'multi-select'
  sortOrder: number
  active: boolean
}

export interface Modifier {
  id: string
  modifierGroupId: string
  name: string
  priceAdjustment: number
  sortOrder: number
  active: boolean
}

export interface ModifierGroupWithModifiers extends ModifierGroup {
  modifiers: Modifier[]
}

export interface CreateModifierGroupInput {
  name: string
  type: 'single-select' | 'multi-select'
  sortOrder?: number
}

export interface CreateModifierInput {
  modifierGroupId: string
  name: string
  priceAdjustment?: number
  sortOrder?: number
}

export interface UpdateModifierInput {
  name?: string
  priceAdjustment?: number
  sortOrder?: number
}
