import { useEffect, useRef, useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Database, Cloud, Settings, Tag, DollarSign, Receipt, Plus, Trash2, X, Truck, Printer, ChefHat, RefreshCw, Sun, Moon, Palette, User, Store, ImageUp, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import type { ViewMode } from '@/components/ui/view-toggle'
import { useDeliveryStore, useStationStore, useProfileStore } from '@/services/delivery/delivery.store'
import { useIsAdmin } from '@/lib/use-is-admin'
import { getThemeMode, getThemeColor, setThemeMode, setThemeColor, type ThemeMode, type ThemeColor } from '@/lib/theme'
import { Receipt as ReceiptView } from '@/components/Receipt'
import { normalizeReceiptInfo, processLogoFile } from '@/lib/receipt'
import { buildCustomerReceiptHtml, contentWidth } from '@/lib/print'
import { toast } from '@/components/ui/toast'

// ─── Receipt branding form helpers ─────────────────────────────
const inputClass = 'w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none'

function Field({
  label, value, onChange, placeholder, dir = 'rtl', type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  dir?: 'rtl' | 'ltr'
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground font-bold mb-1 block">{label}</span>
      <input
        type={type}
        dir={dir}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  )
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer border-2 transition-all",
        on ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-secondary/60 text-muted-foreground border-transparent")}
    >
      <span className={cn("w-8 h-5 rounded-full relative transition-colors", on ? "bg-green-500" : "bg-secondary")}>
        <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", on ? "right-0.5" : "left-0.5")} />
      </span>
      {label}
    </button>
  )
}

// Sample sale used for the live preview + "طباعة تجريبية" button.
const PREVIEW_DATE = new Date('2026-03-12T14:32:00')
const previewItems: any[] = [
  {
    lineId: 'pv-1', quantity: 2, note: 'بدون بصل', addons: [], modifiers: [],
    product: { name: 'برجر كلاسيك', price: 120 },
  },
  {
    lineId: 'pv-2', quantity: 1, note: '', modifiers: [{ modifierName: 'جبن شيدر', priceAdjustment: 0 }], addons: [{ id: 'a1', name: 'إضافة جبنة', price: 15, qty: 1 }],
    product: { name: 'كريب عربي', price: 85 },
  },
]
const previewSubtotal = 355
// Whole pounds, same rule as the checkout: the preview receipt must show an
// integer tax line and an integer total that adds up.
const previewTax = Math.round(previewSubtotal * 0.14)
const previewDeliveryFee = 35
const previewDiscount = 20
const previewTotal = previewSubtotal + previewTax + previewDeliveryFee - previewDiscount

type SettingsTab = 'general' | 'receipt' | 'delivery' | 'kitchen' | 'sales' | 'system'

const settingsTabs: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: 'عام', icon: Settings },
  { id: 'receipt', label: 'الإيصال', icon: Receipt },
  { id: 'delivery', label: 'التوصيل', icon: Truck },
  { id: 'kitchen', label: 'المطبخ', icon: ChefHat },
  { id: 'sales', label: 'المبيعات', icon: Tag },
  { id: 'system', label: 'النظام', icon: Database },
]

