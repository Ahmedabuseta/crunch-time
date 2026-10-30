// The circuit breaker in front of every paid model call.
//
// A phone message that is a greeting, a stray punctuation mark or clearly from
// another domain is answered from the saved replies and never reaches a
// provider. Everything else is allowed through — the guard never guesses that
// a message is off-topic just because it did not recognise it.
import { isGreeting, normalizeArabic, words } from './arabic'

export type TopicVerdict = { decision: 'allow' | 'block'; reason: string }

/**
 * Words that name something in this app. Matched after normalization, so the
 * entries below can be written the way the owner writes them.
 */
export const APP_TERMS: string[] = [
  // ─── Sales and orders ─────────────────────────────────────
  'مبيعات', 'مبيعاتي', 'بعت', 'بعنا', 'باعت', 'بيع', 'بيعة', 'بيوع',
  'إيراد', 'إيرادات', 'دخل', 'دخلنا', 'إجمالي', 'صافي', 'ضريبة',
  'طلب', 'طلبات', 'طلبي', 'فاتورة', 'فواتير', 'أوردر', 'أوردرات',
  'كاشير', 'وردية', 'ورديات', 'شيفت', 'شيفتات', 'درج', 'دروج', 'كاش', 'نقدي',
  'استرجاع', 'مرتجع', 'إلغاء', 'ملغي', 'خصم', 'خصومات', 'كوبون', 'كوبونات',
  'دليفري', 'دلفري', 'توصيل', 'طاولة', 'طاولات', 'تيك اواي', 'تيكاوي', 'سفري', 'براني',

  // ─── Products and menu ────────────────────────────────────
  'صنف', 'أصناف', 'منيو', 'قائمة', 'منتج', 'منتجات', 'برجر',
  'سعر', 'أسعار', 'سعره', 'سعر البيع', 'بكام', 'بكم', 'كام',
  'تكلفة', 'ربح', 'أرباح',
  'هامش', 'هامش الربح', 'مارجن', 'إضافة', 'إضافات', 'مكونات', 'مكون',
  'وجبة', 'وجبات', 'ساندوتش', 'مشروب', 'مشروبات', 'حجم', 'أحجام', 'كومبو',
  'عروض', 'برومو',

  // ─── Inventory and procurement ────────────────────────────
  'مخزون', 'ستوك', 'مخزن', 'مادة', 'مواد', 'خامة', 'خامات',
  'مورد', 'موردين', 'شراء', 'مشتريات', 'بضاعة', 'كرتونة', 'كراتين',
  'عبوة', 'عبوات', 'كيلو', 'جرام', 'تالف', 'هدر', 'جرد',
  'حد أدنى', 'طلب شراء', 'سعر الشراء', 'كمية', 'كميات', 'رصيد',
  'نواقص', 'ناقص', 'صلاحية', 'تاريخ الانتهاء',

  // ─── Staff ────────────────────────────────────────────────
  'موظف', 'موظفين', 'راتب', 'رواتب', 'أجور', 'أجر', 'ساعات',
  'حضور', 'انصراف', 'بصمة', 'مناوبة', 'فريق', 'عمولة', 'مكافأة',

  // ─── Reports ──────────────────────────────────────────────
  'تقرير', 'تقارير', 'تحليل', 'تحليلات', 'إحصائية', 'إحصائيات', 'مقارنة',
  'مبيعات الشهر', 'النهاردة', 'امبارح', 'الأسبوع', 'الشهر', 'السنة',
  'يومي', 'أسبوعي', 'شهري', 'سنوي',

  // ─── English ──────────────────────────────────────────────
  'sales', 'sale', 'revenue', 'revenues', 'income', 'total', 'net', 'tax',
  'order', 'orders', 'invoice', 'invoices', 'receipt', 'receipts',
  'cashier', 'shift', 'shifts', 'drawer', 'cash', 'checkout', 'pos',
  'refund', 'refunds', 'discount', 'discounts', 'coupon', 'coupons',
  'delivery', 'deliveries', 'table', 'tables', 'takeaway', 'takeout',
  'product', 'products', 'menu', 'item', 'items', 'burger',
  'price', 'prices', 'cost', 'costs', 'profit', 'profits', 'margin', 'margins',
  'how much',
  'addon', 'addons', 'topping', 'toppings', 'ingredient', 'ingredients',
  'recipe', 'recipes', 'stock', 'inventory', 'warehouse',
  'supplier', 'suppliers', 'purchase', 'purchases', 'waste', 'spoilage',
  'employee', 'employees', 'staff', 'salary', 'salaries', 'wage', 'wages',
  'hours', 'attendance', 'report', 'reports', 'analysis', 'analytics',
  'compare', 'comparison', 'today', 'yesterday', 'week', 'month', 'year',
  'bestseller', 'bestsellers',
]

