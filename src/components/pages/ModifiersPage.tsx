import { Fragment, useEffect, useState } from 'react'
import { useModifierStore } from '@/services/modifier/modifier.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { RecipePanel } from './RecipePanel'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, X, Link } from 'lucide-react'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fmtMoney } from '@/lib/format'
import type { ViewMode } from '@/components/ui/view-toggle'

export function ModifiersPage() {
  const groups = useModifierStore((s) => s.groups)
  const fetchGroups = useModifierStore((s) => s.fetchGroups)
  const createGroup = useModifierStore((s) => s.createGroup)
  const updateGroup = useModifierStore((s) => s.updateGroup)
  const removeGroup = useModifierStore((s) => s.removeGroup)
  const createModifier = useModifierStore((s) => s.createModifier)
  const updateModifier = useModifierStore((s) => s.updateModifier)
  const removeModifier = useModifierStore((s) => s.removeModifier)
  const ingredients = useInventoryStore((s) => s.ingredients)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)

  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState({ name: '', type: 'single-select' })
  const [addGroupTo, setAddGroupTo] = useState<string | null>(null)
  const [editModId, setEditModId] = useState<string | null>(null)
  const [modForm, setModForm] = useState({ name: '', priceAdjustment: '' })
  const [recipeFor, setRecipeFor] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('table')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'group' | 'modifier'; item: any } | null>(null)

  useEffect(() => { fetchGroups(); fetchIngredients() }, [])

  const list = useListControls({
    items: groups,
    searchText: (g) => `${g.name} ${g.modifiers.map(m => m.name).join(' ')} ${g.type === 'single-select' ? 'اختيار واحد' : 'اختيار متعدد'}`,
    filter: (g) => !typeFilter || g.type === typeFilter,
  })

  const resetGroupForm = () => { setGroupForm({ name: '', type: 'single-select' }); setEditGroupId(null); setShowGroupForm(false) }
  const resetModForm = () => { setModForm({ name: '', priceAdjustment: '' }); setAddGroupTo(null); setEditModId(null) }

  const handleCreateGroup = async () => {
    if (!groupForm.name) return
    await createGroup({ name: groupForm.name, type: groupForm.type })
    toast({ title: 'تم إنشاء مجموعة الموديفاير', description: groupForm.name, variant: 'success' })
    resetGroupForm()
  }

  const handleUpdateGroup = async () => {
    if (!editGroupId || !groupForm.name) return
    await updateGroup(editGroupId, { name: groupForm.name, type: groupForm.type })
    toast({ title: 'تم تحديث المجموعة', description: groupForm.name, variant: 'success' })
    resetGroupForm()
  }

  const handleCreateModifier = async (groupId: string) => {
    if (!modForm.name) return
    await createModifier({ modifierGroupId: groupId, name: modForm.name, priceAdjustment: parseFloat(modForm.priceAdjustment) || 0 })
    toast({ title: 'تم إضافة الخيار', description: modForm.name, variant: 'success' })
    resetModForm()
  }

  const handleUpdateModifier = async () => {
    if (!editModId || !modForm.name) return
    await updateModifier(editModId, { name: modForm.name, priceAdjustment: parseFloat(modForm.priceAdjustment) || 0 })
    toast({ title: 'تم تحديث الخيار', description: modForm.name, variant: 'success' })
    resetModForm()
  }

  const startEditGroup = (g: any) => {
    setEditGroupId(g.id); setShowGroupForm(false)
    setGroupForm({ name: g.name, type: g.type })
  }

  const startEditMod = (m: any, groupId: string) => {
    setEditModId(m.id); setAddGroupTo(groupId)
    setModForm({ name: m.name, priceAdjustment: String(m.priceAdjustment || 0) })
    setView('cards')
  }

  const columns: DataColumn<any>[] = [
    {
      key: 'name', label: 'الخيار', render: (m) => (
        <span className="font-bold">{m.name}{m.priceAdjustment > 0 && <span className="text-primary text-xs mr-1">+{fmtMoney(m.priceAdjustment)} ج.م</span>}</span>
      ),
    },
    { key: 'group', label: 'المجموعة', render: (m) => <span className="text-xs bg-secondary rounded-full px-2 py-0.5">{m.groupName}</span> },
    { key: 'type', label: 'النوع', render: (m) => <span className="text-[10px] text-muted-foreground">{m.groupType === 'single-select' ? 'اختيار واحد' : 'اختيار متعدد'}</span> },
    {
      key: 'actions', label: 'إجراءات', className: 'text-left', render: (m) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setRecipeFor(recipeFor === m.id ? null : m.id)}><Link className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-primary" onClick={() => { setAddGroupTo(m.groupId); setEditModId(null); setModForm({ name: '', priceAdjustment: '' }); setView('cards') }}><Plus className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEditMod(m, m.groupId)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'modifier', item: m })}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الموديفاير ({groups.length} مجموعات)</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showGroupForm ? resetGroupForm() : setShowGroupForm(true); setEditGroupId(null) }}>
          {showGroupForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showGroupForm ? 'إغلاق' : 'إضافة مجموعة'}
        </Button>
      </div>

      {(showGroupForm || editGroupId) && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المجموعة" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
            <select value={groupForm.type} onChange={e => setGroupForm(f => ({ ...f, type: e.target.value }))} className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
              <option value="single-select">اختيار واحد</option>
              <option value="multi-select">اختيار متعدد</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl" onClick={editGroupId ? handleUpdateGroup : handleCreateGroup}>{editGroupId ? 'تحديث' : 'إضافة'}</Button>
            {editGroupId && <Button variant="ghost" className="rounded-xl" onClick={resetGroupForm}>إلغاء</Button>}
          </div>
        </div>
      )}

      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث عن مجموعة أو خيار..."
        view={view}
        onViewChange={setView}
        filters={[
          { value: null, label: 'الكل', count: groups.length },
          { value: 'single-select', label: 'اختيار واحد', count: groups.filter(g => g.type === 'single-select').length },
          { value: 'multi-select', label: 'اختيار متعدد', count: groups.filter(g => g.type === 'multi-select').length },
        ]}
        filterValue={typeFilter}
        onFilterChange={(v) => { setTypeFilter(v); list.setPage(1) }}
      />

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable
            columns={columns}
            data={list.items.flatMap(g => g.modifiers.map(m => ({ ...m, groupId: g.id, groupName: g.name, groupType: g.type })))}
            keyExtractor={(m) => m.id}
          />
          {recipeFor && (
            <div className="mt-4 border-2 rounded-2xl bg-card p-4 animate-slide-up">
              <RecipePanel
                title={`وصفة الخيار — ${groups.flatMap(g => g.modifiers).find((m: any) => m.id === recipeFor)?.name}`}
                targetId={recipeFor}
                entityField="modifierId"
                ingredients={ingredients}
                fetchRecipes={(id) => window.api.modifier.listRecipes(id)}
                upsertRecipe={async (data) => (await window.api.modifier.upsertRecipe(data) as { id: string }).id}
                deleteRecipe={(id) => window.api.modifier.deleteRecipe(id)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          {list.items.map(g => (
          <div key={g.id} className="border-2 rounded-2xl bg-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">{g.name}</h3>
                <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5 text-muted-foreground">
                  {g.type === 'single-select' ? 'اختيار واحد' : 'اختيار متعدد'}
                </span>
                <span className="text-[10px] text-muted-foreground">({g.modifiers.length} خيار)</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEditGroup(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'group', item: g })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="p-3 space-y-1.5">
              {g.modifiers.map(m => (
                <Fragment key={m.id}>
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/60">
                  <span className="text-sm font-medium">{m.name}</span>
                  <div className="flex items-center gap-2">
                    {m.priceAdjustment > 0 && <span className="text-xs font-bold text-primary">+{fmtMoney(m.priceAdjustment)} ج.م</span>}
                    {m.priceAdjustment === 0 && <span className="text-xs text-muted-foreground">بدون زيادة</span>}
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg" onClick={() => setRecipeFor(recipeFor === m.id ? null : m.id)}><Link className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg" onClick={() => startEditMod(m, g.id)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => setPendingDelete({ kind: 'modifier', item: m })}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  </div>
                  {recipeFor === m.id && (
                  <div className="px-3 pb-2 pt-1 animate-slide-up">
                    <RecipePanel
                      title={`وصفة الخيار — ${m.name}`}
                      targetId={m.id}
                      entityField="modifierId"
                      ingredients={ingredients}
                      fetchRecipes={(id) => window.api.modifier.listRecipes(id)}
                      upsertRecipe={async (data) => (await window.api.modifier.upsertRecipe(data) as { id: string }).id}
                      deleteRecipe={(id) => window.api.modifier.deleteRecipe(id)}
                    />
                  </div>
                )}
                </Fragment>
              ))}

              {/* Add / Edit modifier form */}
              {addGroupTo === g.id && (
                <div className="flex items-center gap-2 mt-2 animate-slide-up">
                  <input value={modForm.name} onChange={e => setModForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الخيار" className="flex-1 px-3 py-1.5 rounded-lg bg-secondary text-xs border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                  <input type="number" value={modForm.priceAdjustment} onChange={e => setModForm(f => ({ ...f, priceAdjustment: e.target.value }))} placeholder="السعر" className="w-20 px-2 py-1.5 rounded-lg bg-secondary text-xs border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                  <Button size="sm" className="rounded-lg text-xs" onClick={editModId ? handleUpdateModifier : () => handleCreateModifier(g.id)}>{editModId ? 'تحديث' : 'إضافة'}</Button>
                  <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={resetModForm}>إلغاء</Button>
                </div>
              )}

              {addGroupTo !== g.id && (
                <Button variant="ghost" size="sm" className="w-full gap-1 rounded-xl text-xs mt-2" onClick={() => { setAddGroupTo(g.id); setEditModId(null); setModForm({ name: '', priceAdjustment: '' }) }}>
                  <Plus className="h-3 w-3" /> إضافة خيار
                </Button>
              )}
            </div>
          </div>
          ))}
          {list.items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-10">لا توجد مجموعات مطابقة</p>
          )}
        </div>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.kind === 'group' ? 'حذف المجموعة' : 'حذف الخيار'}
        description={pendingDelete ? `سيتم حذف «${pendingDelete.item.name}» نهائياً.` : undefined}
        onConfirm={() => {
          if (!pendingDelete) return
          if (pendingDelete.kind === 'group') { removeGroup(pendingDelete.item.id); toast({ title: 'تم حذف المجموعة', variant: 'success' }) }
          else { removeModifier(pendingDelete.item.id); toast({ title: 'تم حذف الخيار', variant: 'success' }) }
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
