import { api } from '@/api/endpoints';
import type { Ingredient, IngredientLedger } from '@/api/types';
import { AdminScreen, Chips, Field, ListRow, SearchField } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { fmtTime } from '@/lib/format';
import { AlertTriangle, ChevronDown, Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable } from 'react-native';

const UNITS = [
  { value: 'g', label: 'جرام' },
  { value: 'kg', label: 'كيلو' },
  { value: 'ml', label: 'مل' },
  { value: 'l', label: 'لتر' },
  { value: 'pcs', label: 'قطعة' },
];

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: 'شراء',
  CONSUMPTION: 'استهلاك',
  ADJUSTMENT: 'تسوية',
  WASTE: 'تالف',
};

interface Draft {
  id?: string;
  name: string;
  unit: string;
  stockQuantity: string;
  minStock: string;
  costPerUnit: string;
  supplier: string;
}

const emptyDraft = (): Draft => ({
  name: '',
  unit: 'g',
  stockQuantity: '0',
  minStock: '0',
  costPerUnit: '0',
  supplier: '',
});

export default function InventoryScreen() {
  const muted = useColor('mutedForeground');
  const red = useColor('red');
  const green = useColor('green');
  const warning = useColor('warning');

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<IngredientLedger | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.ingredients();
      setIngredients(res.ingredients);
    } catch (err: any) {
      Alert.alert('تعذّر تحميل المخزون', err?.message ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openLedger = async (id: string) => {
    try {
      const res = await api.ledger(id, { pageSize: 8 });
      setLedger(res.ledger);
    } catch {
      setLedger(null);
    }
  };

  const toggleOpen = async (ingredient: Ingredient) => {
    setAmount('');
    setNote('');
    const next = openId === ingredient.id ? null : ingredient.id;
    setOpenId(next);
    setLedger(null);
    if (next) await openLedger(next);
  };

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ingredients
      .filter((i) => !query || i.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [ingredients, search]);

  const lowStock = ingredients.filter((i) => i.stockQuantity <= i.minStock);

  const save = async () => {
    if (!draft?.name.trim()) {
      Alert.alert('اكتب اسم المادة');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: draft.name.trim(),
        unit: draft.unit,
        stockQuantity: Number(draft.stockQuantity) || 0,
        minStock: Number(draft.minStock) || 0,
        costPerUnit: Number(draft.costPerUnit) || 0,
        supplier: draft.supplier.trim() || null,
      };
      if (draft.id) await api.updateIngredient(draft.id, body);
      else await api.createIngredient(body);
      setDraft(null);
      await load();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const stockOp = async (ingredient: Ingredient, kind: 'restock' | 'waste' | 'adjust') => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) {
      Alert.alert('اكتب كمية');
      return;
    }
    setBusy(true);
    try {
      if (kind === 'restock') await api.restock(ingredient.id, { qty: value, note: note.trim() || undefined });
      else if (kind === 'waste') await api.recordWaste(ingredient.id, { qty: value, note: note.trim() || undefined });
      else await api.adjustStock(ingredient.id, { delta: value, note: note.trim() || undefined });
      setAmount('');
      setNote('');
      await load();
      await openLedger(ingredient.id);
    } catch (err: any) {
      Alert.alert('تعذّر تسجيل الحركة', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const remove = (ingredient: Ingredient) => {
    Alert.alert('حذف المادة', `تقاعد «${ingredient.name}»؟ المواد المرتبطة بوصفات مش هتتعطل.`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: async () => {
          try {
            const res: any = await api.deleteIngredient(ingredient.id);
            if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
            await load();
          } catch (err: any) {
            Alert.alert('تعذّر الحذف', err?.message ?? '');
          }
        },
      },
      {
        text: 'حذف نهائي',
        style: 'destructive',
        onPress: async () => {
          try {
            const res: any = await api.deleteIngredient(ingredient.id, true);
            if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
            await load();
          } catch (err: any) {
            Alert.alert('تعذّر الحذف', err?.message ?? '');
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen
      title='المخزون'
      subtitle={`${ingredients.length} مادة · ${lowStock.length} تحت الحد`}
      refreshing={refreshing}
      onRefresh={onRefresh}
      right={
        <Button size='sm' className='rounded-xl' icon={Plus} loading={busy} onPress={() => setDraft(emptyDraft())}>
          إضافة
        </Button>
      }
    >
      {lowStock.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: `${warning}22`,
            borderRadius: 14,
            padding: 12,
          }}
        >
          <AlertTriangle size={16} color={warning} />
          <Text variant='caption' style={{ color: warning, fontWeight: '700', flex: 1 }}>
            {lowStock.length} مادة وصلت للحد الأدنى: {lowStock.slice(0, 3).map((i) => i.name).join('، ')}
            {lowStock.length > 3 ? '…' : ''}
          </Text>
        </View>
      ) : null}

      {draft ? (
        <Card style={{ gap: 12 }}>
          <Text variant='subtitle'>{draft.id ? 'تعديل مادة' : 'مادة جديدة'}</Text>
          <Field label='الاسم' value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder='لحم بقري' />
          <Chips label='الوحدة' value={draft.unit} onChange={(u) => setDraft({ ...draft, unit: u })} options={UNITS} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='الرصيد' value={draft.stockQuantity} onChange={(v) => setDraft({ ...draft, stockQuantity: v })} keyboardType='number-pad' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='الحد الأدنى' value={draft.minStock} onChange={(v) => setDraft({ ...draft, minStock: v })} keyboardType='number-pad' />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='سعر الوحدة' value={draft.costPerUnit} onChange={(v) => setDraft({ ...draft, costPerUnit: v })} keyboardType='number-pad' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='المورد' value={draft.supplier} onChange={(v) => setDraft({ ...draft, supplier: v })} placeholder='اختياري' />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void save()}>
                حفظ
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant='ghost' style={{ alignSelf: 'stretch' }} onPress={() => setDraft(null)}>
                إلغاء
              </Button>
            </View>
          </View>
        </Card>
      ) : null}

      <SearchField value={search} onChange={setSearch} placeholder='ابحث عن مادة…' />

      {loading ? (
        <>
          <Skeleton height={64} style={{ borderRadius: 18 }} />
          <Skeleton height={64} style={{ borderRadius: 18 }} />
        </>
      ) : visible.length === 0 ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
          مفيش مواد مطابقة
        </Text>
      ) : (
        visible.map((ingredient) => {
          const low = ingredient.stockQuantity <= ingredient.minStock;
          const open = openId === ingredient.id;
          return (
            <Card key={ingredient.id} style={{ gap: 10 }}>
              <ListRow
                title={ingredient.name}
                subtitle={`${ingredient.stockQuantity} ${ingredient.unit} · الحد ${ingredient.minStock} · ${ingredient.costPerUnit}/${ingredient.unit}`}
                tint={low ? red : muted}
                onPress={() => void toggleOpen(ingredient)}
                trailing={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {low ? <AlertTriangle size={15} color={red} /> : null}
                    <ChevronDown
                      size={16}
                      color={muted}
                      style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                    />
                  </View>
                }
              />

              {open ? (
                <View style={{ gap: 10 }}>
                  <Separator />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field label='الكمية' value={amount} onChange={setAmount} keyboardType='number-pad' placeholder='100' />
                    </View>
                    <View style={{ flex: 2 }}>
                      <Field label='ملاحظة' value={note} onChange={setNote} placeholder='اختياري' />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Button size='sm' variant='success' loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void stockOp(ingredient, 'restock')}>
                        توريد
                      </Button>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button size='sm' variant='secondary' loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void stockOp(ingredient, 'adjust')}>
                        تسوية
                      </Button>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button size='sm' variant='destructive' loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void stockOp(ingredient, 'waste')}>
                        تالف
                      </Button>
                    </View>
                  </View>

                  <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
                    آخر الحركات
                  </Text>
                  {ledger?.movements?.length ? (
                    ledger.movements.map((movement) => (
                      <View key={movement.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                        <Text variant='caption' style={{ color: muted, flex: 1 }}>
                          {MOVEMENT_LABELS[movement.type] ?? movement.type} · {fmtTime(movement.createdAt)}
                          {movement.note ? ` · ${movement.note}` : ''}
                        </Text>
                        <Text variant='caption' style={{ color: movement.quantity >= 0 ? green : red, fontWeight: '700' }}>
                          {movement.quantity > 0 ? '+' : ''}
                          {movement.quantity}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text variant='caption' style={{ color: muted }}>
                      مفيش حركات مسجّلة
                    </Text>
                  )}

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        size='sm'
                        variant='outline'
                        style={{ alignSelf: 'stretch' }}
                        onPress={() =>
                          setDraft({
                            id: ingredient.id,
                            name: ingredient.name,
                            unit: ingredient.unit,
                            stockQuantity: String(ingredient.stockQuantity),
                            minStock: String(ingredient.minStock),
                            costPerUnit: String(ingredient.costPerUnit),
                            supplier: ingredient.supplier ?? '',
                          })
                        }
                      >
                        تعديل البيانات
                      </Button>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button size='sm' variant='ghost' icon={Trash2} style={{ alignSelf: 'stretch' }} onPress={() => remove(ingredient)}>
                        حذف
                      </Button>
                    </View>
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      <Text variant='caption' style={{ color: muted }}>
        الرصيد بيتخصم لوحده مع كل طلب مبيع. الوصفات (كل صنف بيستهلك إيه) بتتظبط من الكمبيوتر.
      </Text>
    </AdminScreen>
  );
}
