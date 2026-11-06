import type { Ingredient } from '@/api/types';
import { AdminScreen, Chips, Field } from '@/components/app/AdminKit';
import { IngredientLedgerTable } from '@/components/app/IngredientLedgerTable';
import {
  INVENTORY_OP_TITLES,
  InventoryOpForm,
  type InventoryOpKind,
} from '@/components/app/InventoryOpSheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useDeleteIngredient, useSaveIngredient } from '@/hooks/mutations/inventory';
import { useIngredient } from '@/hooks/queries/inventory';
import { useColor } from '@/hooks/useColor';
import { editNumber } from '@/lib/format';
import {
  INVENTORY_CATEGORIES,
  STORAGE_OPTIONS,
} from '@/lib/inventoryTaxonomy';
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

interface Draft {
  id?: string;
  name: string;
  unit: string;
  category: string;
  storage: string;
  stockQuantity: string;
  minStock: string;
  costPerUnit: string;
  purchaseQty: string;
  plannedCost: string;
  supplier: string;
  secondarySupplier: string;
  supplierRatio: string;
  active: boolean;
}

const emptyDraft = (): Draft => ({
  name: '',
  unit: 'g',
  category: 'other',
  storage: 'dry',
  stockQuantity: '0',
  minStock: '0',
  costPerUnit: '0',
  purchaseQty: '1',
  plannedCost: '0',
  supplier: '',
  secondarySupplier: '',
  supplierRatio: '0.7',
  active: true,
});

export default function IngredientFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const muted = useColor('mutedForeground');

  const ingredientQuery = useIngredient(id);
  const saveIngredient = useSaveIngredient();
  const deleteIngredient = useDeleteIngredient();

  const ingredient: Ingredient | null =
    ingredientQuery.data?.ingredient ?? null;

  const [edits, setEdits] = useState<Partial<Draft>>({});
  const [busy, setBusy] = useState(false);
  const [opSheet, setOpSheet] = useState<InventoryOpKind | null>(null);
  const [ledgerVersion, setLedgerVersion] = useState(0);

  // Derived draft: the fetched ingredient is the base, local edits sit on top.
  const base: Draft | null = id
    ? ingredient
      ? {
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          category: ingredient.category ?? 'other',
          storage: ingredient.storage ?? 'dry',
          stockQuantity: editNumber(ingredient.stockQuantity),
          minStock: editNumber(ingredient.minStock),
          costPerUnit: editNumber(ingredient.costPerUnit),
          purchaseQty: editNumber(ingredient.purchaseQty ?? 1),
          plannedCost: editNumber(ingredient.plannedCost ?? 0),
          supplier: ingredient.supplier ?? '',
          secondarySupplier: ingredient.secondarySupplier ?? '',
          supplierRatio: editNumber(ingredient.supplierRatio ?? 0.7, 3),
          active: ingredient.active !== false,
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
          category: draft.category,
          storage: draft.storage,
          stockQuantity: Number(draft.stockQuantity) || 0,
          minStock: Number(draft.minStock) || 0,
          costPerUnit: Number(draft.costPerUnit) || 0,
          purchaseQty: Number(draft.purchaseQty) || 1,
          plannedCost: Number(draft.plannedCost) || 0,
          supplier: draft.supplier.trim() || null,
          secondarySupplier: draft.secondarySupplier.trim() || null,
          supplierRatio: Number(draft.supplierRatio) || 0,
          active: draft.active,
        },
      });
      router.back();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
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
          <Chips
            label='القسم'
            value={draft.category}
            onChange={(category) =>
              setEdits((prev) => ({
                ...prev,
                category,
                storage:
                  INVENTORY_CATEGORIES.find((entry) => entry.id === category)?.defaultStorage ??
                  prev.storage ??
                  'dry',
              }))
            }
            options={INVENTORY_CATEGORIES.map((entry) => ({ value: entry.id, label: entry.label }))}
          />
          <Chips
            label='التخزين'
            value={draft.storage}
            onChange={(storage) => setEdits((prev) => ({ ...prev, storage }))}
            options={STORAGE_OPTIONS.map((entry) => ({ value: entry.id, label: entry.label }))}
          />
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
              <Field label='حجم العبوة' value={draft.purchaseQty} onChange={(v) => setEdits((prev) => ({ ...prev, purchaseQty: v }))} keyboardType='number-pad' placeholder='1000' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='التكلفة المخططة' value={draft.plannedCost} onChange={(v) => setEdits((prev) => ({ ...prev, plannedCost: v }))} keyboardType='number-pad' />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='المورد الثاني' value={draft.secondarySupplier} onChange={(v) => setEdits((prev) => ({ ...prev, secondarySupplier: v }))} placeholder='اختياري' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='نسبة المورد (0–1)' value={draft.supplierRatio} onChange={(v) => setEdits((prev) => ({ ...prev, supplierRatio: v }))} keyboardType='number-pad' />
            </View>
          </View>
          <Switch
            label='المادة نشطة'
            value={draft.active}
            onValueChange={(active) => setEdits((prev) => ({ ...prev, active }))}
          />
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button size='sm' variant='success' style={{ alignSelf: 'stretch' }} onPress={() => setOpSheet('restock')}>
                    توريد
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button size='sm' variant='secondary' style={{ alignSelf: 'stretch' }} onPress={() => setOpSheet('stocktake')}>
                    تسوية
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button size='sm' variant='destructive' style={{ alignSelf: 'stretch' }} onPress={() => setOpSheet('waste')}>
                    تالف
                  </Button>
                </View>
              </View>

              <Separator />
              <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
                سجل الحركة
              </Text>
              <IngredientLedgerTable
                ingredientId={ingredient.id}
                unit={ingredient.unit}
                refreshToken={ledgerVersion}
              />

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

      <BottomSheet
        isVisible={Boolean(opSheet && ingredient)}
        onClose={() => {
          setOpSheet(null);
          setLedgerVersion((version) => version + 1);
        }}
        title={opSheet ? INVENTORY_OP_TITLES[opSheet] : ''}
      >
        {opSheet && ingredient ? (
          <InventoryOpForm
            ingredient={ingredient}
            op={opSheet}
            onClose={() => {
              setOpSheet(null);
              setLedgerVersion((version) => version + 1);
            }}
          />
        ) : null}
      </BottomSheet>
    </AdminScreen>
  );
}
