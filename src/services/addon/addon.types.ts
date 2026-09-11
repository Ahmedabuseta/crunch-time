export interface Addon {
  id: string
  name: string
  price: number
  emoji: string
  active: boolean
}

export interface CreateAddonInput {
  name: string
  price: number
  emoji: string
}

export interface UpdateAddonInput {
  name?: string
  price?: number
  emoji?: string
}
