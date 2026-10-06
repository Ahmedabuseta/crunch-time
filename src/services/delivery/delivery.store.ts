import { create } from 'zustand'
import type { DeliveryZone, DeliveryProfile, KitchenStation, OsPrinter } from './delivery.types'

interface DeliveryStore {
  zones: DeliveryZone[]
  loading: boolean
  fetch: (includeInactive?: boolean) => Promise<void>
  create: (data: { name: string; fee: number }) => Promise<void>
  update: (id: string, data: Partial<{ name: string; fee: number; active: boolean }>) => Promise<void>
  remove: (id: string, opts?: { hard?: boolean }) => Promise<void>
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

  remove: async (id, opts) => {
    const result = await window.api.deliveryZone.delete(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل تعطيل منطقة التوصيل')
    await useDeliveryStore.getState().fetch(true)
  },
}))

interface ProfileStore {
  profiles: DeliveryProfile[]
  loading: boolean
  fetch: (includeInactive?: boolean) => Promise<void>
  create: (data: { name: string; phone?: string }) => Promise<void>
  update: (id: string, data: Partial<{ name: string; phone: string; active: boolean }>) => Promise<void>
  remove: (id: string, opts?: { hard?: boolean }) => Promise<void>
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profiles: [],
  loading: false,

  fetch: async (includeInactive) => {
    set({ loading: true })
    const data = await window.api.deliveryProfile.list(includeInactive)
    set({ profiles: data as DeliveryProfile[], loading: false })
  },

  create: async (data) => {
    await window.api.deliveryProfile.create(data)
    await useProfileStore.getState().fetch(true)
  },

  update: async (id, data) => {
    await window.api.deliveryProfile.update(id, data)
    await useProfileStore.getState().fetch(true)
  },

  remove: async (id, opts) => {
    const result = await window.api.deliveryProfile.delete(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل تعطيل مندوب التوصيل')
    await useProfileStore.getState().fetch(true)
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
  remove: (id: string, opts?: { hard?: boolean }) => Promise<void>
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

  remove: async (id, opts) => {
    const result = await window.api.station.delete(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل تعطيل محطة المطبخ')
    await useStationStore.getState().fetch(true)
  },
}))