/**
 * "وصفة" on its own is a recipe — an app word. Only the medical phrase is
 * off-topic, so that is the only form listed here.
 */
export const OFF_TOPIC_TERMS: string[] = [
  // Everything Arabic the guard refuses outright.
  'شعر', 'شعري', 'قصيدة', 'قصيده', 'نكتة', 'حكاية', 'قصة', 'رواية',
  'فيلم', 'أفلام', 'مسلسل', 'مسلسلات', 'مسرحية', 'أغنية', 'أغاني', 'موسيقى',
  'كورة', 'كرة قدم', 'مباراة', 'ماتش', 'لاعب',
  'سياسة', 'انتخابات', 'رئيس', 'حكومة',
  'طقس', 'درجة الحرارة', 'مطر',
  'ترجمة', 'ترجم', 'جملة انجليزي',
  'كود', 'برمجة', 'جافاسكريبت', 'بايثون',
  'رياضيات', 'معادلة', 'فيزياء', 'كيمياء',
  'وصفة طبية', 'وصفات طبية',

  // English markers of the same domains.
  'translate', 'translation', 'poem', 'poetry', 'joke', 'jokes',
  'movie', 'movies', 'film', 'series', 'song', 'music',
  'football', 'soccer', 'match', 'election', 'politics',
  'weather', 'code', 'coding', 'javascript', 'typescript', 'python',
  'html', 'css', 'sql', 'math', 'maths', 'physics', 'chemistry',
]

/** Index of canonical word runs, so single words and phrases share one path. */
type TermIndex = { single: Set<string>; phrases: string[][] }

/**
 * Glue that carries no meaning: the article ("المخزون"), and the preposition
 * fused with it ("للمخزون", "بالمبيعات"). The owner writes both spellings, so
 * they have to land on the same term. The remainder must still be a real word
 * (two letters is enough — "الحد" folds to the "حد" of "حد أدنى"), otherwise
 * "فال" or "لل" would turn into noise.
 */
const PREFIXES = ['وبال', 'فبال', 'بال', 'كال', 'فال', 'وال', 'لل', 'ال']

function stripArticle(word: string): string {
  for (const prefix of PREFIXES) {
    if (!word.startsWith(prefix)) continue
    const rest = word.slice(prefix.length)
    if (rest.length >= 2) return rest
  }
  return word
}

/** Normalized, article folded, punctuation gone — what matching compares. */
function canonical(input: string): string[] {
  return words(input).map(stripArticle)
}

/** A phrase counts only as a contiguous run of words, never as a substring. */
function containsRun(tokens: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > tokens.length) return false
  const last = tokens.length - phrase.length
  for (let start = 0; start <= last; start += 1) {
    let offset = 0
    while (offset < phrase.length && tokens[start + offset] === phrase[offset]) offset += 1
    if (offset === phrase.length) return true
  }
  return false
}

function buildIndex(terms: readonly string[]): TermIndex {
  const single = new Set<string>()
  const phrases: string[][] = []
  const seen = new Set<string>()
  for (const term of terms) {
    const parts = canonical(term)
    if (parts.length === 0) continue
    const key = parts.join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    if (parts.length === 1) single.add(parts[0])
    else phrases.push(parts)
  }
  return { single, phrases }
}

