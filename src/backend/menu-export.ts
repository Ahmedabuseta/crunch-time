// Menu → Word (.docx) export. The admin picks which products go in and whether
// each product's recipe (ingredients, quantities, optional costs) is printed
// under it. Data never leaves the main process; only the saved file does.
import { writeFileSync } from 'node:fs'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
} from 'docx'
import { fmtMoney } from '../lib/format'
import { listCategories, listProducts } from './catalog'
import { getElectron } from './electron'
import { requireAdmin } from './session'
import { getSettings } from './settings'
import { listRecipeRows } from './shared'

export type MenuExportOptions = {
  /** Omit (or pass an empty array) to export every product in scope. */
  productIds?: string[]
  includeInactive?: boolean
  includeRecipes?: boolean
  includeCosts?: boolean
}

export type MenuExportRecipeLine = {
  name: string
  quantity: number
  unit: string
  isSubRecipe: boolean
}

export type MenuExportItem = {
  id: string
  name: string
  emoji: string
  description: string
  price: number
  costPrice: number
  active: boolean
  recipe: MenuExportRecipeLine[]
}

export type MenuExportCategory = {
  id: string
  name: string
  products: MenuExportItem[]
}

export type MenuExportData = {
  restaurant: string
  currency: string
  logo: string | null
  generatedAt: string
  includeRecipes: boolean
  includeCosts: boolean
  categories: MenuExportCategory[]
  totals: { products: number; withRecipe: number }
}

const ACCENT = 'A9854F'
const INK = '1C1A17'
const MUTED = '6B6A66'
const LINE = 'E6E0D4'
const CATEGORY_FILL = 'F4EFE6'
const RECIPE_FILL = 'FBF8F3'
const HEADER_FILL = 'EFE9DE'

// Every paragraph in this document is Arabic, so bidi is set once here.
const p = (options: IParagraphOptions = {}) => new Paragraph({ bidirectional: true, ...options })

function recipeLines(productId: string): MenuExportRecipeLine[] {
  return listRecipeRows('recipes', 'product_id', productId).map((row: any) => ({
    name: row.ingredientName ?? row.subRecipeName ?? '',
    quantity: Number(row.quantityPerUnit) || 0,
    unit: row.unit ?? row.subRecipeUnit ?? '',
    isSubRecipe: Boolean(row.subRecipeId),
  }))
}

/** Collects exactly what the document will contain, without rendering it. */
export function collectMenuExportData(opts: MenuExportOptions = {}): MenuExportData {
  const includeRecipes = opts.includeRecipes !== false
  const includeCosts = opts.includeCosts === true
  const settings = getSettings() as Record<string, any>

  const categories = listCategories().all() as any[]
  const categoryIds = new Set(categories.map((c) => c.id))
  const wanted = opts.productIds?.length ? new Set(opts.productIds) : null
  const products = (listProducts(undefined, Boolean(opts.includeInactive)) as any[]).filter(
    (p) => categoryIds.has(p.categoryId) && (!wanted || wanted.has(p.id)),
  )

  const byCategory = new Map<string, MenuExportItem[]>()
  for (const p of products) {
    const item: MenuExportItem = {
      id: p.id,
      name: p.name,
      emoji: p.emoji || '',
      description: p.description || '',
      price: Number(p.price) || 0,
      costPrice: Number(p.costPrice) || 0,
      active: Boolean(p.active),
      recipe: includeRecipes ? recipeLines(p.id) : [],
    }
    const bucket = byCategory.get(p.categoryId) ?? []
    bucket.push(item)
    byCategory.set(p.categoryId, bucket)
  }

  const grouped: MenuExportCategory[] = categories
    .filter((c) => byCategory.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      products: (byCategory.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    }))

  return {
    restaurant: String(settings.restaurantName || 'المنيو'),
    currency: String(settings.currencyLabel || settings.currency || 'ج.م'),
    logo: typeof settings.storeLogo === 'string' && settings.storeLogo.startsWith('data:image/')
      ? settings.storeLogo
      : null,
    generatedAt: new Date().toISOString(),
    includeRecipes,
    includeCosts,
    categories: grouped,
    totals: {
      products: products.length,
      withRecipe: grouped.reduce((n, c) => n + c.products.filter((p) => p.recipe.length > 0).length, 0),
    },
  }
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Pixel size of a PNG or JPEG buffer, so the logo keeps its aspect ratio. */
function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue }
      const marker = buf[i + 1]
      const length = buf.readUInt16BE(i + 2)
      // SOF0–SOF3 carry the frame dimensions.
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      i += 2 + length
    }
  }
  return null
}

