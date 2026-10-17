import type { Ingredient, RecipeLine, SubRecipe } from '@/api/types';
import { AdminScreen, ListRow, SearchField } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useDeleteRecipe, useUpsertRecipe } from '@/hooks/mutations/recipe';
import { useIngredients } from '@/hooks/queries/inventory';
import { useProductRecipes, useSubRecipes } from '@/hooks/queries/reference';
import { useColor } from '@/hooks/useColor';
import { fmtMoneyInt } from '@/lib/format';
import {
  activeSubRecipes,
  availableIngredients,
  isOverpriced,
  isSubRecipeLine,
  lineCost,
  lineName,
  lineUnit,
  recipeTotal,
} from '@/lib/recipe';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Layers, Package, Plus, Trash2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

/** How many picker rows to render at once; the search narrows the rest. */
const MAX_OPTIONS = 30;

type PickerKind = 'ingredient' | 'sub-recipe';

interface PickerState {
  kind: PickerKind;
  /** Set when re-picking an existing line rather than adding one. */
  lineId: string | null;
  ingredientId: string;
  subRecipeId: string;
  quantity: string;
  search: string;
}

const CLOSED: PickerState = {
  kind: 'ingredient',
  lineId: null,
  ingredientId: '',
  subRecipeId: '',
  quantity: '',
  search: '',
};

// Stable empty lists, so the memos below are not invalidated every render.
const EMPTY_LINES: RecipeLine[] = [];
const EMPTY_INGREDIENTS: Ingredient[] = [];
const EMPTY_SUB_RECIPES: SubRecipe[] = [];

/**
 * What a product consumes — the recipe. Recipes live on the till too, and the
 * server bills the ingredients to each sale, so this has to agree with it
 * rather than keep its own idea of the cost.
 */
