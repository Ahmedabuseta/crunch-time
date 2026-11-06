import type { Ingredient } from '@/api/types';
import { Chips, Field } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import {
  useAdjustStock,
  useRecordWaste,
  useRestock,
} from '@/hooks/mutations/inventory';
import { useColor } from '@/hooks/useColor';
import { fmtDecimal } from '@/lib/format';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

export type InventoryOpKind = 'restock' | 'stocktake' | 'waste';

export const INVENTORY_OP_TITLES: Record<InventoryOpKind, string> = {
  restock: 'استلام مخزون',
  stocktake: 'تسجيل جرد',
  waste: 'تسجيل تالف',
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The three stock movements an owner makes from the catalogue screen. Kept in
 * one sheet so the row action menu has one place to open and the list never
 * navigates away for a numeric edit.
 */
export function InventoryOpForm({
  ingredient,
  op,
  onClose,
}: {
  ingredient: Ingredient;
  op: InventoryOpKind;
  onClose: () => void;
}) {
  const restock = useRestock();
  const waste = useRecordWaste();
  const adjust = useAdjustStock();

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const red = useColor('red');
  const green = useColor('green');
  const orange = useColor('orange');
  const border = useColor('border');

  const [mode, setMode] = useState<'pack' | 'qty'>('pack');
  const [amount, setAmount] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [packagePrice, setPackagePrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [counted, setCounted] = useState('');

  // Reset only when the item or the operation changes, not when a refresh
  // replaces the row object underneath an open sheet.
  useEffect(() => {
    setMode('pack');
    setAmount('');
    setUnitCost('');
    setPackagePrice('');
    setSupplier(ingredient.supplier ?? '');
    setNote('');
    setCounted(String(round(Number(ingredient.stockQuantity) || 0)));
  }, [ingredient.id, op]);

  const saving = restock.isPending || waste.isPending || adjust.isPending;
  const unit = ingredient.unit;
  const stock = round(Number(ingredient.stockQuantity) || 0);
  const packSize = Math.max(1, Number(ingredient.purchaseQty) || 1);

  const added = (() => {
    const value = Number(amount) || 0;
    return mode === 'pack' ? round(value * packSize) : round(value);
  })();

  const countedValue = Number(counted) || 0;
  const delta = round(countedValue - stock);
  const differenceValue = round(Math.abs(delta) * (Number(ingredient?.costPerUnit) || 0));

  const failure = (err: unknown) => {
    Alert.alert('تعذّر تسجيل الحركة', err instanceof Error ? err.message : 'حاول تاني');
  };

  const saveRestock = async () => {
    if (!ingredient || added <= 0) {
      Alert.alert('اكتب كمية صحيحة');
      return;
    }
    try {
      await restock.mutateAsync({
        id: ingredient.id,
        body: {
          qty: Number(amount),
          byQuantity: mode === 'qty',
          packagePrice: mode === 'pack' && packagePrice ? Number(packagePrice) : undefined,
          unitCost: mode === 'qty' && unitCost ? Number(unitCost) : undefined,
          supplier: supplier.trim() || undefined,
          note: note.trim() || undefined,
        },
      });
      onClose();
    } catch (err) {
      failure(err);
    }
  };

  const saveStocktake = async () => {
    if (!ingredient) return;
    if (!Number.isFinite(countedValue) || countedValue < 0) {
      Alert.alert('اكتب كمية فعلية صحيحة');
      return;
    }
    if (delta === 0) {
      Alert.alert('الجرد مطابق', 'الكمية الفعلية مطابقة لرصيد النظام.');
      onClose();
      return;
    }
    try {
      await adjust.mutateAsync({
        id: ingredient.id,
        body: {
          delta,
          note: note.trim() ? `جرد — ${note.trim()}` : 'جرد',
        },
      });
      onClose();
    } catch (err) {
      failure(err);
    }
  };

  const saveWaste = async () => {
    if (!ingredient) return;
    const qty = Number(amount);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('اكتب كمية صحيحة');
      return;
    }
    try {
      await waste.mutateAsync({
        id: ingredient.id,
        body: { qty, note: note.trim() || undefined },
      });
      onClose();
    } catch (err) {
      failure(err);
    }
  };

  return (
    <View style={{ gap: 12 }}>
          <Text variant='caption' style={{ color: muted }}>
            {ingredient.name} · الرصيد الحالي {stock} {unit}
          </Text>

          {op === 'restock' ? (
            <>
              <Chips
                label='طريقة الاستلام'
                value={mode}
                onChange={(next) => setMode(next)}
                options={[
                  { value: 'pack', label: `عبوات (${packSize} ${unit})` },
                  { value: 'qty', label: 'كمية مباشرة' },
                ]}
              />
              <Field
                label={mode === 'pack' ? 'عدد العبوات' : `الكمية (${unit})`}
                value={amount}
                onChange={setAmount}
                keyboardType='number-pad'
                placeholder='0'
              />
              {mode === 'pack' ? (
                <Field
                  label='سعر العبوة (اختياري)'
                  value={packagePrice}
                  onChange={setPackagePrice}
                  keyboardType='number-pad'
                  placeholder='0'
                />
              ) : (
                <Field
                  label={`تكلفة الوحدة (${unit})`}
                  value={unitCost}
                  onChange={setUnitCost}
                  keyboardType='number-pad'
                  placeholder='0'
                />
              )}
              <Field label='المورد (اختياري)' value={supplier} onChange={setSupplier} placeholder='اختياري' />
              <Field label='ملاحظة' value={note} onChange={setNote} placeholder='اختياري' />
              <View style={[styles.summary, { borderColor: border }]}>
                <Text variant='caption' style={{ color: muted }}>
                  الإضافة
                </Text>
                <Text style={{ color: green, fontWeight: '700' }}>
                  +{added} {unit}
                </Text>
                <Text variant='caption' style={{ color: muted }}>
                  الرصيد بعد الاستلام
                </Text>
                <Text style={{ color: primary, fontWeight: '700' }}>
                  {round(stock + added)} {unit}
                </Text>
              </View>
              <Button
                loading={restock.isPending}
                disabled={saving || added <= 0}
                style={{ alignSelf: 'stretch' }}
                onPress={() => void saveRestock()}
              >
                تأكيد الاستلام
              </Button>
            </>
          ) : null}

          {op === 'stocktake' ? (
            <>
              <Field
                label={`الكمية الفعلية (${unit})`}
                value={counted}
                onChange={setCounted}
                keyboardType='number-pad'
              />
              <Field label='ملاحظة' value={note} onChange={setNote} placeholder='سبب الفرق أو ملاحظة الجرد' />
              <View style={[styles.summary, { borderColor: border }]}>
                <Text variant='caption' style={{ color: muted }}>
                  رصيد النظام
                </Text>
                <Text style={{ fontWeight: '700' }}>
                  {stock} {unit}
                </Text>
                <Text variant='caption' style={{ color: muted }}>
                  الفرق
                </Text>
                <Text style={{ color: delta < 0 ? red : green, fontWeight: '700' }}>
                  {delta > 0 ? '+' : ''}
                  {delta} {unit}
                </Text>
                <Text variant='caption' style={{ color: muted }}>
                  قيمة الفرق
                </Text>
                <Text style={{ color: delta < 0 ? red : orange, fontWeight: '700' }}>
                  {fmtDecimal(differenceValue)} ج.م
                </Text>
              </View>
              <Button
                loading={adjust.isPending}
                disabled={saving || counted === ''}
                variant={delta < 0 ? 'destructive' : 'default'}
                style={{ alignSelf: 'stretch' }}
                onPress={() => void saveStocktake()}
              >
                {delta === 0 ? 'الكمية مطابقة' : delta < 0 ? 'تسجيل العجز والتسوية' : 'تسجيل الفائض'}
              </Button>
            </>
          ) : null}

          {op === 'waste' ? (
            <>
              <Field
                label={`الكمية التالفة (${unit})`}
                value={amount}
                onChange={setAmount}
                keyboardType='number-pad'
                placeholder='0'
              />
              <Field label='ملاحظة' value={note} onChange={setNote} placeholder='السبب' />
              <View style={[styles.summary, { borderColor: border }]}>
                <Text variant='caption' style={{ color: muted }}>
                  الرصيد بعد التالف
                </Text>
                <Text style={{ color: red, fontWeight: '700' }}>
                  {round(stock - (Number(amount) || 0))} {unit}
                </Text>
              </View>
              <Button
                loading={waste.isPending}
                disabled={saving || !(Number(amount) > 0)}
                variant='destructive'
                style={{ alignSelf: 'stretch' }}
                onPress={() => void saveWaste()}
              >
                تأكيد التالف
              </Button>
            </>
          ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
});
