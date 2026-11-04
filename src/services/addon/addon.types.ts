export interface Addon {
  id: string
  name: string
  price: number
  emoji: string
  active: boolean
  supportsRollback?: boolean
  /** Products currently offering this addon. */
  productCount?: number
}

export interface CreateAddonInput {
  name: string
  price: number
  emoji: string
  active?: boolean
}

export interface UpdateAddonInput {
  name?: string
  price?: number
  emoji?: string
  active?: boolean
  supportsRollback?: boolean
}
