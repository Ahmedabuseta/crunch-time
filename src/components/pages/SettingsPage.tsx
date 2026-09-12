import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Database, Cloud, Settings, Tag, DollarSign, Receipt, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const [settings, setSettings] = useState<any>({})
  const [discounts, setDiscounts] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [showDiscountForm, setShowDiscountForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [discountForm, setDiscountForm] = useState({ code: '', type: 'percentage', value: '', maxUses: '' })
  const [expenseForm, setExpenseForm] = useState({ name: '', category: 'رواتب', amount: '', type: 'monthly' })

  const load = async () => {
    const [s, d, e] = await Promise.all([
      window.api.settings.get(),
      window.api.discountCode.list(),
      window.api.expense.list(),
    ])
    setSettings(s)
    setDiscounts(d)
    setExpenses(e)
  }

  useEffect(() => { load() }, [])

  const saveSettings = async (key: string, value: any) => {
    await window.api.settings.update({ [key]: value })
    load()
  }

  const handleAddDiscount = () => {
    if (!discountForm.code || !discountForm.value) return
    window.api.discountCode.create({ code: discountForm.code.toUpperCase(), type: discountForm.type, value: parseFloat(discountForm.value), maxUses: parseInt(discountForm.maxUses) || 0 })
    setDiscountForm({ code: '', type: 'percentage', value: '', maxUses: '' })
    setShowDiscountForm(false)
    load()
  }

  const handleAddExpense = () => {
    if (!expenseForm.name || !expenseForm.amount) return
    window.api.expense.create({ name: expenseForm.name, category: expenseForm.category, amount: parseFloat(expenseForm.amount), type: expenseForm.type })
    setExpenseForm({ name: '', category: 'رواتب', amount: '', type: 'monthly' })
    setShowExpenseForm(false)
    load()
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b">
        <h2 className="text-base font-black">الإعدادات</h2>
      </div>
      <ScrollArea className="flex-1 p-5 space-y-5">

        {/* Delivery Fee & Tax */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm">إعدادات عامة</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">رسوم التوصيل (ج.م)</label>
              <input type="number" value={settings.deliveryFee || ''} onChange={e => saveSettings('deliveryFee', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">نسبة الضريبة (%)</label>
              <input type="number" value={((settings.taxRate || 0) * 100).toFixed(0)} onChange={e => saveSettings('taxRate', parseFloat(e.target.value) / 100 || 0)}
                className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
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
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => { window.api.discountCode.delete(d.id); load() }}>
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
                <span className="text-sm font-black text-red-400">{e.amount.toLocaleString()} ج.م</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => { window.api.expense.delete(e.id); load() }}>
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
          <p className="text-xs text-muted-foreground">آخر نسخة: لا توجد</p>
          <Button size="sm" className="rounded-xl">نسخ احتياطي الآن</Button>
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
    </div>
  )
}