/** Decodes the receipt-style logo data URL; anything unsupported is skipped. */
function logoImage(dataUrl: string): ImageRun | null {
  const match = /^data:image\/(png|jpeg);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  const type = match[1].toLowerCase() === 'png' ? 'png' : 'jpg'
  try {
    const data = Buffer.from(match[2], 'base64')
    const size = imageSize(data) ?? { width: 96, height: 96 }
    const scale = Math.min(1, 96 / Math.max(size.width, size.height))
    return new ImageRun({
      type,
      data,
      transformation: {
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
      },
    })
  } catch {
    return null
  }
}

function cell(
  children: Paragraph[],
  options: { fill?: string; span?: number } = {},
) {
  return new TableCell({
    children,
    columnSpan: options.span,
    shading: options.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: options.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
    },
  })
}

function recipeParagraphs(product: MenuExportItem, currency: string, includeCosts: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = []
  if (product.recipe.length === 0) {
    paragraphs.push(p({
      children: [new TextRun({ text: 'لا توجد وصفة مسجلة لهذا المنتج', size: 16, color: MUTED, italics: true })],
    }))
  } else {
    for (const line of product.recipe) {
      paragraphs.push(p({
        spacing: { after: 20 },
        children: [
          new TextRun({ text: `${fmtMoney(line.quantity)} ${line.unit}`, bold: true, size: 17, color: INK }),
          new TextRun({ text: `   ${line.name}`, size: 17, color: MUTED }),
          ...(line.isSubRecipe
            ? [new TextRun({ text: '   (وصفة فرعية)', size: 15, color: '7C5CBF' })]
            : []),
        ],
      }))
    }
  }
  if (includeCosts && product.costPrice > 0) {
    const margin = product.price - product.costPrice
    const pct = product.price > 0 ? ` (${Math.round((margin / product.price) * 100)}%)` : ''
    paragraphs.push(p({
      spacing: { before: 40 },
      children: [new TextRun({
        text: `تكلفة الوصفة ${fmtMoney(product.costPrice)} ${currency} · الهامش ${fmtMoney(margin)} ${currency}${pct}`,
        size: 16,
        color: margin < 0 ? 'B42318' : MUTED,
      })],
    }))
  }
  return paragraphs
}

