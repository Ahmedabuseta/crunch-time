import { create } from 'zustand'
import type { DeliveryZone, KitchenStation, OsPrinter } from './delivery.types'

interface DeliveryStore {
  zones: DeliveryZone[]
  loading: boolean
  fetch: (includeInactive?: boolean) => Promise<void>
  create: (data: { name: string; fee: number }) => Promise<void>
  update: (id: string, data: Partial<{ name: string; fee: number; active: boolean }>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useDeliveryStore = create<DeliveryStore>((set) => ({
  zones: [],
  loading: false,

  fetch: async (includeInactive) => {
    set({ loading: true })
    const data = await window.api.deliveryZone.list(includeInactive)
    set({ zones: (data as DeliveryZone[]).sort((a, b) => a.sortOrder - b.sortOrder), loading: false })
  },

  create: async (data) => {
    await window.api.deliveryZone.create(data)
    await useDeliveryStore.getState().fetch(true)
  },

  update: async (id, data) => {
    await window.api.deliveryZone.update(id, data)
    await useDeliveryStore.getState().fetch(true)
  },

  remove: async (id) => {
    await window.api.deliveryZone.delete(id)
    await useDeliveryStore.getState().fetch(true)
  },
}))

interface StationStore {
  stations: KitchenStation[]
  osPrinters: OsPrinter[]
  loading: boolean
  fetch: (includeInactive?: boolean) => Promise<void>
  fetchPrinters: () => Promise<void>
  create: (data: { name: string; printerName?: string; paperWidth?: string; categoryIds?: string[] }) => Promise<void>
  update: (id: string, data: Partial<{ name: string; printerName: string | null; paperWidth: string; active: boolean; categoryIds: string[] }>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useStationStore = create<StationStore>((set) => ({
  stations: [],
  osPrinters: [],
  loading: false,

  fetch: async (includeInactive) => {
    set({ loading: true })
    const data = await window.api.station.list(includeInactive)
    set({ stations: data as KitchenStation[], loading: false })
  },

  fetchPrinters: async () => {
    try {
      const data = await window.api.printer.list()
      set({ osPrinters: data as OsPrinter[] })
    } catch {
      set({ osPrinters: [] })
    }
  },

  create: async (data) => {
    await window.api.station.create(data)
    await useStationStore.getState().fetch(true)
  },

  update: async (id, data) => {
    await window.api.station.update(id, data)
    await useStationStore.getState().fetch(true)
  },

  remove: async (id) => {
    await window.api.station.delete(id)
    await useStationStore.getState().fetch(true)
  },
}))
