import type { Order, OrderStatus } from '@/store/orders'
import type { CartItem } from '@/store/cart'
import { products, addons } from './products'

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function makeItems(): CartItem[] {
  const count = randomInt(1, 4)
  const chosen = pickN(products, count)
  return chosen.map((p) => ({
    product: p,
    quantity: randomInt(1, 3),
    addons: Math.random() > 0.5 ? pickN(addons, randomInt(1, 2)) : [],
  }))
}

function calcTotal(items: CartItem[], isDelivery: boolean): number {
  const subtotal = items.reduce((sum, i) => {
    const addonTotal = i.addons.reduce((s, a) => s + a.price, 0)
    return sum + (i.product.price + addonTotal) * i.quantity
  }, 0)
  const tax = subtotal * 0.14
  const delivery = isDelivery ? 25 : 0
  return subtotal + tax + delivery
}

const addresses = [
  'شارع الجمهورية، المنصورة',
  'شارع الجيش، طنطا',
  'الكورنيش، الإسكندرية',
  'شارع جامعة الدول العربية، الجيزة',
  'شارع النيل، المحلة الكبرى',
  'شارع سعيد، زفتى',
]

const phones = [
  '01012345678',
  '01198765432',
  '01234567890',
  '01555123456',
  '01099887766',
]

const tables = ['1', '2', '3', '5', '7', '8', '12', '15']

const statuses: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed', 'completed', 'completed']

export function generateSeedOrders(): Order[] {
  const now = Date.now()
  const orders: Order[] = []

  for (let i = 0; i < 15; i++) {
    const isDelivery = Math.random() > 0.4
    const items = makeItems()
    const total = calcTotal(items, isDelivery)
    const hoursAgo = randomInt(0, 8)
    const minutesAgo = randomInt(0, 59)
    const createdAt = new Date(now - hoursAgo * 3600000 - minutesAgo * 60000)

    orders.push({
      id: `#${(100000 + i * 137 + randomInt(0, 99)).toString().slice(-6)}`,
      items,
      total,
      createdAt,
      status: pick(statuses),
      orderType: isDelivery ? 'delivery' : 'dine-in',
      tableNumber: isDelivery ? '' : pick(tables),
      deliveryAddress: isDelivery ? pick(addresses) : '',
      deliveryPhone: isDelivery ? pick(phones) : '',
    })
  }

  return orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}
