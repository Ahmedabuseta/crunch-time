export interface Product {
  id: string
  name: string
  price: number
  category: string
  emoji: string
  description: string
}

export interface Category {
  id: string
  name: string
  emoji: string
  color: string
}

export interface Addon {
  id: string
  name: string
  price: number
  emoji: string
}

export type OrderType = 'delivery' | 'dine-in'

export const categories: Category[] = [
  { id: "burgers", name: "برجر", emoji: "🍔", color: "var(--cat-burgers)" },
  { id: "pizza", name: "بيتزا", emoji: "🍕", color: "var(--cat-pizza)" },
  { id: "chicken", name: "دجاج", emoji: "🍗", color: "var(--cat-chicken)" },
  { id: "sides", name: "أطباق جانبية", emoji: "🍟", color: "var(--cat-sides)" },
  { id: "drinks", name: "مشروبات", emoji: "🥤", color: "var(--cat-drinks)" },
  { id: "desserts", name: "حلويات", emoji: "🍦", color: "var(--cat-desserts)" },
]

export const addons: Addon[] = [
  { id: "addon-cheese", name: "جبنة إضافية", price: 5, emoji: "🧀" },
  { id: "addon-bacon", name: "بيكون", price: 10, emoji: "🥓" },
  { id: "addon-sauce", name: "صلصة خاصة", price: 3, emoji: "🫙" },
  { id: "addon-fries", name: "بطاطس زيادة", price: 8, emoji: "🍟" },
  { id: "addon-drink", name: "مشروب كبير", price: 7, emoji: "🥤" },
  { id: "addon-onion", name: "حلقات بصل", price: 8, emoji: "🧅" },
  { id: "addon-coleslaw", name: "كول سلو", price: 5, emoji: "🥗" },
  { id: "addon-pickle", name: "مخلل", price: 2, emoji: "🥒" },
]

export const products: Product[] = [
  // Burgers
  { id: "b1", name: "برجر كلاسيك", price: 85, category: "burgers", emoji: "🍔", description: "لحم، خس، طماطم" },
  { id: "b2", name: "برجر جبنة", price: 95, category: "burgers", emoji: "🧀", description: "جبنة مزدوجة، مخلل، بصل" },
  { id: "b3", name: "برجر بيكون", price: 110, category: "burgers", emoji: "🥓", description: "بيكون مقرمش، صوص باربكيو" },
  { id: "b4", name: "برجر فطر", price: 105, category: "burgers", emoji: "🍄", description: "جبنة سويسري، فطر" },
  // Pizza
  { id: "p1", name: "مارغريتا", price: 120, category: "pizza", emoji: "🍕", description: "طماطم، موزاريلا، ريحان" },
  { id: "p2", name: "بيبروني", price: 145, category: "pizza", emoji: "🌶️", description: "بيبروني مزدوج، موزاريلا" },
  { id: "p3", name: "دجاج باربكيو", price: 155, category: "pizza", emoji: "🍗", description: "صوص باربكيو، دجاج، بصل أحمر" },
  { id: "p4", name: "خضار", price: 130, category: "pizza", emoji: "🥬", description: "خضار مشكلة، زيتون، فيتا" },
  // Chicken
  { id: "c1", name: "ناجت دجاج (6)", price: 65, category: "chicken", emoji: "🍗", description: "ناجت ذهبي مقرمش" },
  { id: "c2", name: "أجنحة دجاج (8)", price: 105, category: "chicken", emoji: "🍗", description: "صوص بوفالو أو باربكيو" },
  { id: "c3", name: "ساندويتش دجاج", price: 90, category: "chicken", emoji: "🥪", description: "دجاج مقرمش، كول سلو، مخلل" },
  // Sides
  { id: "s1", name: "بطاطس مقلية", price: 35, category: "sides", emoji: "🍟", description: "بطاطس ذهبية مقرمشة" },
  { id: "s2", name: "حلقات بصل", price: 45, category: "sides", emoji: "🧅", description: "حلقات بصل مقرمشة" },
  { id: "s3", name: "أصابع موزاريلا", price: 55, category: "sides", emoji: "🧀", description: "مع صوص مارينارا" },
  { id: "s4", name: "كول سلو", price: 25, category: "sides", emoji: "🥗", description: "كول سلو كريمي" },
  // Drinks
  { id: "d1", name: "كولا", price: 20, category: "drinks", emoji: "🥤", description: "كولا باردة" },
  { id: "d2", name: "ليمونادة", price: 25, category: "drinks", emoji: "🍋", description: "ليمون طازج" },
  { id: "d3", name: "ميلك شيك", price: 50, category: "drinks", emoji: "🥛", description: "فانيليا، شوكولاتة، أو فراولة" },
  { id: "d4", name: "شاي مثلج", price: 20, category: "drinks", emoji: "🍵", description: "محلى أو بدون سكر" },
  // Desserts
  { id: "e1", name: "آيس كريم صنداي", price: 45, category: "desserts", emoji: "🍦", description: "3 سكوب، صوص شوكولاتة، كرز" },
  { id: "e2", name: "تفاح محشو", price: 35, category: "desserts", emoji: "🥧", description: "دافئ بالقرفة" },
  { id: "e3", name: "براوني", price: 30, category: "desserts", emoji: "🍫", description: "براوني شوكولاتة" },
]
