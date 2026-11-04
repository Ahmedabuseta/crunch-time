import { Fragment, useEffect, useMemo, useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useModifierStore } from '@/services/modifier/modifier.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { RecipePanel } from './RecipePanel'
import { ProductLinkDialog } from '@/components/ProductLinkDialog'
import { Button } from '@/components/ui/button'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, sortRows, type DataColumn, type SortState } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fmtMoney } from '@/lib/format'
import { useIsAdmin } from '@/lib/use-is-admin'
import { cn } from '@/lib/utils'
import type { ViewMode } from '@/components/ui/view-toggle'
import type { ModifierGroupWithModifiers } from '@/services/modifier/modifier.types'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'خطأ غير متوقع'
}

const TYPE_LABEL = (type: string) => (type === 'multi-select' ? 'اختيار متعدد' : 'اختيار واحد')

export function ModifiersPage() {
  const groups = useModifierStore((s) => s.groups)
  const isAdmin = useIsAdmin()
  const fetchGroups = useModifierStore((s) => s.fetchGroups)
  const createGroup = useModifierStore((s) => s.createGroup)
  const updateGroup = useModifierStore((s) => s.updateGroup)
  const removeGroup = useModifierStore((s) => s.removeGroup)
  const reorderGroups = useModifierStore((s) => s.reorderGroups)
  const createModifier = useModifierStore((s) => s.createModifier)
  const updateModifier = useModifierStore((s) => s.updateModifier)
  const removeModifier = useModifierStore((s) => s.removeModifier)
  const reorderModifiers = useModifierStore((s) => s.reorderModifiers)
  const ingredients = useInventoryStore((s) => s.ingredients)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)

  const [groupFormOpen, setGroupFormOpen] = useState(false)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState<{ name: string; type: 'single-select' | 'multi-select'; active: boolean }>({
    name: '',
    type: 'single-select',
    active: true,
  })
  const [groupError, setGroupError] = useState<string | null>(null)
  const [groupSaving, setGroupSaving] = useState(false)

  const [modFormOpen, setModFormOpen] = useState(false)
  const [modGroupId, setModGroupId] = useState<string | null>(null)
  const [editModId, setEditModId] = useState<string | null>(null)
  const [modForm, setModForm] = useState({ name: '', priceAdjustment: '', active: true })
  const [modError, setModError] = useState<string | null>(null)
  const [modSaving, setModSaving] = useState(false)

  const [recipeFor, setRecipeFor] = useState<string | null>(null)
  const [linkFor, setLinkFor] = useState<ModifierGroupWithModifiers | null>(null)
  const [linkIds, setLinkIds] = useState<string[]>([])
  const [view, setView] = useState<ViewMode>('cards')
  const [status, setStatus] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [modSort, setModSort] = useState<SortState<any> | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'group' | 'modifier'; item: any } | null>(null)

  useEffect(() => {
    void fetchGroups(true)
    void fetchIngredients()
    // The sales screens share this store; never leave hidden groups behind.
    return () => { void fetchGroups(false) }
  }, [])

  const list = useListControls({
    items: groups,
    searchText: (group) => `${group.name} ${group.modifiers.map((modifier) => modifier.name).join(' ')} ${TYPE_LABEL(group.type)}`,
    filter: (group) => {
      if (status === 'active' && !group.active) return false
      if (status === 'hidden' && group.active) return false
      if (typeFilter && group.type !== typeFilter) return false
      return true
    },
  })

  const activeCount = groups.filter((group) => group.active).length
  const hiddenCount = groups.length - activeCount

  const flatModifiers = useMemo(
    () => sortRows(
      list.items.flatMap((group) => group.modifiers.map((modifier) => ({
        ...modifier,
        groupId: group.id,
        groupName: group.name,
        groupType: group.type,
        groupActive: group.active,
      }))),
      modSort,
    ),
    [list.items, modSort],
  )

  const resetGroupForm = () => {
    setGroupForm({ name: '', type: 'single-select', active: true })
    setEditGroupId(null)
    setGroupFormOpen(false)
    setGroupError(null)
  }

  const openCreateGroup = () => {
    setGroupForm({ name: '', type: 'single-select', active: true })
    setEditGroupId(null)
    setGroupError(null)
    setGroupFormOpen(true)
  }

  const openEditGroup = (group: ModifierGroupWithModifiers) => {
    setGroupForm({ name: group.name, type: group.type, active: !!group.active })
    setEditGroupId(group.id)
    setGroupError(null)
    setGroupFormOpen(true)
  }

  const saveGroup = async () => {
    const name = groupForm.name.trim()
    if (!name) { setGroupError('اسم المجموعة مطلوب'); return }

    setGroupSaving(true)
    setGroupError(null)
    try {
      if (editGroupId) {
        await updateGroup(editGroupId, { name, type: groupForm.type, active: groupForm.active })
      } else {
        await createGroup({ name, type: groupForm.type, active: groupForm.active })
      }
      toast({ title: editGroupId ? 'تم تحديث المجموعة' : 'تم إنشاء المجموعة', description: name, variant: 'success' })
      resetGroupForm()
    } catch (error) {
      setGroupError(messageOf(error))
    } finally {
      setGroupSaving(false)
    }
  }

  const toggleGroupActive = async (group: ModifierGroupWithModifiers) => {
    try {
      await updateGroup(group.id, { active: !group.active })
      toast({ title: group.active ? 'تم إخفاء المجموعة' : 'تم إظهار المجموعة', description: group.name, variant: 'success' })
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    }
  }

  const moveGroup = async (group: ModifierGroupWithModifiers, direction: -1 | 1) => {
    const ids = groups.map((entry) => entry.id)
    const index = ids.indexOf(group.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await reorderGroups(ids)
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    }
  }

  const resetModForm = () => {
    setModForm({ name: '', priceAdjustment: '', active: true })
    setModGroupId(null)
    setEditModId(null)
    setModFormOpen(false)
    setModError(null)
  }

  const openCreateModifier = (groupId: string) => {
    setModGroupId(groupId)
    setEditModId(null)
    setModForm({ name: '', priceAdjustment: '', active: true })
    setModError(null)
    setModFormOpen(true)
  }

  const openEditModifier = (modifier: any, groupId: string) => {
    setModGroupId(groupId)
    setEditModId(modifier.id)
    setModForm({ name: modifier.name, priceAdjustment: String(modifier.priceAdjustment || 0), active: !!modifier.active })
    setModError(null)
    setModFormOpen(true)
  }

  const saveModifier = async () => {
    const name = modForm.name.trim()
    const price = Number(modForm.priceAdjustment || 0)
    if (!name) { setModError('اسم الخيار مطلوب'); return }
    if (!Number.isFinite(price)) { setModError('اكتب سعر صحيح'); return }

    setModSaving(true)
    setModError(null)
    try {
      if (editModId) {
        await updateModifier(editModId, { name, priceAdjustment: price, active: modForm.active })
      } else if (modGroupId) {
        await createModifier({ modifierGroupId: modGroupId, name, priceAdjustment: price, active: modForm.active })
      }
      toast({ title: editModId ? 'تم تحديث الخيار' : 'تم إضافة الخيار', description: name, variant: 'success' })
      resetModForm()
    } catch (error) {
      setModError(messageOf(error))
    } finally {
      setModSaving(false)
    }
  }

  const toggleModifierActive = async (modifier: any) => {
    try {
      await updateModifier(modifier.id, { active: !modifier.active })
      toast({ title: modifier.active ? 'تم إخفاء الخيار' : 'تم إظهار الخيار', description: modifier.name, variant: 'success' })
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    }
  }

  const moveModifier = async (group: ModifierGroupWithModifiers, modifier: any, direction: -1 | 1) => {
    const ids = group.modifiers.map((entry) => entry.id)
    const index = ids.indexOf(modifier.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await reorderModifiers(ids)
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    }
  }

  const openLinks = async (group: ModifierGroupWithModifiers) => {
    try {
      const products = await window.api.modifier.listProducts(group.id) as any[]
      setLinkIds(products.map((product) => product.id))
      setLinkFor(group)
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    }
  }

  const handleDelete = async (hard: boolean) => {
    if (!pendingDelete) return
    const { kind, item } = pendingDelete
    try {
      if (kind === 'group') await removeGroup(item.id, { hard })
      else await removeModifier(item.id, { hard })
      toast({ title: hard ? 'تم الحذف النهائي' : 'تم تعطيل العنصر', description: item.name, variant: 'success' })
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    } finally {
      setPendingDelete(null)
    }
  }

  const columns: DataColumn<any>[] = [
    {
      key: 'name',
      label: 'الخيار',
      sortValue: (modifier) => modifier.name,
      render: (modifier) => (
        <span className="font-bold">
          {modifier.name}
          {modifier.priceAdjustment !== 0 && (
            <span className="me-1 text-xs font-bold text-primary">
              {modifier.priceAdjustment > 0 ? '+' : ''}{fmtMoney(modifier.priceAdjustment)} ج.م
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'group',
      label: 'المجموعة',
      sortValue: (modifier) => modifier.groupName,
      render: (modifier) => <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{modifier.groupName}</span>,
    },
    {
      key: 'type',
      label: 'النوع',
      sortValue: (modifier) => modifier.groupType,
      render: (modifier) => <span className="text-[10px] text-muted-foreground">{TYPE_LABEL(modifier.groupType)}</span>,
    },
    {
      key: 'status',
      label: 'الظهور',
      sortValue: (modifier) => (modifier.active && modifier.groupActive ? 1 : 0),
      render: (modifier) => {
        const visible = modifier.active && modifier.groupActive
        return (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black',
            visible ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground',
          )}>
            {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {visible ? 'ظاهر' : 'مخفي'}
          </span>
        )
      },
    },
    {
      key: 'actions',
      label: 'إجراءات',
      className: 'text-left',
      render: (modifier) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title={modifier.active ? 'إخفاء' : 'إظهار'} onClick={() => void toggleModifierActive(modifier)}>
            {modifier.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="الوصفة" onClick={() => setRecipeFor(recipeFor === modifier.id ? null : modifier.id)}>
            <UtensilsCrossed className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="تعديل" onClick={() => openEditModifier(modifier, modifier.groupId)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" title="حذف" onClick={() => setPendingDelete({ kind: 'modifier', item: modifier })}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  const linkGroup = modGroupId ? groups.find((group) => group.id === modGroupId) : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h2 className="text-base font-black">الموديفاير ({groups.length} مجموعات)</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{activeCount} ظاهرة · {hiddenCount} مخفية</p>
        </div>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={openCreateGroup}>
          <Plus className="h-4 w-4" /> إضافة مجموعة
        </Button>
      </div>

      <ListToolbar
        search={list.search}
        onSearchChange={(value) => { list.setSearch(value); list.setPage(1) }}
        searchPlaceholder="بحث عن مجموعة أو خيار..."
        view={view}
        onViewChange={setView}
      >
        <Select
          value={status ?? 'all'}
          onValueChange={(value) => { setStatus(value === 'all' ? null : value); list.setPage(1) }}
        >
          <SelectTrigger className="h-9 w-[118px] rounded-lg bg-secondary text-xs font-bold">
            <SelectValue placeholder="الظهور" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل ({groups.length})</SelectItem>
            <SelectItem value="active">ظاهر ({activeCount})</SelectItem>
            <SelectItem value="hidden">مخفي ({hiddenCount})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter ?? 'all'} onValueChange={(value) => { setTypeFilter(value === 'all' ? null : value); list.setPage(1) }}>
          <SelectTrigger className="h-9 w-[132px] rounded-lg bg-secondary text-xs font-bold">
            <SelectValue placeholder="النوع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            <SelectItem value="single-select">اختيار واحد</SelectItem>
            <SelectItem value="multi-select">اختيار متعدد</SelectItem>
          </SelectContent>
        </Select>
      </ListToolbar>

      {view === 'table' ? (
        <div className="flex-1 overflow-auto p-5">
          <DataTable
            columns={columns}
            data={flatModifiers}
            keyExtractor={(modifier) => modifier.id}
            sort={modSort}
            onSortChange={setModSort}
            rowClassName={(modifier) => (modifier.active && modifier.groupActive ? '' : 'opacity-60')}
          />
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {list.items.map((group) => (
            <div key={group.id} className={cn('overflow-hidden rounded-2xl border-2 bg-card', !group.active && 'opacity-70')}>
              <div className="flex flex-wrap items-center gap-2 border-b p-4">
                <h3 className="text-sm font-bold">{group.name}</h3>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                  {TYPE_LABEL(group.type)}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black',
                  group.active ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground',
                )}>
                  {group.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {group.active ? 'ظاهر' : 'مخفي'}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                  <Link2 className="h-3 w-3" /> {group.productCount ?? 0} منتج
                </span>
                <span className="text-[10px] text-muted-foreground">{group.modifiers.length} خيار</span>

                <div className="ms-auto flex items-center gap-1">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
                    title="تحريك لأعلى"
                    disabled={groups[0]?.id === group.id}
                    onClick={() => void moveGroup(group, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
                    title="تحريك لأسفل"
                    disabled={groups[groups.length - 1]?.id === group.id}
                    onClick={() => void moveGroup(group, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title={group.active ? 'إخفاء' : 'إظهار'} onClick={() => void toggleGroupActive(group)}>
                    {group.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="ربط بالمنتجات" onClick={() => void openLinks(group)}>
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="إضافة خيار" onClick={() => openCreateModifier(group.id)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="تعديل" onClick={() => openEditGroup(group)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" title="حذف" onClick={() => setPendingDelete({ kind: 'group', item: group })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 p-3">
                {group.modifiers.map((modifier, index) => (
                  <Fragment key={modifier.id}>
                    <div className={cn('flex items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2', !modifier.active && 'opacity-60')}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{modifier.name}</span>
                        {modifier.priceAdjustment !== 0 && (
                          <span className="shrink-0 text-xs font-bold text-primary">
                            {modifier.priceAdjustment > 0 ? '+' : ''}{fmtMoney(modifier.priceAdjustment)} ج.م
                          </span>
                        )}
                        {!modifier.active && (
                          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">مخفي</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 rounded-lg"
                          title="تحريك لأعلى"
                          disabled={index === 0}
                          onClick={() => void moveModifier(group, modifier, -1)}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 rounded-lg"
                          title="تحريك لأسفل"
                          disabled={index === group.modifiers.length - 1}
                          onClick={() => void moveModifier(group, modifier, 1)}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg" title={modifier.active ? 'إخفاء' : 'إظهار'} onClick={() => void toggleModifierActive(modifier)}>
                          {modifier.active ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg" title="الوصفة" onClick={() => setRecipeFor(recipeFor === modifier.id ? null : modifier.id)}>
                          <UtensilsCrossed className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg" title="تعديل" onClick={() => openEditModifier(modifier, group.id)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" title="حذف" onClick={() => setPendingDelete({ kind: 'modifier', item: modifier })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {recipeFor === modifier.id && (
                      <div className="animate-slide-up px-3 pb-2 pt-1">
                        <RecipePanel
                          title={`وصفة الخيار — ${modifier.name}`}
                          targetId={modifier.id}
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

                {group.modifiers.length === 0 && (
                  <p className="py-3 text-center text-[11px] text-muted-foreground">لا توجد خيارات</p>
                )}

                <Button variant="ghost" size="sm" className="mt-2 w-full gap-1 rounded-xl text-xs" onClick={() => openCreateModifier(group.id)}>
                  <Plus className="h-3 w-3" /> إضافة خيار
                </Button>
              </div>
            </div>
          ))}
          {list.items.length === 0 && (
            <p className="py-10 text-center text-xs text-muted-foreground">لا توجد مجموعات مطابقة</p>
          )}
        </div>
      )}

      {recipeFor && view === 'table' && (
        <div className="px-5 pb-5">
          <div className="animate-slide-up rounded-2xl border-2 bg-card p-4">
            <RecipePanel
              title={`وصفة الخيار — ${groups.flatMap((group) => group.modifiers).find((modifier) => modifier.id === recipeFor)?.name}`}
              targetId={recipeFor}
              entityField="modifierId"
              ingredients={ingredients}
              fetchRecipes={(id) => window.api.modifier.listRecipes(id)}
              upsertRecipe={async (data) => (await window.api.modifier.upsertRecipe(data) as { id: string }).id}
              deleteRecipe={(id) => window.api.modifier.deleteRecipe(id)}
            />
          </div>
        </div>
      )}

      <Pagination
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        start={list.start}
        end={list.end}
        onPageChange={(page) => list.setPage(page)}
      />

      {groupFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={resetGroupForm}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
          <div className="relative w-full max-w-md animate-scale-in rounded-3xl border-2 border-border bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-sm font-black">{editGroupId ? 'تعديل المجموعة' : 'مجموعة جديدة'}</h3>
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={resetGroupForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3 p-5">
              <input
                value={groupForm.name}
                onChange={(event) => { setGroupForm((prev) => ({ ...prev, name: event.target.value })); setGroupError(null) }}
                placeholder="اسم المجموعة"
                className="min-h-[44px] w-full rounded-xl border-0 bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                dir="rtl"
              />
              <Select value={groupForm.type} onValueChange={(value) => setGroupForm((prev) => ({ ...prev, type: value as 'single-select' | 'multi-select' }))}>
                <SelectTrigger className="min-h-[44px] w-full rounded-xl bg-secondary text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-select">اختيار واحد</SelectItem>
                  <SelectItem value="multi-select">اختيار متعدد</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={groupForm.active}
                  onChange={(event) => setGroupForm((prev) => ({ ...prev, active: event.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                ظاهرة في شاشة البيع
              </label>
              {groupError && <p className="text-[11px] font-bold text-destructive">{groupError}</p>}
            </div>
            <div className="flex gap-2 border-t p-4">
              <Button className="flex-1 rounded-xl" disabled={groupSaving} onClick={() => void saveGroup()}>
                {groupSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editGroupId ? 'حفظ التغييرات' : 'إضافة'}
              </Button>
              <Button variant="ghost" className="rounded-xl" onClick={resetGroupForm}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {modFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={resetModForm}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
          <div className="relative w-full max-w-md animate-scale-in rounded-3xl border-2 border-border bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-sm font-black">{editModId ? 'تعديل الخيار' : 'خيار جديد'}</h3>
                {linkGroup && <p className="mt-0.5 text-[10px] text-muted-foreground">داخل «{linkGroup.name}»</p>}
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={resetModForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3 p-5">
              <input
                value={modForm.name}
                onChange={(event) => { setModForm((prev) => ({ ...prev, name: event.target.value })); setModError(null) }}
                placeholder="اسم الخيار"
                className="min-h-[44px] w-full rounded-xl border-0 bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                dir="rtl"
              />
              <input
                type="number"
                value={modForm.priceAdjustment}
                onChange={(event) => { setModForm((prev) => ({ ...prev, priceAdjustment: event.target.value })); setModError(null) }}
                placeholder="فرق السعر (ج.م) — يقبل سالب"
                className="min-h-[44px] w-full rounded-xl border-0 bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={modForm.active}
                  onChange={(event) => setModForm((prev) => ({ ...prev, active: event.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                ظاهر في شاشة البيع
              </label>
              {modError && <p className="text-[11px] font-bold text-destructive">{modError}</p>}
            </div>
            <div className="flex gap-2 border-t p-4">
              <Button className="flex-1 rounded-xl" disabled={modSaving} onClick={() => void saveModifier()}>
                {modSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editModId ? 'حفظ التغييرات' : 'إضافة'}
              </Button>
              <Button variant="ghost" className="rounded-xl" onClick={resetModForm}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      <ProductLinkDialog
        open={!!linkFor}
        title={`ربط «${linkFor?.name ?? ''}» بالمنتجات`}
        description="اختَر المنتجات التي تعرض مجموعة الخيارات هذه. المنتجات المخفية تظهر هنا أيضاً."
        productIds={linkIds}
        onSave={async (ids) => {
          if (!linkFor) return
          await window.api.modifier.setProducts(linkFor.id, ids)
          await fetchGroups(true)
          toast({ title: 'تم تحديث ربط المنتجات', description: linkFor.name, variant: 'success' })
        }}
        onClose={() => setLinkFor(null)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.kind === 'group' ? 'حذف المجموعة' : 'حذف الخيار'}
        description={pendingDelete ? `سيتم تعطيل «${pendingDelete.item.name}» وإخفاءه من شاشة البيع.` : undefined}
        allowHardDelete={isAdmin}
        hardDeleteDescription="يحذف العنصر نهائياً من قاعدة البيانات. لن يمكن استرجاعه."
        onConfirm={({ hard }) => void handleDelete(hard)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
