import type { Ingredient, IngredientLedger } from '@/api/types';
import { AdminScreen, Chips, Field } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import {
  useAdjustStock,
  useDeleteIngredient,
  useRecordWaste,
  useRestock,
  useSaveIngredient,
} from '@/hooks/mutations/inventory';
import { useIngredient, useIngredientLedger } from '@/hooks/queries/inventory';
import { useColor } from '@/hooks/useColor';
import { fmtTime } from '@/lib/format';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert } from 'react-native';

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

export default function IngredientFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const muted = useColor('mutedForeground');
  const red = useColor('red');
  const green = useColor('green');

  const ingredientQuery = useIngredient(id);
  const ledgerQuery = useIngredientLedger(id);
  const saveIngredient = useSaveIngredient();
  const deleteIngredient = useDeleteIngredient();
  const restock = useRestock();
  const recordWaste = useRecordWaste();
  const adjustStock = useAdjustStock();

  const ingredient: Ingredient | null =
    ingredientQuery.data?.ingredient ?? null;
  const ledger: IngredientLedger | null = ledgerQuery.data?.ledger ?? null;

  const [edits, setEdits] = useState<Partial<Draft>>({});
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Derived draft: the fetched ingredient is the base, local edits sit on top.
  const base: Draft | null = id
    ? ingredient
      ? {
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          stockQuantity: String(ingredient.stockQuantity),
          minStock: String(ingredient.minStock),
          costPerUnit: String(ingredient.costPerUnit),
          supplier: ingredient.supplier ?? '',
        }
      : null
    : emptyDraft();
  const draft: Draft | null = base ? { ...base, ...edits } : null;
  const loading = !base && ingredientQuery.isLoading;

  const save = async () => {
    if (!draft?.name.trim()) {
      Alert.alert('اكتب اسم المادة');
      return;
    }
    setBusy(true);
    try {
      await saveIngredient.mutateAsync({
        id: draft.id,
        body: {
          name: draft.name.trim(),
          unit: draft.unit,
          stockQuantity: Number(draft.stockQuantity) || 0,
          minStock: Number(draft.minStock) || 0,
          costPerUnit: Number(draft.costPerUnit) || 0,
          supplier: draft.supplier.trim() || null,
        },
      });
      router.back();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const stockOp = async (kind: 'restock' | 'waste' | 'adjust') => {
    if (!ingredient) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) {
      Alert.alert('اكتب كمية');
      return;
    }
    setBusy(true);
    try {
      const body = { qty: value, note: note.trim() || undefined };
      if (kind === 'restock') await restock.mutateAsync({ id: ingredient.id, body });
      else if (kind === 'waste') await recordWaste.mutateAsync({ id: ingredient.id, body });
      else await adjustStock.mutateAsync({ id: ingredient.id, body: { delta: value, note: body.note } });
      setAmount('');
      setNote('');
    } catch (err: any) {
      Alert.alert('تعذّر تسجيل الحركة', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const remove = (target: Ingredient) => {
    Alert.alert('حذف المادة', `تقاعد «${target.name}»؟ المواد المرتبطة بوصفات مش هتتعطل.`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: async () => {
          try {
            const res: any = await deleteIngredient.mutateAsync({ id: target.id });
            if (res?.ok === false) {
              Alert.alert('مش ممكن', res.error ?? '');
              return;
            }
            router.back();
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
            const res: any = await deleteIngredient.mutateAsync({ id: target.id, hard: true });
            if (res?.ok === false) {
              Alert.alert('مش ممكن', res.error ?? '');
              return;
            }
            router.back();
          } catch (err: any) {
            Alert.alert('تعذّر الحذف', err?.message ?? '');
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen title={id ? 'تعديل مادة' : 'مادة جديدة'}>
      {loading ? (
        <>
          <Skeleton height={64} style={{ borderRadius: 18 }} />
          <Skeleton height={64} style={{ borderRadius: 18 }} />
        </>
      ) : draft ? (
        <Card style={{ gap: 12 }}>
          <Field label='الاسم' value={draft.name} onChange={(v) => setEdits((prev) => ({ ...prev, name: v }))} placeholder='لحم بقري' />
          <Chips label='الوحدة' value={draft.unit} onChange={(unit) => setEdits((prev) => ({ ...prev, unit }))} options={UNITS} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='الرصيد' value={draft.stockQuantity} onChange={(v) => setEdits((prev) => ({ ...prev, stockQuantity: v }))} keyboardType='number-pad' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='الحد الأدنى' value={draft.minStock} onChange={(v) => setEdits((prev) => ({ ...prev, minStock: v }))} keyboardType='number-pad' />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='سعر الوحدة' value={draft.costPerUnit} onChange={(v) => setEdits((prev) => ({ ...prev, costPerUnit: v }))} keyboardType='number-pad' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='المورد' value={draft.supplier} onChange={(v) => setEdits((prev) => ({ ...prev, supplier: v }))} placeholder='اختياري' />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void save()}>
                حفظ
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant='ghost' style={{ alignSelf: 'stretch' }} onPress={() => router.back()}>
                إلغاء
              </Button>
            </View>
          </View>

          {ingredient ? (
            <>
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
                  <Button size='sm' variant='success' loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void stockOp('restock')}>
                    توريد
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button size='sm' variant='secondary' loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void stockOp('adjust')}>
                    تسوية
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button size='sm' variant='destructive' loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void stockOp('waste')}>
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

              <Button size='sm' variant='ghost' icon={Trash2} style={{ alignSelf: 'stretch' }} onPress={() => remove(ingredient)}>
                حذف
              </Button>
            </>
          ) : null}
        </Card>
      ) : (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 20 }}>
          مفيش مادة مطابقة
        </Text>
      )}
    </AdminScreen>
  );
}
