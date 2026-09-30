import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Database, Cloud, Settings, Tag, DollarSign, Receipt, Plus, Trash2, X, Truck, Printer, ChefHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeliveryStore, useStationStore } from '@/services/delivery/delivery.store'

export function SettingsPage() {
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
  const [discountForm, setDiscountForm] = useState({ code: '', type: 'percentage', value: '', maxUses: '' })
  const [expenseForm, setExpenseForm] = useState({ name: '', category: 'رواتب', amount: '', type: 'monthly' })
  const [backupStatus, setBackupStatus] = useState<any>({ lastBackup: null, backupCount: 0 })
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'discount' | 'expense' | 'zone' | 'station'; item: any } | null>(null)
  const saveTimer = useRef<any>(null)

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
  }

  useEffect(() => { load() }, [])

  const saveSettings = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.api.settings.update({ [key]: value })
    }, 500)
  }

  const handleAddDiscount = async () => {
    if (!discountForm.code || !discountForm.value) return
    await window.api.discountCode.create({ code: discountForm.code.toUpperCase(), type: discountForm.type, value: parseFloat(discountForm.value), maxUses: parseInt(discountForm.maxUses) || 0 })
    setDiscountForm({ code: '', type: 'percentage', value: '', maxUses: '' })
    setShowDiscountForm(false)
    await load()
  }

  const handleAddExpense = async () => {
    if (!expenseForm.name || !expenseForm.amount) return
    await window.api.expense.create({ name: expenseForm.name, category: expenseForm.category, amount: parseFloat(expenseForm.amount), type: expenseForm.type })
    setExpenseForm({ name: '', category: 'رواتب', amount: '', type: 'monthly' })
    setShowExpenseForm(false)
    await load()
  }

  const handleAddZone = async () => {
    if (!zoneForm.name.trim() || !zoneForm.fee) return
    await createZone({ name: zoneForm.name.trim(), fee: parseFloat(zoneForm.fee) || 0 })
    setZoneForm({ name: '', fee: '' })
    setShowZoneForm(false)
  }

  const handleEditZone = async () => {
    if (!editingZone || !editingZone.name.trim()) return
    await updateZone(editingZone.id, { name: editingZone.name.trim(), fee: parseFloat(editingZone.fee) || 0 })
    setEditingZone(null)
  }

  const handleAddStation = async () => {
    if (!stationForm.name.trim()) return
    await createStation({ name: stationForm.name.trim(), printerName: stationForm.printerName || undefined, paperWidth: stationForm.paperWidth, categoryIds: stationForm.categoryIds })
    setStationForm({ name: '', printerName: '', paperWidth: '80mm', categoryIds: [] })
    setShowStationForm(false)
  }

  const handleEditStation = async () => {
    if (!editingStation || !editingStation.name.trim()) return
    await updateStation(editingStation.id, {
      name: editingStation.name.trim(),
      printerName: editingStation.printerName || null,
      paperWidth: editingStation.paperWidth || '80mm',
      categoryIds: editingStation.categoryIds || [],
    })
    setEditingStation(null)
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
      setPrintMsg(res?.ok ? '✅ اتبعتت — بص على الطابعة' : `❌ ${res?.error || 'فشلت الطباعة'}`)
    } catch (err: any) {
      setPrintMsg(`❌ ${err?.message || 'فشلت الطباعة'}`)
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

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b">
        <h2 className="text-base font-black">الإعدادات</h2>
      </div>
      <ScrollArea className="flex-1 p-5 space-y-5">

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
              <select value={settings.receiptPrinter || ''} onChange={e => saveSettings('receiptPrinter', e.target.value || null)}
                className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                <option value="">الطابعة الافتراضية</option>
                {printers.map((p: any) => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">مقاس ورق الإيصال</label>
              <select value={settings.receiptWidth || '80mm'} onChange={e => saveSettings('receiptWidth', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </select>
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
          </div>
        </div>

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
                <select value={stationForm.printerName} onChange={e => setStationForm(f => ({ ...f, printerName: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                  <option value="">اختار الطابعة لاحقاً…</option>
                  {printers.map((p: any) => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
                </select>
                <select value={stationForm.paperWidth} onChange={e => setStationForm(f => ({ ...f, paperWidth: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                  <option value="80mm">ورق 80mm</option>
                  <option value="58mm">ورق 58mm</option>
                </select>
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
                      <select value={editingStation.printerName || ''} onChange={e => setEditingStation({ ...editingStation, printerName: e.target.value })}
                        className="px-2 py-1.5 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                        <option value="">اختار الطابعة…</option>
                        {printers.map((p: any) => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
                      </select>
                      <select value={editingStation.paperWidth || '80mm'} onChange={e => setEditingStation({ ...editingStation, paperWidth: e.target.value })}
                        className="px-2 py-1.5 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                        <option value="80mm">ورق 80mm</option>
                        <option value="58mm">ورق 58mm</option>
                      </select>
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
                      <button onClick={() => updateStation(s.id, { active: !s.active })}
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

        {/* Delivery Fee & Tax */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm">إعدادات عامة</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">رسوم التوصيل الافتراضية (ج.م)</label>
              <input type="number" value={settings.deliveryFee || ''} onChange={e => saveSettings('deliveryFee', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
              <p className="text-[10px] text-muted-foreground mt-1">تُستخدم فقط لو مفيش مناطق توصيل معرفة</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">نسبة الضريبة (%)</label>
              <input type="number" value={((settings.taxRate || 0) * 100).toFixed(0)} onChange={e => saveSettings('taxRate', parseFloat(e.target.value) / 100 || 0)}
                className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
          </div>
        </div>

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

          <div className="p-4 space-y-2">
            {zones.map(z => (
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
            {zones.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">لا توجد مناطق توصيل — أضف منطقة عشان الكاشير يختار منها</p>}
          </div>
        </div>

        {/* Discount Codes */}
        <div className="border-2 rounded-2xl bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-green-500" />
              <h3 className="font-bold text-sm">أكواد الخصم</h3>
            </div>
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowDiscountForm(!showDiscountForm)}>
              {showDiscountForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showDiscountForm ? 'إغلاق' : 'إضافة كود'}
            </Button>
          </div>

          {showDiscountForm && (
            <div className="p-4 border-b space-y-3 animate-slide-up">
              <div className="grid grid-cols-2 gap-3">
                <input value={discountForm.code} onChange={e => setDiscountForm(f => ({ ...f, code: e.target.value }))} placeholder="الكود (مثل SAVE10)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none uppercase" />
                <select value={discountForm.type} onChange={e => setDiscountForm(f => ({ ...f, type: e.target.value }))} className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                  <option value="percentage">نسبة مئوية (%)</option>
                  <option value="fixed">مبلغ ثابت (ج.م)</option>
                </select>
                <input type="number" value={discountForm.value} onChange={e => setDiscountForm(f => ({ ...f, value: e.target.value }))} placeholder={discountForm.type === 'percentage' ? 'النسبة (مثل 10)' : 'المبلغ (مثل 20)'} className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
                <input type="number" value={discountForm.maxUses} onChange={e => setDiscountForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="حد الاستخدام (0 = بلا حد)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <Button className="w-full rounded-xl" onClick={handleAddDiscount}>إضافة</Button>
            </div>
          )}

          <div className="p-4 space-y-2">
            {discounts.map(d => (
              <div key={d.id} className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
                <Tag className="h-4 w-4 text-green-500" />
                <div className="flex-1">
                  <p className="text-sm font-bold font-mono">{d.code}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.type === 'percentage' ? `${d.value}%` : `${d.value} ج.م`}
                    {d.maxUses > 0 ? ` — متبقي ${d.maxUses - d.usedCount} استخدام` : ' — بلا حد'}
                  </p>
                </div>
                <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", d.active ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground")}>
                  {d.active ? 'نشط' : 'معطل'}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'discount', item: d })}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {discounts.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">لا توجد أكواد خصم</p>}
          </div>
        </div>

        {/* Expenses */}
        <div className="border-2 rounded-2xl bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-red-400" />
              <h3 className="font-bold text-sm">المصروفات الثابتة</h3>
              <span className="text-[10px] bg-red-500/10 text-red-400 rounded-full px-2 py-0.5 font-bold">{totalExpenses.toLocaleString()} ج.م/شهر</span>
            </div>
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowExpenseForm(!showExpenseForm)}>
              {showExpenseForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showExpenseForm ? 'إغلاق' : 'إضافة مصروف'}
            </Button>
          </div>

          {showExpenseForm && (
            <div className="p-4 border-b space-y-3 animate-slide-up">
              <div className="grid grid-cols-2 gap-3">
                <input value={expenseForm.name} onChange={e => setExpenseForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المصروف" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))} className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                  <option value="رواتب">رواتب</option>
                  <option value="إيجار">إيجار</option>
                  <option value="مرافق">مرافق</option>
                  <option value="صيانة">صيانة</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>
              <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} placeholder="المبلغ الشهري (ج.م)" className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
              <Button className="w-full rounded-xl" onClick={handleAddExpense}>إضافة</Button>
            </div>
          )}

          <div className="p-4 space-y-2">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
                <DollarSign className="h-4 w-4 text-red-400" />
                <div className="flex-1">
                  <p className="text-sm font-bold">{e.name}</p>
                  <p className="text-[10px] text-muted-foreground">{e.category}</p>
                </div>
                <span className="text-sm font-black text-red-400">{fmtMoney(e.amount)} ج.م</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'expense', item: e })}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
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
      </ScrollArea>

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.kind === 'discount' ? 'حذف كود الخصم' : pendingDelete?.kind === 'zone' ? 'تعطيل منطقة التوصيل' : pendingDelete?.kind === 'station' ? 'تعطيل المحطة' : 'حذف المصروف'}
        description={pendingDelete ? (pendingDelete.kind === 'discount' ? `سيتم حذف «${pendingDelete.item.code}» نهائياً.` : pendingDelete.kind === 'zone' ? `سيتم تعطيل منطقة «${pendingDelete.item.name}» — مش هتظهر للكاشير.` : pendingDelete.kind === 'station' ? `سيتم تعطيل محطة «${pendingDelete.item.name}» — أصنافها مش هتتطبع في المطبخ.` : `سيتم حذف «${pendingDelete.item.name}» نهائياً.`) : undefined}
        onConfirm={() => {
          if (!pendingDelete) return
          if (pendingDelete.kind === 'discount') window.api.discountCode.delete(pendingDelete.item.id)
          else if (pendingDelete.kind === 'zone') removeZone(pendingDelete.item.id)
          else if (pendingDelete.kind === 'station') removeStation(pendingDelete.item.id)
          else window.api.expense.delete(pendingDelete.item.id)
          load()
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