function matchCount(index: TermIndex, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const present = new Set(tokens)
  let hits = 0
  for (const term of index.single) if (present.has(term)) hits += 1
  for (const phrase of index.phrases) if (containsRun(tokens, phrase)) hits += 1
  return hits
}

const APP_INDEX = buildIndex(APP_TERMS)
const OFF_TOPIC_INDEX = buildIndex(OFF_TOPIC_TERMS)

/**
 * How many distinct app terms the message names. Zero means "no evidence".
 *
 * `extraTerms` carries vocabulary this module cannot know — the shop's own menu
 * — so "بكام الكرنش بومب" is recognised even when neither word is in the
 * dictionary. It is only consulted when the built-in list found nothing.
 */
export function appTermScore(input: string, extraTerms: readonly string[] = []): number {
  const tokens = canonical(input)
  const hits = matchCount(APP_INDEX, tokens)
  if (hits > 0 || extraTerms.length === 0) return hits
  return matchCount(buildIndex(extraTerms), tokens)
}

/** An unrelated domain is named and the app is not: definitely not our data. */
export function looksOffTopic(input: string): boolean {
  return matchCount(OFF_TOPIC_INDEX, canonical(input)) > 0 && appTermScore(input) === 0
}

/** Openers that only make sense as a continuation of the previous answer. */
const FOLLOW_UP_STARTERS = [
  'و', 'وطب', 'طب', 'ليه', 'ليش', 'فين', 'ازاي', 'كم', 'كام', 'امتى',
  'ايه', 'هو', 'هي', 'طيب', 'تمام', 'بعدين',
  'more', 'why', 'how', 'when', 'which',
]

const FOLLOW_UP_WORDS = new Set(
  FOLLOW_UP_STARTERS.map(starter => words(starter).join(' ')).filter(starter => starter.length > 0),
)

const FOLLOW_UP_WORD_LIMIT = 8

/**
 * "وكام؟" or "طب ليه" right after a tool answered is about that answer, not a
 * new topic — even though it names nothing from the app.
 */
export function isFollowUp(input: string, previousTurnWasTool: boolean): boolean {
  if (!previousTurnWasTool) return false
  const tokens = words(input)
  if (tokens.length === 0 || tokens.length > FOLLOW_UP_WORD_LIMIT) return false
  const first = tokens[0]
  if (FOLLOW_UP_WORDS.has(first)) return true
  // A leading conjunction is glued to the next word all the time: "وكام".
  if (first.length > 1 && first.startsWith('و')) {
    const stripped = first.slice(1)
    if (FOLLOW_UP_WORDS.has(stripped) || FOLLOW_UP_WORDS.has(stripArticle(stripped))) return true
  }
  return false
}

/**
 * The ordered rules. The first match wins, and only "uncertain" leaves the
 * decision to spend a model call to the caller.
 */
export function verdict(
  input: string,
  opts: { previousTurnWasTool: boolean; appTerms?: readonly string[] },
): TopicVerdict {
  // 1 — nothing to answer. Punctuation only ("؟؟") counts as empty: a model
  // could only guess at it.
  if (normalizeArabic(input).length < 2 || words(input).length === 0) {
    return { decision: 'block', reason: 'empty' }
  }
  // 2 — a greeting is answered from the saved replies.
  if (isGreeting(input)) return { decision: 'block', reason: 'greeting' }
  // 3 — the message names something the app owns.
  if (appTermScore(input, opts?.appTerms) > 0) return { decision: 'allow', reason: 'app-term' }
  // 4 — a short "and how much?" about the answer that just came back.
  if (isFollowUp(input, Boolean(opts?.previousTurnWasTool))) {
    return { decision: 'allow', reason: 'follow-up' }
  }
  // 5 — another domain named, nothing from ours.
  if (looksOffTopic(input)) return { decision: 'block', reason: 'off-topic' }
  // 6 — no evidence either way; the caller may still classify it.
  return { decision: 'allow', reason: 'uncertain' }
}

/** True only for the case the guard could not decide on its own. */
export function needsClassifier(v: TopicVerdict): boolean {
  return v.decision === 'allow' && v.reason === 'uncertain'
}