/** Renders the collected menu into a real .docx buffer. */
export async function buildMenuDocx(data: MenuExportData): Promise<Buffer> {
  const logo = data.logo ? logoImage(data.logo) : null
  const label = dateLabel(data.generatedAt)

  const header: (Paragraph | Table)[] = []
  if (logo) {
    header.push(p({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [logo] }))
  }
  header.push(p({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: data.restaurant, bold: true, size: 40, color: INK })],
  }))
  header.push(p({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: `قائمة المنتجات — ${label}`, size: 20, color: MUTED })],
  }))
  header.push(p({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } },
    spacing: { after: 40 },
    children: [new TextRun({ text: '' })],
  }))

  const body: (Paragraph | Table)[] = []
  for (const category of data.categories) {
    body.push(p({
      spacing: { before: 240, after: 100 },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: CATEGORY_FILL },
      children: [new TextRun({ text: category.name, bold: true, size: 26, color: ACCENT })],
    }))

    const columns = data.includeCosts ? 5 : 4
    const rows: TableRow[] = []

    const headCells = [
      cell([p({ children: [new TextRun({ text: ' ' })] })], { fill: HEADER_FILL }),
      cell([p({ children: [new TextRun({ text: 'المنتج', bold: true, size: 18, color: INK })] })], { fill: HEADER_FILL }),
      cell([p({ children: [new TextRun({ text: 'الوصف', bold: true, size: 18, color: INK })] })], { fill: HEADER_FILL }),
      ...(data.includeCosts
        ? [cell([p({ children: [new TextRun({ text: 'التكلفة', bold: true, size: 18, color: INK })] })], { fill: HEADER_FILL })]
        : []),
      cell([p({ children: [new TextRun({ text: 'السعر', bold: true, size: 18, color: INK })] })], { fill: HEADER_FILL }),
    ]
    rows.push(new TableRow({ tableHeader: true, children: headCells }))

    for (const product of category.products) {
      rows.push(new TableRow({
        children: [
          // The emoji gets its own cell: Word/LibreOffice drop the Arabic in
          // any paragraph where an emoji run shares the paragraph with it.
          cell([p({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: product.emoji || '', size: 22 })],
          })]),
          cell([p({
            children: [
              new TextRun({ text: product.name, bold: true, size: 20, color: INK }),
              ...(product.active
                ? []
                : [new TextRun({ text: '   (مخفي)', size: 15, color: MUTED })]),
            ],
          })]),
          cell([p({
            children: [new TextRun({ text: product.description || '—', size: 17, color: MUTED })],
          })]),
          ...(data.includeCosts
            ? [cell([p({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({
                text: product.costPrice > 0 ? fmtMoney(product.costPrice) : '—',
                size: 18,
                color: MUTED,
              })],
            })])]
            : []),
          cell([p({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: `${fmtMoney(product.price)} ${data.currency}`,
              bold: true,
              size: 18,
              color: ACCENT,
            })],
          })]),
        ],
      }))

      if (data.includeRecipes) {
        rows.push(new TableRow({
          children: [
            cell(recipeParagraphs(product, data.currency, data.includeCosts), { span: columns, fill: RECIPE_FILL }),
          ],
        }))
      }
    }

    body.push(new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: data.includeCosts ? [700, 3000, 2700, 1800, 1800] : [700, 4000, 3400, 2000],
      layout: TableLayoutType.FIXED,
      visuallyRightToLeft: true,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        insideVertical: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      },
    }))
  }

  const doc = new Document({
    title: `${data.restaurant} — قائمة المنتجات`,
    description: `${data.totals.products} منتج`,
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 20, color: INK },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      footers: {
        default: new Footer({
          children: [p({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${data.restaurant} · ${label}    `, size: 16, color: MUTED }),
              new TextRun({ children: ['صفحة ', PageNumber.CURRENT, ' من ', PageNumber.TOTAL_PAGES], size: 16, color: MUTED }),
            ],
          })],
        }),
      },
      children: [...header, ...body],
    }],
  })

  return Packer.toBuffer(doc)
}

export async function exportMenuWord(opts: MenuExportOptions = {}) {
  try {
    requireAdmin()
    const data = collectMenuExportData(opts)
    if (data.totals.products === 0) return { ok: false, error: 'لا توجد منتجات مطابقة للتصدير' }

    const buffer = await buildMenuDocx(data)
    const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 8)
    const { canceled, filePath } = await getElectron().dialogs.showSaveDialog({
      title: 'تصدير المنيو إلى Word',
      defaultPath: `menu-${stamp}.docx`,
      filters: [{ name: 'مستند Word', extensions: ['docx'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }

    writeFileSync(filePath, buffer)
    return { ok: true, path: filePath, message: 'تم تصدير المنيو إلى Word' }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'فشل تصدير المنيو' }
  }
}
