export interface DeliveryZone {
  id: string
  name: string
  fee: number
  sortOrder: number
  active: boolean
}

export interface DeliveryProfile {
  id: string
  name: string
  phone: string | null
  active: boolean
}

export interface KitchenStation {
  id: string
  name: string
  printerName: string | null
  paperWidth: string
  sortOrder: number
  active: boolean
  categoryIds: string[]
}

export interface OsPrinter {
  name: string
  displayName: string
  isDefault: boolean
}