export default function RecipeScreen() {
  const { productId, name, price } = useLocalSearchParams<{
    productId: string;
    name?: string;
    price?: string;
  }>();
  const sellingPrice = Number(price) > 0 ? Number(price) : undefined;

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const green = useColor('green');
  const red = useColor('red');
  const border = useColor('border');
  const secondary = useColor('secondary');

  const recipesQuery = useProductRecipes(productId);
  const ingredientsQuery = useIngredients();
  const subRecipesQuery = useSubRecipes();
  const upsertRecipe = useUpsertRecipe();
  const deleteRecipe = useDeleteRecipe();

  const lines: RecipeLine[] = recipesQuery.data?.recipes ?? EMPTY_LINES;
  const ingredients: Ingredient[] = ingredientsQuery.data?.ingredients ?? EMPTY_INGREDIENTS;
  const subRecipes: SubRecipe[] = subRecipesQuery.data?.subRecipes ?? EMPTY_SUB_RECIPES;
  const loading = recipesQuery.isLoading || ingredientsQuery.isLoading;

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  /** Quantities being typed, keyed by line id; committed on blur. */
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      recipesQuery.refetch(),
      ingredientsQuery.refetch(),
      subRecipesQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const total = useMemo(() => recipeTotal(lines), [lines]);
  const overpriced = isOverpriced(total, sellingPrice);

  // Mirrors the server: on an edit both ids must be present, because whatever
  // is missing is written as null.
  const saveLine = async (body: {
    id?: string;
    ingredientId: string | null;
    subRecipeId: string | null;
    quantityPerUnit: number;
  }) => {
    if (!productId) return;
    setBusy(true);
    try {
      await upsertRecipe.mutateAsync({ ...body, productId });
    } catch (err: any) {
      Alert.alert('تعذّر حفظ الوصفة', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const removeLine = (line: RecipeLine) => {
    Alert.alert('حذف المكون', `تشيل «${lineName(line)}» من وصفة ${name ?? 'الصنف'}؟`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteRecipe.mutateAsync(line.id);
          } catch (err: any) {
            Alert.alert('تعذّر الحذف', err?.message ?? '');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const commitQuantity = (line: RecipeLine) => {
    const typed = quantities[line.id];
    if (typed === undefined) return;
    const next = Number(typed);
    setQuantities((prev) => {
      const { [line.id]: _drop, ...rest } = prev;
      return rest;
    });
    if (!Number.isFinite(next) || next <= 0 || next === line.quantityPerUnit) return;
    void saveLine({
      id: line.id,
      ingredientId: line.ingredientId,
      subRecipeId: line.subRecipeId,
      quantityPerUnit: next,
    });
  };

  const openPicker = (kind: PickerKind, line?: RecipeLine) =>
    setPicker({
      ...CLOSED,
      kind: line ? (isSubRecipeLine(line) ? 'sub-recipe' : 'ingredient') : kind,
      lineId: line?.id ?? null,
      ingredientId: line?.ingredientId ?? '',
      subRecipeId: line?.subRecipeId ?? '',
      quantity: line ? String(line.quantityPerUnit) : '',
    });

  const options = useMemo(() => {
    if (!picker) return [];
    const query = picker.search.trim().toLowerCase();
    if (picker.kind === 'sub-recipe') {
      return activeSubRecipes(subRecipes)
        .filter((sub) => !query || sub.name.toLowerCase().includes(query))
        .slice(0, MAX_OPTIONS)
        .map((sub) => ({
          id: sub.id,
          name: sub.name,
          unit: sub.unit,
          detail: `${fmtMoneyInt(sub.costPerUnit)} ج.م / ${sub.unit} · ${sub.ingredientCount} مكون`,
        }));
    }
    return availableIngredients(ingredients, lines, picker.lineId ?? undefined)
      .filter((ingredient) => !query || ingredient.name.toLowerCase().includes(query))
      .slice(0, MAX_OPTIONS)
      .map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        detail: `${fmtMoneyInt(ingredient.costPerUnit)} ج.م / ${ingredient.unit} · رصيد ${ingredient.stockQuantity}`,
      }));
  }, [picker, ingredients, subRecipes, lines]);

  const confirmPicker = () => {
    if (!picker) return;
    const isSub = picker.kind === 'sub-recipe';
    const chosen = isSub ? picker.subRecipeId : picker.ingredientId;
    if (!chosen) return;
    const quantity = Number(picker.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert('اكتب كمية صحيحة', 'الكمية لازم تكون أكبر من صفر.');
      return;
    }
    void saveLine({
      ...(picker.lineId ? { id: picker.lineId } : {}),
      ingredientId: isSub ? null : chosen,
      subRecipeId: isSub ? chosen : null,
      quantityPerUnit: quantity,
    }).then(() => setPicker(null));
  };

  const pickerUnit = (() => {
    if (!picker) return '';
    if (picker.kind === 'sub-recipe') {
      return subRecipes.find((sub) => sub.id === picker.subRecipeId)?.unit ?? '';
    }
    return ingredients.find((ingredient) => ingredient.id === picker.ingredientId)?.unit ?? '';
  })();

  return (
    <AdminScreen
      title={name ? `وصفة ${name}` : 'الوصفة'}
      subtitle='إيه اللي الصنف بيستهلكه من المخزون'
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {!productId ? (
        <Card>
          <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 20 }}>
            مفيش صنف مفتوح. افتح الوصفة من صفحة الصنف.
          </Text>
        </Card>
      ) : loading ? (
        <>
          <Skeleton height={90} style={{ borderRadius: 18 }} />
          <Skeleton height={140} style={{ borderRadius: 18 }} />
        </>
      ) : (
        <>
          <Card style={{ gap: 8 }}>
            <View style={styles.row}>
              <Text variant='caption' style={{ color: muted }}>
                إجمالي التكلفة
              </Text>
              <Text style={{ fontWeight: '700', color: overpriced ? red : green }}>
                {fmtMoneyInt(total)} ج.م
              </Text>
            </View>
            {sellingPrice ? (
              <View style={styles.row}>
                <Text variant='caption' style={{ color: muted }}>
                  سعر البيع
                </Text>
                <Text style={{ fontWeight: '700', color: primary }}>{fmtMoneyInt(sellingPrice)} ج.م</Text>
              </View>
            ) : null}
            {lines.length > 0 && sellingPrice ? (
              <View style={styles.row}>
                <Text variant='caption' style={{ color: muted }}>
                  الهامش
                </Text>
                <Text style={{ fontWeight: '700', color: overpriced ? red : green }}>
                  {fmtMoneyInt(sellingPrice - total)} ج.م
                </Text>
              </View>
            ) : null}
          </Card>

          {overpriced ? (
            <View style={[styles.warning, { borderColor: red }]}>
              <AlertTriangle size={16} color={red} />
              <Text variant='caption' style={{ color: red, fontWeight: '700', flex: 1 }}>
                تكلفة الوصفة ({fmtMoneyInt(total)} ج.م) أعلى من سعر البيع ({fmtMoneyInt(sellingPrice!)} ج.م)
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                onPress={() => openPicker('ingredient')}
                disabled={busy}
                style={{ alignSelf: 'stretch' }}
                icon={Plus}
              >
                إضافة مكون
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                variant='secondary'
                onPress={() => openPicker('sub-recipe')}
                disabled={busy || subRecipes.length === 0}
                style={{ alignSelf: 'stretch' }}
                icon={Layers}
              >
                وصفة فرعية
              </Button>
            </View>
          </View>

          {picker ? (
            <Card style={{ gap: 10 }}>
              <View style={styles.row}>
                <Text variant='subtitle' style={{ flex: 1 }}>
                  {picker.lineId
                    ? 'تغيير البند'
                    : picker.kind === 'sub-recipe'
                      ? 'إضافة وصفة فرعية'
                      : 'إضافة مكون'}
                </Text>
                <Pressable onPress={() => setPicker(null)} accessibilityLabel='إلغاء'>
                  <Text variant='caption' style={{ color: muted }}>
                    إلغاء
                  </Text>
                </Pressable>
              </View>

              <SearchField
                value={picker.search}
                onChange={(search) => setPicker({ ...picker, search })}
                placeholder={picker.kind === 'sub-recipe' ? 'ابحث عن وصفة فرعية…' : 'ابحث عن مادة…'}
              />

              <View style={{ gap: 2 }}>
                {options.length === 0 ? (
                  <Text variant='caption' style={{ color: muted, paddingVertical: 10, textAlign: 'center' }}>
                    {picker.kind === 'sub-recipe'
                      ? 'مفيش وصفات فرعية — اتعملت من الكمبيوتر'
                      : 'مفيش مواد متاحة — كل المواد اتضافت أو مفيش مواد خالص'}
                  </Text>
                ) : (
                  options.map((option) => {
                    const chosen =
                      picker.kind === 'sub-recipe'
                        ? picker.subRecipeId === option.id
                        : picker.ingredientId === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() =>
                          setPicker(
                            picker.kind === 'sub-recipe'
                              ? { ...picker, subRecipeId: option.id }
                              : { ...picker, ingredientId: option.id }
                          )
                        }
                        style={[
                          styles.option,
                          {
                            borderColor: chosen ? primary : border,
                            backgroundColor: chosen ? secondary : 'transparent',
                          },
                        ]}
                      >
                        <Text style={{ fontWeight: chosen ? '700' : '500' }} numberOfLines={1}>
                          {option.name}
                        </Text>
                        <Text variant='caption' style={{ color: muted }} numberOfLines={1}>
                          {option.detail}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>

              <View style={{ gap: 4 }}>
                <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
                  الكمية لكل وحدة {pickerUnit ? `(${pickerUnit})` : ''}
                </Text>
                <Input
                  placeholder='مثال: 0.25'
                  value={picker.quantity}
                  onChangeText={(quantity) => setPicker({ ...picker, quantity })}
                  keyboardType='decimal-pad'
                />
              </View>

              <Button
                onPress={confirmPicker}
                loading={busy}
                disabled={
                  picker.kind === 'sub-recipe' ? !picker.subRecipeId : !picker.ingredientId
                }
                style={{ alignSelf: 'stretch' }}
              >
                {picker.lineId ? 'حفظ التغيير' : 'إضافة للوصفة'}
              </Button>
            </Card>
          ) : null}

          <Card style={{ gap: 4 }}>
            <Text variant='subtitle' style={{ paddingBottom: 4 }}>
              المكونات ({lines.length})
            </Text>

            {lines.length === 0 ? (
              <View style={styles.empty}>
                <Package size={22} color={muted} />
                <Text variant='caption' style={{ color: muted, textAlign: 'center' }}>
                  مفيش مكونات بعد. أضف مكونات علشان المخزون يتخصم لوحده مع كل بيع، والتكلفة تتحسب صح.
                </Text>
              </View>
            ) : (
              lines.map((line) => {
                const sub = isSubRecipeLine(line);
                const cost = lineCost(line);
                const lineOver = isOverpriced(cost, sellingPrice);
                return (
                  <View key={line.id} style={{ gap: 6, paddingVertical: 4 }}>
                    <ListRow
                      leading={
                        <Text style={{ fontSize: 18 }}>{sub ? '🥣' : '📦'}</Text>
                      }
                      title={lineName(line)}
                      subtitle={`${fmtMoneyInt(cost)} ج.م · ${lineUnit(line)}`}
                      tint={lineOver ? red : sub ? primary : muted}
                      onPress={() => openPicker('ingredient', line)}
                      trailing={
                        <Pressable
                          onPress={() => removeLine(line)}
                          accessibilityLabel={`حذف ${lineName(line)}`}
                          style={{ padding: 6 }}
                        >
                          <Trash2 size={16} color={red} />
                        </Pressable>
                      }
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Input
                        value={quantities[line.id] ?? String(line.quantityPerUnit)}
                        onChangeText={(next) =>
                          setQuantities((prev) => ({ ...prev, [line.id]: next }))
                        }
                        onBlur={() => commitQuantity(line)}
                        keyboardType='decimal-pad'
                        containerStyle={{ flex: 1 }}
                      />
                      <Text variant='caption' style={{ color: muted, minWidth: 40 }}>
                        {lineUnit(line)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </Card>

          <Text variant='caption' style={{ color: muted }}>
            التكلفة بتتحسب من سعر وحدة كل مادة على الكمبيوتر، والمخزون بيتخصم لوحده مع كل طلب مبيع.
          </Text>
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  option: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, gap: 1 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 20, paddingHorizontal: 10 },
});