export function SettingsPage() {
  const isAdmin = useIsAdmin()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(true)
  const [discountSearch, setDiscountSearch] = useState('')
  const [discountFilter, setDiscountFilter] = useState<string | null>(null)
  const [discountView, setDiscountView] = useState<ViewMode>('cards')
  const [discountPage, setDiscountPage] = useState(1)
  const [expenseSearch, setExpenseSearch] = useState('')
  const [expenseFilter, setExpenseFilter] = useState<string | null>(null)
  const [expenseView, setExpenseView] = useState<ViewMode>('cards')
  const [expensePage, setExpensePage] = useState(1)
  const [zoneSearch, setZoneSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState<string | null>(null)
  const [zoneView, setZoneView] = useState<ViewMode>('cards')
  const [zonePage, setZonePage] = useState(1)
  const [settings, setSettings] = useState<any>({})
  const [discounts, setDiscounts] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [printers, setPrinters] = useState<any[]>([])
  const [printMsg, setPrintMsg] = useState('')
  const [showDiscountForm, setShowDiscountForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [showStationForm, setShowStationForm] = useState(false)
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode)
  const [themeColor, setThemeColorState] = useState<ThemeColor>(getThemeColor)
  const [zoneForm, setZoneForm] = useState({ name: '', fee: '' })
  const [stationForm, setStationForm] = useState({ name: '', printerName: '', paperWidth: '80mm', categoryIds: [] as string[] })
  const [editingZone, setEditingZone] = useState<any | null>(null)
  const [editingStation, setEditingStation] = useState<any | null>(null)
  const zones = useDeliveryStore((s) => s.zones)
  const fetchZones = useDeliveryStore((s) => s.fetch)
  const createZone = useDeliveryStore((s) => s.create)
  const updateZone = useDeliveryStore((s) => s.update)
  const removeZone = useDeliveryStore((s) => s.remove)
  const stations = useStationStore((s) => s.stations)
  const fetchStations = useStationStore((s) => s.fetch)
  const createStation = useStationStore((s) => s.create)
  const updateStation = useStationStore((s) => s.update)
  const removeStation = useStationStore((s) => s.remove)
  const profiles = useProfileStore((s) => s.profiles)
  const fetchProfiles = useProfileStore((s) => s.fetch)
  const createProfile = useProfileStore((s) => s.create)
  const updateProfile = useProfileStore((s) => s.update)
  const removeProfile = useProfileStore((s) => s.remove)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<any | null>(null)
  const [editingDiscount, setEditingDiscount] = useState<any | null>(null)
  const [editingExpense, setEditingExpense] = useState<any | null>(null)
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' })
  const [discountForm, setDiscountForm] = useState({ code: '', type: 'percentage', value: '', maxUses: '' })
  const [expenseForm, setExpenseForm] = useState({ name: '', category: 'رواتب', amount: '', type: 'monthly' })
  const [backupStatus, setBackupStatus] = useState<any>({ lastBackup: null, backupCount: 0 })
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'discount' | 'expense' | 'zone' | 'station' | 'profile'; item: any } | null>(null)
  const [logoError, setLogoError] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [sampleStatus, setSampleStatus] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<Record<string, any>>({})

  const settingsPageSize = 8
  const filteredDiscounts = discounts.filter(d => {
    const query = discountSearch.trim().toLowerCase()
    const matchesSearch = !query || String(d.code).toLowerCase().includes(query)
    const matchesFilter = !discountFilter || (discountFilter === 'active' ? d.active : !d.active)
    return matchesSearch && matchesFilter
  })
  const discountPages = Math.max(1, Math.ceil(filteredDiscounts.length / settingsPageSize))
  const visibleDiscounts = filteredDiscounts.slice((discountPage - 1) * settingsPageSize, discountPage * settingsPageSize)
  const filteredExpenses = expenses.filter(e => {
    const query = expenseSearch.trim().toLowerCase()
    const matchesSearch = !query || `${e.name} ${e.category}`.toLowerCase().includes(query)
    const matchesFilter = !expenseFilter || e.category === expenseFilter
    return matchesSearch && matchesFilter
  })
  const expensePages = Math.max(1, Math.ceil(filteredExpenses.length / settingsPageSize))
  const visibleExpenses = filteredExpenses.slice((expensePage - 1) * settingsPageSize, expensePage * settingsPageSize)
  const filteredZones = zones.filter(z => {
    const query = zoneSearch.trim().toLowerCase()
    const matchesSearch = !query || String(z.name).toLowerCase().includes(query)
    const matchesFilter = !zoneFilter || (zoneFilter === 'active' ? z.active : !z.active)
    return matchesSearch && matchesFilter
  })
  const zonePages = Math.max(1, Math.ceil(filteredZones.length / settingsPageSize))
  const visibleZones = filteredZones.slice((zonePage - 1) * settingsPageSize, zonePage * settingsPageSize)

  const availableKitchenPrinters = (currentStationId?: string) => {
    const taken = new Set(
      stations
        .filter((station) => station.active && station.id !== currentStationId && station.printerName)
        .map((station) => station.printerName),
    )
    return printers.filter((printer) =>
      !taken.has(printer.name) && printer.name !== settings.receiptPrinter,
    )
  }

  const load = async () => {
    const [s, d, e, b, cats, prs] = await Promise.all([
      window.api.settings.get(),
      window.api.discountCode.list(),
      window.api.expense.list(),
      window.api.backup.getStatus(),
      window.api.category.list().catch(() => []),
      window.api.printer.list().catch(() => []),
    ])
    setSettings(s)
    setDiscounts(d)
    setExpenses(e)
    setBackupStatus(b || { lastBackup: null, backupCount: 0 })
    setCategories(cats || [])
    setPrinters(prs || [])
    await fetchZones(true)
    await fetchStations(true)
    await fetchProfiles(true)
  }

  useEffect(() => { load() }, [])

  // Debounced autosave. Timers are tracked per key so that editing a second
  // field never cancels the pending write of the first one.
  const saveSettings = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }))
    const timers = saveTimer.current
    if (timers[key]) clearTimeout(timers[key])
    timers[key] = setTimeout(async () => {
      delete timers[key]
      try {
        await window.api.settings.update({ [key]: value })
        if (key === 'autoPrintReceipt' || key === 'autoPrintKitchen' || key === 'receiptPrinter') {
          toast({ title: 'تم حفظ إعداد الطباعة', description: key === 'autoPrintKitchen' ? 'تم تحديث طباعة المطبخ التلقائية' : key === 'autoPrintReceipt' ? 'تم تحديث طباعة الإيصال التلقائية' : 'تم تحديث طابعة الإيصال', variant: 'success' })
        }
      } catch (err: any) {
        await load()
        toast({ title: 'لم يتم حفظ إعداد الطباعة', description: err?.message || 'تحقق من الطابعة والمحطات أولاً', variant: 'error', duration: 6500 })
      }
    }, 500)
  }

  const handleAddDiscount = async () => {
    if (!discountForm.code || !discountForm.value) return
    try {
      await window.api.discountCode.create({ code: discountForm.code.toUpperCase().trim(), type: discountForm.type, value: parseFloat(discountForm.value), maxUses: parseInt(discountForm.maxUses) || 0 })
      setDiscountForm({ code: '', type: 'percentage', value: '', maxUses: '' })
      setShowDiscountForm(false)
      toast({ title: 'تمت إضافة كود الخصم', description: discountForm.code.toUpperCase(), variant: 'success' })
      await load()
    } catch (err: any) {
      toast({ title: 'فشل إضافة كود الخصم', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const handleUpdateDiscount = async () => {
    if (!editingDiscount || !editingDiscount.code || !editingDiscount.value) return
    try {
      await window.api.discountCode.update(editingDiscount.id, {
        code: String(editingDiscount.code).toUpperCase().trim(),
        type: editingDiscount.type,
        value: parseFloat(editingDiscount.value),
        maxUses: parseInt(editingDiscount.maxUses) || 0,
      })
      toast({ title: 'تم تحديث كود الخصم', description: editingDiscount.code, variant: 'success' })
      setEditingDiscount(null)
      await load()
    } catch (err: any) {
      toast({ title: 'فشل تحديث كود الخصم', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const handleToggleDiscountActive = async (d: any) => {
    try {
      await window.api.discountCode.update(d.id, { active: !d.active })
      toast({
        title: d.active ? 'تم تعطيل كود الخصم' : 'تم تفعيل كود الخصم',
        description: d.code,
        variant: 'success'
      })
      await load()
    } catch (err: any) {
      toast({ title: 'فشل تغيير حالة كود الخصم', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const handleAddExpense = async () => {
    if (!expenseForm.name || !expenseForm.amount) return
    try {
      await window.api.expense.create({ name: expenseForm.name.trim(), category: expenseForm.category, amount: parseFloat(expenseForm.amount), type: expenseForm.type })
      setExpenseForm({ name: '', category: 'رواتب', amount: '', type: 'monthly' })
      setShowExpenseForm(false)
      toast({ title: 'تمت إضافة المصروف', description: expenseForm.name, variant: 'success' })
      await load()
    } catch (err: any) {
      toast({ title: 'فشل إضافة المصروف', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const handleUpdateExpense = async () => {
    if (!editingExpense || !editingExpense.name || !editingExpense.amount) return
    try {
      await window.api.expense.update(editingExpense.id, {
        name: String(editingExpense.name).trim(),
        category: editingExpense.category,
        amount: parseFloat(editingExpense.amount),
        type: editingExpense.type || 'monthly',
      })
      toast({ title: 'تم تحديث المصروف', description: editingExpense.name, variant: 'success' })
      setEditingExpense(null)
      await load()
    } catch (err: any) {
      toast({ title: 'فشل تحديث المصروف', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const handleAddZone = async () => {
    if (!zoneForm.name.trim() || !zoneForm.fee) return
    try {
      await createZone({ name: zoneForm.name.trim(), fee: parseFloat(zoneForm.fee) || 0 })
      setZoneForm({ name: '', fee: '' })
      setShowZoneForm(false)
      toast({ title: 'تمت إضافة منطقة التوصيل', description: zoneForm.name.trim(), variant: 'success' })
    } catch (err: any) {
      toast({ title: 'فشل إضافة منطقة التوصيل', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const handleEditZone = async () => {
    if (!editingZone || !editingZone.name.trim()) return
    try {
      await updateZone(editingZone.id, { name: editingZone.name.trim(), fee: parseFloat(editingZone.fee) || 0 })
      toast({ title: 'تم تحديث منطقة التوصيل', description: editingZone.name.trim(), variant: 'success' })
      setEditingZone(null)
    } catch (err: any) {
      toast({ title: 'فشل تحديث منطقة التوصيل', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const handleAddStation = async () => {
    if (!stationForm.name.trim()) {
      toast({ title: 'اكتب اسم المحطة أولاً', variant: 'warning' })
      return
    }
    try {
      await createStation({ name: stationForm.name.trim(), printerName: stationForm.printerName || undefined, paperWidth: stationForm.paperWidth, categoryIds: stationForm.categoryIds })
      setStationForm({ name: '', printerName: '', paperWidth: '80mm', categoryIds: [] })
      setShowStationForm(false)
      toast({ title: 'تمت إضافة محطة المطبخ', description: 'تم حفظ الطابعة والأقسام المرتبطة بها بنجاح', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'فشل إضافة محطة المطبخ', description: err?.message || 'تحقق من اسم المحطة والطابعة والأقسام', variant: 'error', duration: 7000 })
    }
  }

  const handleEditStation = async () => {
    if (!editingStation || !editingStation.name.trim()) {
      toast({ title: 'اسم المحطة مطلوب', variant: 'warning' })
      return
    }
    try {
      await updateStation(editingStation.id, {
        name: editingStation.name.trim(),
        printerName: editingStation.printerName || null,
        paperWidth: editingStation.paperWidth || '80mm',
        categoryIds: editingStation.categoryIds || [],
      })
      setEditingStation(null)
      toast({ title: 'تم تحديث محطة المطبخ', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'فشل تحديث محطة المطبخ', description: err?.message || 'تحقق من الطابعة والأقسام', variant: 'error', duration: 7000 })
    }
  }

  const handleAddProfile = async () => {
    if (!profileForm.name.trim()) return
    try {
      await createProfile({ name: profileForm.name.trim(), phone: profileForm.phone.trim() || undefined })
      setProfileForm({ name: '', phone: '' })
      setShowProfileForm(false)
      toast({ title: 'تمت إضافة الديلفري', description: profileForm.name.trim(), variant: 'success' })
    } catch (err: any) {
      toast({ title: 'فشل إضافة الديلفري', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const handleEditProfile = async () => {
    if (!editingProfile || !editingProfile.name.trim()) return
    try {
      await updateProfile(editingProfile.id, { name: editingProfile.name.trim(), phone: editingProfile.phone?.trim() || null })
      toast({ title: 'تم تحديث بيانات الديلفري', description: editingProfile.name.trim(), variant: 'success' })
      setEditingProfile(null)
    } catch (err: any) {
      toast({ title: 'فشل تحديث بيانات الديلفري', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  const toggleStationCategory = (editing: boolean, stationId: string | null, categoryId: string) => {
    if (editing && editingStation) {
      const ids: string[] = editingStation.categoryIds || []
      setEditingStation({ ...editingStation, categoryIds: ids.includes(categoryId) ? ids.filter((c) => c !== categoryId) : [...ids, categoryId] })
    } else {
      const ids: string[] = stationForm.categoryIds || []
      setStationForm({ ...stationForm, categoryIds: ids.includes(categoryId) ? ids.filter((c) => c !== categoryId) : [...ids, categoryId] })
    }
    void stationId
  }

  const handleTestPrint = async (deviceName?: string) => {
    setPrintMsg('جارٍ إرسال صفحة الاختبار…')
    try {
      const res: any = await window.api.printer.test(deviceName)
      setPrintMsg(res?.ok ? 'اتبعتت — بص على الطابعة' : `${res?.error || 'فشلت الطباعة'}`)
    } catch (err: any) {
      setPrintMsg(`${err?.message || 'فشلت الطباعة'}`)
    }
  }

  const handleBackup = async () => {
    setBackupBusy(true)
    setBackupMessage('')
    try {
      const res = await window.api.backup.trigger()
      setBackupMessage(res?.ok ? (res.message || 'تم إنشاء النسخة الاحتياطية') : (res?.error || 'فشل النسخ الاحتياطي'))
      const st = await window.api.backup.getStatus()
      setBackupStatus(st || { lastBackup: null, backupCount: 0 })
    } catch (err: any) {
      setBackupMessage(err?.message || 'فشل النسخ الاحتياطي')
    } finally {
      setBackupBusy(false)
    }
  }

  const handleLogoPick = async (file?: File | null) => {
    if (!file) return
    setLogoBusy(true)
    setLogoError('')
    try {
      const dataUrl = await processLogoFile(file)
      saveSettings('storeLogo', dataUrl)
    } catch (err: any) {
      setLogoError(err?.message || 'مقدرناش نقرأ الصورة')
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const sampleOrder = () => ({
    id: '1042', orderType: 'delivery',
    customerName: 'أحمد سيد', customerPhone: '0100 123 4567',
    customerAddress: '12 شارع الهرم، الجيزة',
    deliveryZoneName: 'فيصل', deliveryProfileName: 'كريم',
    note: 'الاتصال قبل التوصيل',
    cashierName: 'محمد علي', createdAt: PREVIEW_DATE,
    items: previewItems.map(i => ({
      productName: i.product.name, quantity: i.quantity, unitPrice: i.product.price,
      note: i.note, modifiers: i.modifiers, addons: i.addons,
    })),
    subtotal: previewSubtotal, tax: previewTax, taxRate: 0.14,
    deliveryFee: previewDeliveryFee, discountAmount: previewDiscount, discountCode: 'SAVE10',
    total: previewTotal, paymentType: 'cash',
  })

  const handlePrintSample = async () => {
    const info = normalizeReceiptInfo(settings)
    const paper = settings.receiptWidth || '80mm'
    setSampleStatus('جارٍ الطباعة…')
    try {
      const res: any = await window.api.printer.printHtml(
        buildCustomerReceiptHtml(sampleOrder() as any, contentWidth(paper), info),
        { deviceName: settings.receiptPrinter || undefined, copies: 1, paperWidth: paper },
      )
      setSampleStatus(res?.ok ? '✅ اتبعتت — بص على الطابعة' : `⚠️ ${res?.error || 'فشلت الطباعة'}`)
    } catch (err: any) {
      setSampleStatus(`⚠️ ${err?.message || 'فشلت الطباعة'}`)
    }
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b">
        <h2 className="text-base font-black">الإعدادات</h2>
      </div>
      <nav className="px-5 py-3 border-b bg-card/40" aria-label="أقسام الإعدادات">
        <button
          type="button"
          onClick={() => setSettingsMenuOpen(open => !open)}
          className="flex w-full items-center justify-between gap-3 text-right text-xs font-black text-muted-foreground lg:hidden"
          aria-expanded={settingsMenuOpen}
        >
          <span>أقسام الإعدادات</span>
          <span className="text-primary">{settingsTabs.find(t => t.id === activeTab)?.label}</span>
        </button>
        <div className={cn('mt-3 flex flex-wrap items-center justify-start gap-2', !settingsMenuOpen && 'hidden lg:flex')} dir="rtl">
          {settingsTabs.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setActiveTab(id); setSettingsMenuOpen(false) }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-bold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-transparent bg-secondary/60 text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            )
          })}
        </div>
      </nav>
      <ScrollArea className="flex-1 p-5">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">

        {activeTab === 'general' && (
          <>
        {/* Printers */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-sm">الطابعات</h3>
              <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5 font-bold text-muted-foreground">{printers.length} متاحة</span>
            </div>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={load}>تحديث القائمة</Button>
          </div>
          {printers.length === 0 ? (
            <p className="text-xs text-muted-foreground bg-secondary/40 rounded-xl p-3">
              مفيش طابعات ظاهرة دلوقتي — عادي، الإعدادات جاهزة. لما تشتري الطابعات وتعرّفها على الويندوز هتظهر هنا وتختارها من القوائم. جرّب «Print to PDF» للتجربة.
            </p>
          ) : (
            <div className="space-y-2">
              {printers.map((p: any) => (
                <div key={p.name} className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
                  <Printer className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" dir="ltr">{p.displayName || p.name}</p>
                    {p.isDefault && <p className="text-[10px] text-muted-foreground">الافتراضية</p>}
                  </div>
                  <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => handleTestPrint(p.name)}>اختبار</Button>
                </div>
              ))}
            </div>
          )}
          {printMsg && <p className="text-xs font-bold">{printMsg}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">طابعة الإيصال (الكاشير)</label>
              <Select value={settings.receiptPrinter || '__default__'} onValueChange={v => saveSettings('receiptPrinter', v === '__default__' ? null : v)}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue placeholder="الطابعة الافتراضية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">الطابعة الافتراضية</SelectItem>
                  {availableKitchenPrinters().map((p: any) => <SelectItem key={p.name} value={p.name}>{p.displayName || p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">مقاس ورق الإيصال</label>
              <Select value={settings.receiptWidth || '80mm'} onValueChange={v => saveSettings('receiptWidth', v)}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="80mm">80mm</SelectItem>
                  <SelectItem value="58mm">58mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'autoPrintReceipt', label: 'طباعة الإيصال تلقائياً عند التأكيد' },
              { key: 'autoPrintKitchen', label: 'طباعة تذاكر المطبخ تلقائياً' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => saveSettings(key, !settings[key])}
                className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer border-2 transition-all",
                  settings[key] ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-secondary/60 text-muted-foreground border-transparent")}>
                <span className={cn("w-8 h-5 rounded-full relative transition-colors", settings[key] ? "bg-green-500" : "bg-secondary")}>
                  <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", settings[key] ? "right-0.5" : "left-0.5")} />
                </span>
                {label}
              </button>
            ))}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/60 text-xs font-bold">
              <span className="text-muted-foreground">نسخ المطبخ</span>
              <input type="number" min={1} max={5} value={settings.kitchenCopies ?? 1}
                onChange={e => saveSettings('kitchenCopies', Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-12 px-1 py-1 rounded-lg bg-secondary text-sm text-center border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/60 text-xs font-bold">
              <span className="text-muted-foreground">نسخ الإيصال</span>
              <input type="number" min={1} max={5} value={settings.receiptCopies ?? 1}
                onChange={e => saveSettings('receiptCopies', Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-12 px-1 py-1 rounded-lg bg-secondary text-sm text-center border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
          </div>
        </div>
          </>
        )}

        {activeTab === 'receipt' && (
          <>
        {/* Shop identity + professional receipt */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-sm">بيانات المحل والإيصال</h3>
              <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5 font-bold text-muted-foreground">بتتحفظ لوحدها</span>
            </div>
            <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={handlePrintSample} disabled={sampleStatus === 'جارٍ الطباعة…'}>
              <Printer className="h-4 w-4" /> طباعة تجريبية
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            اكتب بيانات المحل مرة واحدة وهتظهر على <span className="font-bold text-foreground">كل إيصال</span> و<span className="font-bold text-foreground">تذاكر المطبخ</span> والطلبات. كل حقل بيتحفظ لوحده، والمعاينة على الشمال بتوريك النتيجة فوراً.
          </p>
          {sampleStatus && sampleStatus !== 'جارٍ الطباعة…' && (
            <p className={cn("text-xs font-bold", sampleStatus.startsWith('✅') ? 'text-green-400' : 'text-amber-400')}>{sampleStatus}</p>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
            {/* ── Fields ── */}
            <div className="space-y-3 min-w-0">
              {/* Logo */}
              <div>
                <label className="text-xs text-muted-foreground font-bold mb-1 block">شعار المحل</label>
                <div className="flex items-center gap-3 bg-secondary/40 rounded-xl p-3">
                  {settings.storeLogo ? (
                    <div className="w-24 h-12 rounded-lg bg-white shrink-0 flex items-center justify-center overflow-hidden">
                      <img src={settings.storeLogo} alt="شعار المحل" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-24 h-12 rounded-lg bg-secondary/60 shrink-0 flex items-center justify-center text-gray-500">
                      <ImageUp className="h-5 w-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      {settings.storeLogo ? 'الشعار بيظهر فوق اسم المحل في الإيصال' : 'مفيش شعار — هيطبع اسم المحل كنص كبير'}
                    </p>
                    <div className="flex gap-2 mt-1.5">
                      <Button size="sm" variant="outline" className="rounded-lg text-xs gap-1.5" disabled={logoBusy} onClick={() => logoInputRef.current?.click()}>
                        <ImageUp className="h-3.5 w-3.5" /> {logoBusy ? 'جارٍ المعالجة…' : 'اختار صورة'}
                      </Button>
                      {settings.storeLogo && (
                        <Button size="sm" variant="ghost" className="rounded-lg text-xs text-destructive" onClick={() => saveSettings('storeLogo', '')}>حذف</Button>
                      )}
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={e => { void handleLogoPick(e.target.files?.[0]); e.target.value = '' }} />
                  </div>
                </div>
                {logoError && <p className="text-[11px] font-bold text-destructive mt-1">{logoError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="اسم المحل" value={settings.restaurantName ?? ''} onChange={v => saveSettings('restaurantName', v)} placeholder="Crunch Time" dir="ltr" />
                <Field label="الوصف تحت الاسم" value={settings.storeTagline ?? ''} onChange={v => saveSettings('storeTagline', v)} placeholder="بيتزا و برجر و ساندوتشات" />
                <Field label="رقم التليفون" value={settings.storePhone ?? ''} onChange={v => saveSettings('storePhone', v)} placeholder="0100 123 4567" dir="ltr" />
                <Field label="تليفون إضافي" value={settings.storePhone2 ?? ''} onChange={v => saveSettings('storePhone2', v)} placeholder="0111 222 3333" dir="ltr" />
              </div>

              <Field label="العنوان" value={settings.storeAddress ?? ''} onChange={v => saveSettings('storeAddress', v)} placeholder="15 شارع الهرم، الجيزة — بجوار مسجد النور" />

              <div className="grid grid-cols-2 gap-3">
                <Field label="رقم السجل التجاري (س.ت)" value={settings.taxNumber ?? ''} onChange={v => saveSettings('taxNumber', v)} placeholder="123456789" dir="ltr" />
                <Field label="الرقم الضريبي" value={settings.vatNumber ?? ''} onChange={v => saveSettings('vatNumber', v)} placeholder="987-654-321" dir="ltr" />
              </div>

              <Field label="رسالة أسفل الإيصال" value={settings.receiptFooter ?? ''} onChange={v => saveSettings('receiptFooter', v)} placeholder="شكراً لزيارتكم — نتشرف بخدمتكم دائماً" />

              <Field label="شروط / سياسة الاستبدال (اختياري)" value={settings.receiptTerms ?? ''} onChange={v => saveSettings('receiptTerms', v)} placeholder={'الاستبدال خلال 14 يوم من الشراء\nالأصناف الطازجة غير قابلة للاسترجاع'} />

              <div className="grid grid-cols-2 gap-3">
                <Field label="الموقع أو السوشيال" value={settings.receiptSocial ?? ''} onChange={v => saveSettings('receiptSocial', v)} placeholder="@crunchtime · 0100 123 4567" dir="ltr" />
                <Field label="رمز العملة" value={settings.currencyLabel ?? ''} onChange={v => saveSettings('currencyLabel', v)} placeholder="ج.م" dir="ltr" />
              </div>

              {/* Toggles */}
              <div>
                <label className="text-xs text-muted-foreground font-bold mb-1.5 block">اللي يظهر على الإيصال</label>
                <div className="flex flex-wrap gap-2">
                  <Toggle on={normalizeReceiptInfo(settings).showLogo} onToggle={() => saveSettings('showLogo', !settings.showLogo)} label="طباعة الشعار" />
                  <Toggle on={normalizeReceiptInfo(settings).showOrderId} onToggle={() => saveSettings('showOrderId', !settings.showOrderId)} label="رقم الطلب" />
                  <Toggle on={normalizeReceiptInfo(settings).showCashier} onToggle={() => saveSettings('showCashier', !settings.showCashier)} label="اسم الكاشير" />
                  <Toggle on={normalizeReceiptInfo(settings).showTax} onToggle={() => saveSettings('showTax', !settings.showTax)} label="سطر الضريبة" />
                </div>
              </div>
            </div>

            {/* ── Live preview ── */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground text-center">معاينة الإيصال</p>
              <div className="bg-secondary/30 rounded-2xl p-3 max-h-[600px] overflow-auto">
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <ReceiptView
                    orderId="1042"
                    items={previewItems}
                    subtotal={previewSubtotal}
                    tax={previewTax}
                    taxRate={0.14}
                    deliveryFee={previewDeliveryFee}
                    deliveryZoneName="فيصل"
                    deliveryNote="الاتصال قبل التوصيل"
                    deliveryProfileName="كريم"
                    discountAmount={previewDiscount}
                    discountCode="SAVE10"
                    orderNote="بصل كتير"
                    total={previewTotal}
                    orderType="delivery"
                    customerName="أحمد سيد"
                    customerPhone="0100 123 4567"
                    customerAddress="12 شارع الهرم، الجيزة"
                    paymentType="cash"
                    cashierName="محمد علي"
                    createdAt={PREVIEW_DATE}
                    info={normalizeReceiptInfo(settings)}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">معاينة تقريبية — المقاسات على الورق 80mm أو 58mm حسب الإعدادات</p>
            </div>
          </div>
        </div>
          </>
        )}

        {activeTab === 'kitchen' && (
          <>
        {/* Kitchen Stations */}
        <div className="border-2 rounded-2xl bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-orange-400" />
              <h3 className="font-bold text-sm">محطات المطبخ (التوجيه)</h3>
              <span className="text-[10px] bg-orange-500/10 text-orange-400 rounded-full px-2 py-0.5 font-bold">{stations.filter(s => s.active).length} محطة</span>
            </div>
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { setShowStationForm(!showStationForm); setEditingStation(null) }}>
              {showStationForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showStationForm ? 'إغلاق' : 'إضافة محطة'}
            </Button>
          </div>
          <p className="px-4 pt-3 text-[11px] text-muted-foreground">كل محطة = طابعة + أصناف. مثال: مطبخ 1 ← كريب ووجبات، مطبخ 2 ← بيتزا ومشروبات.</p>

          {showStationForm && (
            <div className="p-4 border-b space-y-3 animate-slide-up">
              <div className="grid grid-cols-2 gap-3">
                <input value={stationForm.name} onChange={e => setStationForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المحطة (مثل: مطبخ الكريب)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                <Select value={stationForm.printerName || '__none__'} onValueChange={v => setStationForm(f => ({ ...f, printerName: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="اختار الطابعة لاحقاً…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">اختار الطابعة لاحقاً…</SelectItem>
                    {availableKitchenPrinters(editingStation.id).map((p: any) => <SelectItem key={p.name} value={p.name}>{p.displayName || p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={stationForm.paperWidth} onValueChange={v => setStationForm(f => ({ ...f, paperWidth: v }))}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80mm">ورق 80mm</SelectItem>
                    <SelectItem value="58mm">ورق 58mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-[11px] font-bold text-muted-foreground mb-1.5">الأصناف اللي تطبع في المحطة دي:</p>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c: any) => {
                    const on = stationForm.categoryIds.includes(c.id)
                    return (
                      <button key={c.id} onClick={() => toggleStationCategory(false, null, c.id)}
                        className={cn("px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer border-2 transition-all",
                          on ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/60 text-muted-foreground border-transparent")}>
                        {c.emoji} {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <Button className="w-full rounded-xl" onClick={handleAddStation}>إضافة</Button>
            </div>
          )}

          <div className="p-4 space-y-2">
            {stations.filter(s => s.id !== 'st-receipt').map(s => (
              <div key={s.id} className={cn("rounded-xl p-3 space-y-2", s.active ? "bg-secondary/60" : "bg-secondary/30 opacity-60")}>
                {editingStation?.id === s.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editingStation.name} onChange={e => setEditingStation({ ...editingStation, name: e.target.value })} className="px-2 py-1.5 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                      <Select value={editingStation.printerName || '__none__'} onValueChange={v => setEditingStation({ ...editingStation, printerName: v === '__none__' ? '' : v })}>
                        <SelectTrigger className="rounded-lg py-1.5">
                          <SelectValue placeholder="اختار الطابعة…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">اختار الطابعة…</SelectItem>
                          {printers.map((p: any) => <SelectItem key={p.name} value={p.name}>{p.displayName || p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={editingStation.paperWidth || '80mm'} onValueChange={v => setEditingStation({ ...editingStation, paperWidth: v })}>
                        <SelectTrigger className="rounded-lg py-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="80mm">ورق 80mm</SelectItem>
                          <SelectItem value="58mm">ورق 58mm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((c: any) => {
                        const on = (editingStation.categoryIds || []).includes(c.id)
                        return (
                          <button key={c.id} onClick={() => toggleStationCategory(true, s.id, c.id)}
                            className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer border-2 transition-all",
                              on ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent")}>
                            {c.emoji} {c.name}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-lg" onClick={handleEditStation}>حفظ</Button>
                      {editingStation.printerName && (
                        <Button size="sm" variant="outline" className="rounded-lg text-destructive border-destructive/30" onClick={() => setEditingStation({ ...editingStation, printerName: '' })}>
                          إزالة الطابعة
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setEditingStation(null)}>إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <ChefHat className="h-4 w-4 text-orange-400 shrink-0" />
                      <div className="flex-1 cursor-pointer min-w-0" onClick={() => setEditingStation({ ...s })}>
                        <p className="text-sm font-bold">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{s.printerName || '— مفيش طابعة مربوطة (تختارها لما تشتريها) —'}</p>
                      </div>
                      <button onClick={async () => {
                        try {
                          await updateStation(s.id, { active: !s.active })
                          toast({ title: s.active ? 'تم تعطيل محطة المطبخ' : 'تم تفعيل محطة المطبخ', description: s.name, variant: 'success' })
                        } catch (err: any) {
                          toast({ title: 'فشل تغيير حالة المحطة', description: err?.message || 'حاول مرة أخرى', variant: 'error' })
                        }
                      }}
                        className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 cursor-pointer shrink-0", s.active ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground")}>
                        {s.active ? 'نشطة' : 'معطلة'}
                      </button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive shrink-0" onClick={() => setPendingDelete({ kind: 'station', item: s })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {(s.categoryIds || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mr-7">
                        {(s.categoryIds || []).map((cid: string) => {
                          const c = categories.find((x: any) => x.id === cid)
                          return <span key={cid} className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">{c ? `${c.emoji} ${c.name}` : cid}</span>
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
          </>
        )}

        {activeTab === 'general' && (
          <>
        {/* Appearance */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm">المظهر</h3>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-bold mb-2 block">الوضع</label>
            <div className="flex gap-1.5 bg-secondary/60 p-1 rounded-xl">
              {([['dark', 'داكن', Moon], ['light', 'فاتح', Sun]] as const).map(([mode, label, Icon]) => (
                <button key={mode}
                  onClick={() => { setThemeMode(mode); setThemeModeState(mode) }}
                  className={cn("flex-1 flex items-center justify-center gap-2 min-h-[40px] rounded-lg text-xs font-bold transition-all cursor-pointer",
                    themeMode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-bold mb-2 block">اللون الأساسي</label>
            <div className="flex gap-2 flex-wrap">
              {([['orange', 'برتقالي', 'bg-orange-500'], ['yellow', 'أصفر', 'bg-yellow-400'], ['blue', 'أزرق', 'bg-blue-500'], ['green', 'أخضر', 'bg-green-500'], ['purple', 'بنفسجي', 'bg-purple-500'], ['red', 'أحمر', 'bg-red-500']] as const).map(([color, label, bg]) => (
                <button key={color}
                  onClick={() => { setThemeColor(color); setThemeColorState(color) }}
                  className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-2",
                    themeColor === color ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground")}>
                  <span className={cn("w-4 h-4 rounded-full", bg)} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Delivery Fee & Tax */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm">إعدادات عامة</h3>
          </div>
          <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">نسبة الضريبة (%)</label>
              <input type="number" value={((settings.taxRate || 0) * 100).toFixed(0)} onChange={e => saveSettings('taxRate', parseFloat(e.target.value) / 100 || 0)}
                className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
        </div>
          </>
        )}

        {activeTab === 'delivery' && (
          <>
        {/* Delivery Zones */}
        <div className="border-2 rounded-2xl bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-400" />
              <h3 className="font-bold text-sm">مناطق التوصيل</h3>
              <span className="text-[10px] bg-blue-500/10 text-blue-400 rounded-full px-2 py-0.5 font-bold">{zones.filter(z => z.active).length} منطقة</span>
            </div>
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { setShowZoneForm(!showZoneForm); setEditingZone(null) }}>
              {showZoneForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showZoneForm ? 'إغلاق' : 'إضافة منطقة'}
            </Button>
          </div>

          {showZoneForm && (
            <div className="p-4 border-b space-y-3 animate-slide-up">
              <div className="grid grid-cols-2 gap-3">
                <input value={zoneForm.name} onChange={e => setZoneForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المنطقة (مثل: فيصل)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                <input type="number" value={zoneForm.fee} onChange={e => setZoneForm(f => ({ ...f, fee: e.target.value }))} placeholder="رسوم التوصيل (ج.م)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <Button className="w-full rounded-xl" onClick={handleAddZone}>إضافة</Button>
            </div>
          )}

          <ListToolbar
            search={zoneSearch}
            onSearchChange={value => { setZoneSearch(value); setZonePage(1) }}
            searchPlaceholder="ابحث عن منطقة..."
            filters={[
              { value: null, label: 'الكل', count: zones.length },
              { value: 'active', label: 'نشطة', count: zones.filter(z => z.active).length },
              { value: 'inactive', label: 'معطلة', count: zones.filter(z => !z.active).length },
            ]}
            filterValue={zoneFilter}
            onFilterChange={value => { setZoneFilter(value); setZonePage(1) }}
            view={zoneView}
            onViewChange={setZoneView}
            className="px-4"
          />
          {zoneView === 'table' ? (
            <DataTable
              data={visibleZones}
              keyExtractor={z => z.id}
              columns={[
                { key: 'name', label: 'المنطقة', render: z => <span className="font-bold">{z.name}</span> },
                { key: 'fee', label: 'الرسوم', render: z => `${fmtMoney(z.fee)} ج.م` },
                {
                  key: 'status',
                  label: 'الحالة',
                  render: z => (
                    <button
                      onClick={() => updateZone(z.id, { active: !z.active })}
                      className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5 cursor-pointer transition-colors border",
                        z.active ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" : "bg-secondary text-muted-foreground border-border")}
                      title="اضغط للتبديل بين نشطة ومعطلة"
                    >
                      {z.active ? 'نشطة' : 'معطلة'}
                    </button>
                  )
                },
                {
                  key: 'actions',
                  label: 'إجراءات',
                  className: 'text-left',
                  render: z => (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditingZone({ ...z }); if (zoneView === 'table') setZoneView('cards') }} title="تعديل">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'zone', item: z })} title="حذف">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                },
              ]}
              className="mx-4 mb-4"
            />
          ) : <div className="p-4 space-y-2">
            {visibleZones.map(z => (
              <div key={z.id} className={cn("flex items-center gap-3 rounded-xl p-3", z.active ? "bg-secondary/60" : "bg-secondary/30 opacity-60")}>
                <Truck className="h-4 w-4 text-blue-400 shrink-0" />
                {editingZone?.id === z.id ? (
                  <div className="flex-1 flex gap-2">
                    <input value={editingZone.name} onChange={e => setEditingZone({ ...editingZone, name: e.target.value })} className="flex-1 px-2 py-1.5 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                    <input type="number" value={editingZone.fee} onChange={e => setEditingZone({ ...editingZone, fee: e.target.value })} className="w-20 px-2 py-1.5 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
                    <Button size="sm" className="rounded-lg" onClick={handleEditZone}>حفظ</Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setEditingZone(null)}>إلغاء</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 cursor-pointer" onClick={() => setEditingZone({ ...z })}>
                      <p className="text-sm font-bold">{z.name}</p>
                      <p className="text-[10px] text-muted-foreground">{z.active ? 'نشطة' : 'معطلة'} — اضغط للتعديل</p>
                    </div>
                    <span className="text-sm font-black text-blue-400">{fmtMoney(z.fee)} ج.م</span>
                    <button onClick={() => updateZone(z.id, { active: !z.active })}
                      className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 cursor-pointer", z.active ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground")}>
                      {z.active ? 'نشطة' : 'معطلة'}
                    </button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'zone', item: z })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {filteredZones.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">لا توجد مناطق مطابقة</p>}
          </div>
          }
          <Pagination
            page={zonePage}
            totalPages={zonePages}
            total={filteredZones.length}
            start={(zonePage - 1) * settingsPageSize}
            end={Math.min(zonePage * settingsPageSize, filteredZones.length)}
            onPageChange={setZonePage}
            pageSize={settingsPageSize}
          />
        </div>

        {/* Delivery Profiles */}
        <div className="border-2 rounded-2xl bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-green-500" />
              <h3 className="font-bold text-sm">ديلفري</h3>
              <span className="text-[10px] bg-green-500/10 text-green-500 rounded-full px-2 py-0.5 font-bold">{profiles.filter(p => p.active).length} شخص</span>
            </div>
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { setShowProfileForm(!showProfileForm); setEditingProfile(null) }}>
              {showProfileForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showProfileForm ? 'إغلاق' : 'إضافة ديلفري'}
            </Button>
          </div>

          {showProfileForm && (
            <div className="p-4 border-b space-y-3 animate-slide-up">
              <div className="grid grid-cols-2 gap-3">
                <input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} placeholder="الاسم (مثل: أحمد)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="رقم التليفون (اختياري)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="ltr" />
              </div>
              <Button className="w-full rounded-xl" onClick={handleAddProfile}>إضافة</Button>
            </div>
          )}

          <div className="p-4 space-y-2">
            {profiles.map(p => (
              <div key={p.id} className={cn("flex items-center gap-3 rounded-xl p-3", p.active ? "bg-secondary/60" : "bg-secondary/30 opacity-60")}>
                <User className="h-4 w-4 text-green-500 shrink-0" />
                {editingProfile?.id === p.id ? (
                  <div className="flex-1 flex gap-2">
                    <input value={editingProfile.name} onChange={e => setEditingProfile({ ...editingProfile, name: e.target.value })} className="flex-1 px-2 py-1.5 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                    <input value={editingProfile.phone || ''} onChange={e => setEditingProfile({ ...editingProfile, phone: e.target.value })} className="w-32 px-2 py-1.5 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="ltr" />
                    <Button size="sm" className="rounded-lg" onClick={handleEditProfile}>حفظ</Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setEditingProfile(null)}>إلغاء</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 cursor-pointer" onClick={() => setEditingProfile({ ...p })}>
                      <p className="text-sm font-bold">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.phone || '—'} · {p.active ? 'نشط' : 'معطل'} — اضغط للتعديل</p>
                    </div>
                    <button onClick={() => updateProfile(p.id, { active: !p.active })}
                      className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 cursor-pointer", p.active ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground")}>
                      {p.active ? 'نشط' : 'معطل'}
                    </button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'profile', item: p })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {profiles.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">لا يوجد ديلفري — أضف عشان الكاشير يختار منهم</p>}
          </div>
        </div>
          </>
        )}

        {activeTab === 'sales' && (
          <>
        {/* Discount Codes */}
        <div className="border-2 rounded-2xl bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-green-500" />
              <h3 className="font-bold text-sm">أكواد الخصم</h3>
              <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 rounded-full px-2 py-0.5 font-bold">
                {discounts.filter(d => d.active).length} نشط
              </span>
            </div>
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => {
              if (showDiscountForm || editingDiscount) {
                setShowDiscountForm(false)
                setEditingDiscount(null)
              } else {
                setDiscountForm({ code: '', type: 'percentage', value: '', maxUses: '' })
                setShowDiscountForm(true)
              }
            }}>
              {(showDiscountForm || editingDiscount) ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {(showDiscountForm || editingDiscount) ? 'إغلاق' : 'إضافة كود'}
            </Button>
          </div>

          {(showDiscountForm || editingDiscount) && (
            <div className="p-4 border-b space-y-3 animate-slide-up bg-secondary/20">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-muted-foreground">
                  {editingDiscount ? `تعديل كود الخصم: ${editingDiscount.code}` : 'إضافة كود خصم جديد'}
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={editingDiscount ? editingDiscount.code : discountForm.code}
                  onChange={e => editingDiscount ? setEditingDiscount({ ...editingDiscount, code: e.target.value.toUpperCase() }) : setDiscountForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="الكود (مثل SAVE10)"
                  className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none uppercase font-mono font-bold"
                />
                <Select
                  value={editingDiscount ? editingDiscount.type : discountForm.type}
                  onValueChange={v => editingDiscount ? setEditingDiscount({ ...editingDiscount, type: v }) : setDiscountForm(f => ({ ...f, type: v }))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">نسبة مئوية (%)</SelectItem>
                    <SelectItem value="fixed">مبلغ ثابت (ج.م)</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="number"
                  value={editingDiscount ? editingDiscount.value : discountForm.value}
                  onChange={e => editingDiscount ? setEditingDiscount({ ...editingDiscount, value: e.target.value }) : setDiscountForm(f => ({ ...f, value: e.target.value }))}
                  placeholder={(editingDiscount ? editingDiscount.type : discountForm.type) === 'percentage' ? 'النسبة (مثل 10)' : 'المبلغ (مثل 20)'}
                  className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <input
                  type="number"
                  value={editingDiscount ? (editingDiscount.maxUses ?? '') : discountForm.maxUses}
                  onChange={e => editingDiscount ? setEditingDiscount({ ...editingDiscount, maxUses: e.target.value }) : setDiscountForm(f => ({ ...f, maxUses: e.target.value }))}
                  placeholder="حد الاستخدام (0 = بلا حد)"
                  className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 rounded-xl" onClick={editingDiscount ? handleUpdateDiscount : handleAddDiscount}>
                  {editingDiscount ? 'تحديث الكود' : 'إضافة الكود'}
                </Button>
                {editingDiscount && (
                  <Button variant="ghost" className="rounded-xl" onClick={() => setEditingDiscount(null)}>إلغاء</Button>
                )}
              </div>
            </div>
          )}

          <ListToolbar
            search={discountSearch}
            onSearchChange={value => { setDiscountSearch(value); setDiscountPage(1) }}
            searchPlaceholder="ابحث عن كود خصم..."
            filters={[
              { value: null, label: 'الكل', count: discounts.length },
              { value: 'active', label: 'نشطة', count: discounts.filter(d => d.active).length },
              { value: 'inactive', label: 'معطلة', count: discounts.filter(d => !d.active).length },
            ]}
            filterValue={discountFilter}
            onFilterChange={value => { setDiscountFilter(value); setDiscountPage(1) }}
            view={discountView}
            onViewChange={setDiscountView}
            className="px-4"
          />
          {discountView === 'table' ? (
            <DataTable
              data={visibleDiscounts}
              keyExtractor={d => d.id}
              columns={[
                { key: 'code', label: 'الكود', render: d => <span className="font-mono font-bold">{d.code}</span> },
                { key: 'value', label: 'القيمة', render: d => d.type === 'percentage' ? `${d.value}%` : `${d.value} ج.م` },
                {
                  key: 'usage',
                  label: 'الاستخدام',
                  render: d => d.maxUses > 0 ? `${d.usedCount} / ${d.maxUses} (متبقي ${d.maxUses - d.usedCount})` : `${d.usedCount} (بلا حد)`
                },
                {
                  key: 'status',
                  label: 'الحالة',
                  render: d => (
                    <button
                      onClick={() => handleToggleDiscountActive(d)}
                      className={cn(
                        "text-[10px] font-bold rounded-full px-2.5 py-0.5 cursor-pointer transition-colors border",
                        d.active
                          ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20"
                          : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
                      )}
                      title="اضغط للتبديل بين نشط ومعطل"
                    >
                      {d.active ? 'نشط' : 'معطل'}
                    </button>
                  )
                },
                {
                  key: 'actions',
                  label: 'إجراءات',
                  className: 'text-left',
                  render: d => (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditingDiscount({ ...d }); setShowDiscountForm(false) }} title="تعديل">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'discount', item: d })} title="حذف">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                },
              ]}
              className="mx-4 mb-4"
            />
          ) : <div className="p-4 space-y-2">
            {visibleDiscounts.map(d => (
              <div key={d.id} className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
                <Tag className="h-4 w-4 text-green-500 shrink-0" />
                <div className="flex-1 cursor-pointer" onClick={() => { setEditingDiscount({ ...d }); setShowDiscountForm(false) }}>
                  <p className="text-sm font-bold font-mono">{d.code}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.type === 'percentage' ? `${d.value}%` : `${d.value} ج.م`}
                    {d.maxUses > 0 ? ` — متبقي ${d.maxUses - d.usedCount} استخدام` : ' — بلا حد'}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleDiscountActive(d)}
                  className={cn(
                    "text-[10px] font-bold rounded-full px-2.5 py-0.5 cursor-pointer transition-colors border",
                    d.active
                      ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20"
                      : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
                  )}
                  title="اضغط للتبديل بين نشط ومعطل"
                >
                  {d.active ? 'نشط' : 'معطل'}
                </button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditingDiscount({ ...d }); setShowDiscountForm(false) }} title="تعديل">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'discount', item: d })} title="حذف">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {filteredDiscounts.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">لا توجد أكواد خصم مطابقة</p>}
          </div>
          }
          <Pagination
            page={discountPage}
            totalPages={discountPages}
            total={filteredDiscounts.length}
            start={(discountPage - 1) * settingsPageSize}
            end={Math.min(discountPage * settingsPageSize, filteredDiscounts.length)}
            onPageChange={setDiscountPage}
            pageSize={settingsPageSize}
          />
        </div>

        {/* Expenses */}
        <div className="border-2 rounded-2xl bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-red-400" />
              <h3 className="font-bold text-sm">المصروفات الثابتة</h3>
              <span className="text-[10px] bg-red-500/10 text-red-400 rounded-full px-2 py-0.5 font-bold">{totalExpenses.toLocaleString()} ج.م/شهر</span>
            </div>
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => {
              if (showExpenseForm || editingExpense) {
                setShowExpenseForm(false)
                setEditingExpense(null)
              } else {
                setExpenseForm({ name: '', category: 'رواتب', amount: '', type: 'monthly' })
                setShowExpenseForm(true)
              }
            }}>
              {(showExpenseForm || editingExpense) ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {(showExpenseForm || editingExpense) ? 'إغلاق' : 'إضافة مصروف'}
            </Button>
          </div>

          {(showExpenseForm || editingExpense) && (
            <div className="p-4 border-b space-y-3 animate-slide-up bg-secondary/20">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-muted-foreground">
                  {editingExpense ? `تعديل المصروف: ${editingExpense.name}` : 'إضافة مصروف جديد'}
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={editingExpense ? editingExpense.name : expenseForm.name}
                  onChange={e => editingExpense ? setEditingExpense({ ...editingExpense, name: e.target.value }) : setExpenseForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="اسم المصروف"
                  className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none"
                  dir="rtl"
                />
                <Select
                  value={editingExpense ? editingExpense.category : expenseForm.category}
                  onValueChange={v => editingExpense ? setEditingExpense({ ...editingExpense, category: v }) : setExpenseForm(f => ({ ...f, category: v }))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="رواتب">رواتب</SelectItem>
                    <SelectItem value="إيجار">إيجار</SelectItem>
                    <SelectItem value="مرافق">مرافق</SelectItem>
                    <SelectItem value="صيانة">صيانة</SelectItem>
                    <SelectItem value="أخرى">أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <input
                type="number"
                value={editingExpense ? editingExpense.amount : expenseForm.amount}
                onChange={e => editingExpense ? setEditingExpense({ ...editingExpense, amount: e.target.value }) : setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="المبلغ الشهري (ج.م)"
                className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <div className="flex gap-2">
                <Button className="flex-1 rounded-xl" onClick={editingExpense ? handleUpdateExpense : handleAddExpense}>
                  {editingExpense ? 'تحديث المصروف' : 'إضافة المصروف'}
                </Button>
                {editingExpense && (
                  <Button variant="ghost" className="rounded-xl" onClick={() => setEditingExpense(null)}>إلغاء</Button>
                )}
              </div>
            </div>
          )}

          <ListToolbar
            search={expenseSearch}
            onSearchChange={value => { setExpenseSearch(value); setExpensePage(1) }}
            searchPlaceholder="ابحث عن مصروف..."
            filters={[
              { value: null, label: 'الكل', count: expenses.length },
              ...['رواتب', 'إيجار', 'مرافق', 'صيانة', 'أخرى'].map(value => ({
                value,
                label: value,
                count: expenses.filter(e => e.category === value).length,
              })),
            ]}
            filterValue={expenseFilter}
            onFilterChange={value => { setExpenseFilter(value); setExpensePage(1) }}
            view={expenseView}
            onViewChange={setExpenseView}
            className="px-4"
          />
          {expenseView === 'table' ? (
            <DataTable
              data={visibleExpenses}
              keyExtractor={e => e.id}
              columns={[
                { key: 'name', label: 'المصروف', render: e => <span className="font-bold">{e.name}</span> },
                { key: 'category', label: 'الفئة', render: e => e.category },
                { key: 'amount', label: 'المبلغ', render: e => `${fmtMoney(e.amount)} ج.م` },
                {
                  key: 'actions',
                  label: 'إجراءات',
                  className: 'text-left',
                  render: e => (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditingExpense({ ...e }); setShowExpenseForm(false) }} title="تعديل">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'expense', item: e })} title="حذف">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                },
              ]}
              className="mx-4 mb-4"
            />
          ) : <div className="p-4 space-y-2">
            {visibleExpenses.map(e => (
              <div key={e.id} className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
                <DollarSign className="h-4 w-4 text-red-400 shrink-0" />
                <div className="flex-1 cursor-pointer" onClick={() => { setEditingExpense({ ...e }); setShowExpenseForm(false) }}>
                  <p className="text-sm font-bold">{e.name}</p>
                  <p className="text-[10px] text-muted-foreground">{e.category}</p>
                </div>
                <span className="text-sm font-black text-red-400">{fmtMoney(e.amount)} ج.م</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditingExpense({ ...e }); setShowExpenseForm(false) }} title="تعديل">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'expense', item: e })} title="حذف">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {filteredExpenses.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">لا توجد مصروفات مطابقة</p>}
          </div>
          }
          <Pagination
            page={expensePage}
            totalPages={expensePages}
            total={filteredExpenses.length}
            start={(expensePage - 1) * settingsPageSize}
            end={Math.min(expensePage * settingsPageSize, filteredExpenses.length)}
            onPageChange={setExpensePage}
            pageSize={settingsPageSize}
          />
        </div>
          </>
        )}

        {activeTab === 'system' && (
          <>
        {/* App updates */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm">تحديثات التطبيق</h3>
          </div>
          <p className="text-xs text-muted-foreground">يتحقق التطبيق تلقائياً من التحديثات عند التشغيل ويثبتها عند إعادة التشغيل.</p>
          <UpdateCheckRow />
        </div>

        {/* Backup */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm">النسخ الاحتياطي</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {backupStatus?.lastBackup ? `آخر نسخة: ${backupStatus.lastBackup}` : 'آخر نسخة: لا توجد'}
            {backupStatus?.backupCount ? ` — عدد النسخ: ${backupStatus.backupCount}` : ''}
          </p>
          <Button size="sm" className="rounded-xl" onClick={handleBackup} disabled={backupBusy}>
            {backupBusy ? 'جارٍ النسخ...' : 'نسخ احتياطي الآن'}
          </Button>
          {backupMessage && <p className={cn("text-xs font-bold", backupMessage.includes('فشل') ? "text-red-400" : "text-green-400")}>{backupMessage}</p>}
        </div>

        {/* Sync */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-400" />
            <h3 className="font-bold text-sm">المزامنة</h3>
          </div>
          <p className="text-xs text-muted-foreground">غير متصل</p>
          <Button size="sm" variant="outline" className="rounded-xl">إعداد المزامنة</Button>
        </div>
          </>
        )}

        </div>
      </ScrollArea>

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.kind === 'discount' ? 'حذف كود الخصم' : pendingDelete?.kind === 'zone' ? 'تعطيل منطقة التوصيل' : pendingDelete?.kind === 'station' ? 'تعطيل المحطة' : pendingDelete?.kind === 'profile' ? 'تعطيل الديلفري' : 'حذف المصروف'}
        description={pendingDelete ? (pendingDelete.kind === 'discount' ? `سيتم حذف «${pendingDelete.item.code}» نهائياً.` : pendingDelete.kind === 'zone' ? `سيتم تعطيل منطقة «${pendingDelete.item.name}» — مش هتظهر للكاشير.` : pendingDelete.kind === 'station' ? `سيتم تعطيل محطة «${pendingDelete.item.name}» — أصنافها مش هتتطبع في المطبخ.` : pendingDelete.kind === 'profile' ? `سيتم تعطيل «${pendingDelete.item.name}» — مش هتظهر للكاشير.` : `سيتم حذف «${pendingDelete.item.name}» نهائياً.`) : undefined}
        allowHardDelete={isAdmin}
        hardDeleteDescription="يحذف العنصر نهائياً من قاعدة البيانات. لن يمكن استرجاعه."
        onConfirm={async ({ hard }) => {
          if (!pendingDelete) return
          const opts = { hard }
          const p = pendingDelete
          try {
            if (p.kind === 'discount') await window.api.discountCode.delete(p.item.id, opts)
            else if (p.kind === 'zone') await removeZone(p.item.id, opts)
            else if (p.kind === 'station') await removeStation(p.item.id, opts)
            else if (p.kind === 'profile') await removeProfile(p.item.id, opts)
            else await window.api.expense.delete(p.item.id, opts)
            toast({ title: 'تم الحذف بنجاح', variant: 'success' })
            await load()
          } catch (err: any) {
            toast({ title: 'فشل الحذف', description: err?.message || 'حدث خطأ أثناء الحذف', variant: 'error' })
          } finally {
            setPendingDelete(null)
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function UpdateCheckRow() {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!window.updater?.onStatus) return
    return window.updater.onStatus((s) => setStatus(s.status))
  }, [])

  const handleCheck = async () => {
    setBusy(true)
    setMsg('')
    try {
      const res = await window.updater?.check()
      if (!res?.ok) {
        setMsg(res?.error === 'dev' ? 'وضع التطوير — التحديثات تعمل في النسخة المثبتة فقط' : 'تعذر التحقق — تحقق من الاتصال بالإنترنت')
      } else if (res.version) {
        setMsg(`يوجد تحديث ${res.version} — جارٍ التحميل…`)
      } else {
        setMsg('أنت على أحدث نسخة')
      }
    } catch {
      setMsg('تعذر التحقق — حاول لاحقاً')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" className="rounded-xl gap-1.5" onClick={handleCheck} disabled={busy}>
        <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
        {busy ? 'جارٍ التحقق…' : 'التحقق من التحديثات'}
      </Button>
      {(msg || status === 'downloading' || status === 'downloaded') && (
        <p className="text-xs font-bold text-muted-foreground">{msg || (status === 'downloaded' ? 'التحديث جاهز — أعد التشغيل من الشريط العلوي' : 'جارٍ التحميل في الخلفية…')}</p>
      )}
    </div>
  )
}
