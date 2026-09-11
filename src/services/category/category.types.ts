export interface Category {
  id: string
  name: string
  emoji: string
  color: string
  sortOrder: number
  active: boolean
}

export interface CreateCategoryInput {
  name: string
  emoji: string
  color: string
  sortOrder?: number
}

export interface UpdateCategoryInput {
  name?: string
  emoji?: string
  color?: string
  sortOrder?: number
}
