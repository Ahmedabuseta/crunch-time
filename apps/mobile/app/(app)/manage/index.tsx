// The admin catalogue, on one screen.
//
// Products and inventory share one list because the owner's questions cross the
// boundary constantly ("what does this cost, is it in stock, what is it made
// of"). The list is a FlatList over the server-paged query — search, filters,
// sorting and paging all happen on the server, so the phone never holds the
// whole catalogue. Editing stays in the existing modal forms; the row menu is
// where the frequent actions live, so the common path never leaves this screen.
import type { Category, Ingredient, Product } from '@/api/types';
import { SearchField } from '@/components/app/AdminKit';
import { InventoryRow, ProductRow } from '@/components/app/CatalogRow';
import { FilterSelect } from '@/components/app/FilterSelect';
import {
  INVENTORY_OP_TITLES,
  InventoryOpForm,
  type InventoryOpKind,
} from '@/components/app/InventoryOpSheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { useHaptics } from '@/hooks/useHaptics';
import { useDeleteProduct, useDuplicateProduct, useSaveProduct } from '@/hooks/mutations/catalogue';
import { useDeleteIngredient } from '@/hooks/mutations/inventory';
import { useCategories, usePagedProducts } from '@/hooks/queries/catalogue';
import { useLowStock, usePagedIngredients } from '@/hooks/queries/inventory';
import { INVENTORY_CATEGORIES, STORAGE_OPTIONS } from '@/lib/inventoryTaxonomy';
import { rangeLabel } from '@/lib/listQuery';
import { withOpacity } from '@/theme/colors';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ClipboardCheck,
  Copy,
  Eye,
  EyeOff,
  History,
  Layers,
  PackagePlus,
  Pencil,
  Plus,
  Puzzle,
  SlidersHorizontal,
  Tags,
  Trash2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabKey = 'products' | 'inventory';

type ActionItem =
  | { kind: 'product'; item: Product }
  | { kind: 'inventory'; item: Ingredient };

const PRODUCT_SORTS = [
  { value: 'name', label: 'الاسم' },
  { value: 'price', label: 'السعر' },
  { value: 'cost', label: 'التكلفة' },
];

const INGREDIENT_SORTS = [
  { value: 'name', label: 'الاسم' },
  { value: 'stock', label: 'الرصيد' },
  { value: 'cost', label: 'التكلفة' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'النشط فقط' },
  { value: 'all', label: 'كل الحالات' },
  { value: '0', label: 'المعطّل' },
];

const EMPTY_CATEGORIES: Category[] = [];

export default function CatalogueScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const feedback = useHaptics();
  const listRef = useRef<FlatList<Product | Ingredient>>(null);

  const [tab, setTab] = useState<TabKey>(params.tab === 'inventory' ? 'inventory' : 'products');
  const [action, setAction] = useState<ActionItem | null>(null);
  const [op, setOp] = useState<{ kind: InventoryOpKind; ingredient: Ingredient } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (params.tab === 'inventory' || params.tab === 'products') setTab(params.tab);
  }, [params.tab]);

  const products = usePagedProducts();
  const ingredients = usePagedIngredients();
  const low = useLowStock();
  const categoriesQuery = useCategories();
  const categories: Category[] = categoriesQuery.data?.categories ?? EMPTY_CATEGORIES;

  const saveProduct = useSaveProduct();
  const deleteProduct = useDeleteProduct();
  const duplicateProduct = useDuplicateProduct();
  const deleteIngredient = useDeleteIngredient();

  const primary = useColor('primary');
  const primaryForeground = useColor('primaryForeground');
  const card = useColor('card');
  const background = useColor('background');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const secondary = useColor('secondary');

  const paged = tab === 'products' ? products : ingredients;
  const data: (Product | Ingredient)[] = tab === 'products' ? products.items : ingredients.items;
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const productStatus = products.filters.active ?? (products.filters.includeInactive === '1' ? 'all' : '');
  const ingredientStatus =
    ingredients.filters.active ?? (ingredients.filters.includeInactive === '1' ? 'all' : '');

  const setProductStatus = (value: string) => {
    const next = { ...products.filters };
    delete next.active;
    delete next.includeInactive;
    if (value === 'all') next.includeInactive = '1';
    else if (value === '1' || value === '0') next.active = value;
    products.setFilters(next);
  };

  const setIngredientStatus = (value: string) => {
    const next = { ...ingredients.filters };
    delete next.active;
    delete next.includeInactive;
    if (value === 'all') next.includeInactive = '1';
    else if (value === '1' || value === '0') next.active = value;
    ingredients.setFilters(next);
  };

  const switchTab = useCallback(
    (next: TabKey) => {
      if (next === tab) return;
      feedback('selection');
      setTab(next);
      setAction(null);
      setOp(null);
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
    },
    [feedback, tab]
  );

  const openProduct = useCallback(
    (product: Product) => router.push(`/manage/product?id=${encodeURIComponent(product.id)}`),
    [router]
  );
  const openIngredient = useCallback(
    (ingredient: Ingredient) => router.push(`/manage/ingredient?id=${encodeURIComponent(ingredient.id)}`),
    [router]
  );
  const openProductActions = useCallback(
    (product: Product) => setAction({ kind: 'product', item: product }),
    []
  );
  const openIngredientActions = useCallback(
    (ingredient: Ingredient) => setAction({ kind: 'inventory', item: ingredient }),
    []
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([paged.refresh(), low.refetch(), categoriesQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [paged, low, categoriesQuery]);

  const toggleProduct = async (product: Product) => {
    setAction(null);
    try {
      await saveProduct.mutateAsync({ id: product.id, body: { active: !product.active } });
    } catch (err: any) {
      Alert.alert('تعذّر التحديث', err?.message ?? '');
    }
  };

  const duplicate = async (product: Product) => {
    setAction(null);
    try {
      const result: any = await duplicateProduct.mutateAsync(product.id);
      if (result?.id) router.push(`/manage/product?id=${encodeURIComponent(result.id)}`);
    } catch (err: any) {
      Alert.alert('تعذّر النسخ', err?.message ?? '');
    }
  };

  const removeProduct = (product: Product) => {
    setAction(null);
    Alert.alert('حذف الصنف', `تدفع «${product.name}» للتقاعد؟`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: () => {
          void deleteProduct
            .mutateAsync({ id: product.id })
            .catch((err: any) => Alert.alert('تعذّر الحذف', err?.message ?? ''));
        },
      },
      {
        text: 'حذف نهائي',
        style: 'destructive',
        onPress: () => {
          void deleteProduct
            .mutateAsync({ id: product.id, hard: true })
            .then((result: any) => {
              if (result?.ok === false) Alert.alert('مش ممكن', result.error ?? '');
            })
            .catch((err: any) => Alert.alert('تعذّر الحذف', err?.message ?? ''));
        },
      },
    ]);
  };

  const removeIngredient = (ingredient: Ingredient) => {
    setAction(null);
    Alert.alert('حذف المادة', `تقاعد «${ingredient.name}»؟ المواد المرتبطة بوصفات مش هتتعطل.`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: () => {
          void deleteIngredient
            .mutateAsync({ id: ingredient.id })
            .then((result: any) => {
              if (result?.ok === false) Alert.alert('مش ممكن', result.error ?? '');
            })
            .catch((err: any) => Alert.alert('تعذّر الحذف', err?.message ?? ''));
        },
      },
      {
        text: 'حذف نهائي',
        style: 'destructive',
        onPress: () => {
          void deleteIngredient
            .mutateAsync({ id: ingredient.id, hard: true })
            .then((result: any) => {
              if (result?.ok === false) Alert.alert('مش ممكن', result.error ?? '');
            })
            .catch((err: any) => Alert.alert('تعذّر الحذف', err?.message ?? ''));
        },
      },
    ]);
  };

  const openRecipe = (product: Product) => {
    setAction(null);
    router.push({
      pathname: '/manage/recipe',
      params: {
        productId: product.id,
        name: product.name,
        price: String(product.price),
      },
    });
  };

  const renderItem = useCallback(
    ({ item }: { item: Product | Ingredient }) => {
      if (tab === 'products') {
        const product = item as Product;
        return (
          <ProductRow
            product={product}
            categoryName={categoryNames.get(product.categoryId) ?? ''}
            onPress={openProduct}
            onActions={openProductActions}
          />
        );
      }
      const ingredient = item as Ingredient;
      return (
        <InventoryRow
          ingredient={ingredient}
          onPress={openIngredient}
          onActions={openIngredientActions}
        />
      );
    },
    [categoryNames, openIngredient, openIngredientActions, openProduct, openProductActions, tab]
  );

  const header = (
    <View style={{ gap: 12, paddingTop: insets.top + 8 }}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.iconButton}
          accessibilityRole='button'
          accessibilityLabel='رجوع'
        >
          <ArrowRight size={21} color={muted} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant='title' numberOfLines={1}>الكتالوج والمخزون</Text>
          <Text variant='caption' numberOfLines={1} style={{ color: muted }}>
            أصناف ومخزون — كل حاجة من شاشة واحدة
          </Text>
        </View>
        {tab === 'products' ? (
          <Pressable
            onPress={() => router.push('/manage/categories')}
            hitSlop={10}
            style={styles.iconButton}
            accessibilityRole='button'
            accessibilityLabel='الأقسام'
          >
            <Tags size={19} color={muted} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            feedback('selection');
            router.push(tab === 'products' ? '/manage/product' : '/manage/ingredient');
          }}
          style={[styles.addButton, { backgroundColor: primary }]}
          accessibilityRole='button'
          accessibilityLabel={tab === 'products' ? 'إضافة صنف' : 'إضافة مادة'}
        >
          <Plus size={20} color={primaryForeground} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Stat label='أصناف' value={products.total} />
        <Stat label='مواد' value={ingredients.total} />
        <Stat
          label='تحت الحد'
          value={low.data?.total ?? 0}
          tone={(low.data?.total ?? 0) > 0 ? 'bad' : 'good'}
        />
      </View>

      <View style={[styles.segment, { backgroundColor: secondary }]}>
        {(
          [
            ['products', 'الأصناف', products.total],
            ['inventory', 'المخزون', ingredients.total],
          ] as const
        ).map(([key, label, count]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => switchTab(key)}
              style={[styles.segmentItem, active && { backgroundColor: primary }]}
              accessibilityRole='button'
              accessibilityState={{ selected: active }}
            >
              <Text style={{ color: active ? primaryForeground : muted, fontWeight: '700' }}>
                {label}
              </Text>
              <Text style={{ color: active ? primaryForeground : muted, fontSize: 11 }}>
                {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <SearchField
            value={paged.search}
            onChange={paged.onSearch}
            placeholder={tab === 'products' ? 'ابحث عن صنف…' : 'ابحث عن مادة…'}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
        style={{ marginHorizontal: -16 }}
      >
        {tab === 'products' ? (
          <>
            <FilterSelect
              label='القسم'
              value={(products.filters.categoryId as string) ?? ''}
              options={[
                { value: '', label: 'كل الأقسام' },
                ...categories.map((category) => ({ value: category.id, label: category.name })),
              ]}
              onChange={(value) => products.setFilter('categoryId', value || undefined)}
            />
            <FilterSelect
              label='الحالة'
              value={productStatus}
              options={STATUS_OPTIONS}
              onChange={setProductStatus}
            />
            <FilterSelect
              label='الترتيب'
              value={products.sort}
              options={PRODUCT_SORTS}
              onChange={(value) => products.sortBy(value)}
            />
          </>
        ) : (
          <>
            <FilterSelect
              label='الرصيد'
              value={(ingredients.filters.low as string) ?? ''}
              options={[
                { value: '', label: 'كل المخزون' },
                { value: '1', label: 'تحت الحد' },
              ]}
              onChange={(value) => ingredients.setFilter('low', value || undefined)}
            />
            <FilterSelect
              label='القسم'
              value={(ingredients.filters.category as string) ?? ''}
              options={[
                { value: '', label: 'كل الأقسام' },
                ...INVENTORY_CATEGORIES.map((category) => ({
                  value: category.id,
                  label: category.label,
                })),
              ]}
              onChange={(value) => ingredients.setFilter('category', value || undefined)}
            />
            <FilterSelect
              label='التخزين'
              value={(ingredients.filters.storage as string) ?? ''}
              options={[
                { value: '', label: 'كل التخزين' },
                ...STORAGE_OPTIONS.map((storage) => ({
                  value: storage.id,
                  label: storage.label,
                })),
              ]}
              onChange={(value) => ingredients.setFilter('storage', value || undefined)}
            />
            <FilterSelect
              label='الحالة'
              value={ingredientStatus}
              options={STATUS_OPTIONS}
              onChange={setIngredientStatus}
            />
            <FilterSelect
              label='الترتيب'
              value={ingredients.sort}
              options={INGREDIENT_SORTS}
              onChange={(value) => ingredients.sortBy(value)}
            />
          </>
        )}

        <Pressable
          onPress={() => {
            feedback('selection');
            paged.sortBy(paged.sort, paged.dir === 'asc' ? 'desc' : 'asc');
          }}
          style={[styles.direction, { borderColor: border, backgroundColor: card }]}
          accessibilityRole='button'
          accessibilityLabel='اتجاه الترتيب'
        >
          <Text variant='caption' style={{ fontWeight: '700' }}>
            {paged.dir === 'asc' ? 'تصاعدي' : 'تنازلي'}
          </Text>
          {paged.dir === 'asc' ? (
            <ArrowUp size={13} color={primary} />
          ) : (
            <ArrowDown size={13} color={primary} />
          )}
        </Pressable>

        <Text variant='caption' style={{ color: muted, alignSelf: 'center' }}>
          {rangeLabel(paged.items.length, paged.total)}
        </Text>
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: background }}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => `${tab}-${item.id}`}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode='on-drag'
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={primary} />
        }
        onEndReached={paged.loadMore}
        onEndReachedThreshold={0.4}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          paged.loading ? (
            <View style={{ gap: 10, paddingTop: 4 }}>
              <Skeleton height={76} variant='rounded' />
              <Skeleton height={76} variant='rounded' />
              <Skeleton height={76} variant='rounded' />
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 36 }}>
              <Text variant='caption' style={{ color: muted }}>
                {paged.error
                  ? paged.error
                  : tab === 'products'
                    ? 'مفيش أصناف مطابقة'
                    : 'مفيش مواد مطابقة'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {paged.loadingMore ? (
              <ActivityIndicator color={primary} />
            ) : paged.hasMore ? (
              <Pressable onPress={paged.loadMore} style={styles.loadMore}>
                <Text variant='caption' style={{ color: primary, fontWeight: '700' }}>
                  حمّل المزيد
                </Text>
              </Pressable>
            ) : data.length > 0 ? (
              <Text variant='caption' style={{ color: muted }}>
                {rangeLabel(paged.items.length, paged.total)}
              </Text>
            ) : null}
          </View>
        }
      />

      {/* One sheet for the action menu and the stock operation it opens. Two
          nested Modals would race: the second one is presented while the first
          is still dismissing, which is why "تسوية" appeared to do nothing. */}
      <BottomSheet
        isVisible={Boolean(action || op)}
        onClose={() => {
          setAction(null);
          setOp(null);
        }}
        title={op ? INVENTORY_OP_TITLES[op.kind] : action?.item.name ?? ''}
      >
        {op ? (
          <InventoryOpForm
            ingredient={op.ingredient}
            op={op.kind}
            onClose={() => {
              setOp(null);
              setAction(null);
            }}
          />
        ) : action?.kind === 'product' ? (
          <View style={{ gap: 4 }}>
            <ActionRow
              icon={Pencil}
              title='تعديل الصنف'
              detail='الاسم، السعر، التكلفة، القسم والوصف'
              onPress={() => {
                setAction(null);
                openProduct(action.item);
              }}
            />
            <ActionRow
              icon={Copy}
              title='نسخة من الصنف'
              detail='نسخة مخفية بنفس الوصفة والخيارات'
              onPress={() => void duplicate(action.item)}
            />
            <ActionRow
              icon={action.item.active ? EyeOff : Eye}
              title={action.item.active ? 'إخفاء من المنيو' : 'إظهار في المنيو'}
              onPress={() => void toggleProduct(action.item)}
            />
            <ActionRow
              icon={Layers}
              title='الوصفة'
              detail='المكونات وتكلفة الصنف'
              onPress={() => openRecipe(action.item)}
            />
            <ActionRow
              icon={Puzzle}
              title='الإضافات'
              detail='إدارة الإضافات المرتبطة بالأصناف'
              onPress={() => {
                setAction(null);
                router.push('/manage/addons');
              }}
            />
            <ActionRow
              icon={SlidersHorizontal}
              title='الخيارات'
              detail='مجموعات الخيارات والموديفاير'
              onPress={() => {
                setAction(null);
                router.push('/manage/modifiers');
              }}
            />
            <ActionRow
              icon={Trash2}
              title='حذف أو تعطيل'
              detail='تعطيل ناعم أو حذف نهائي'
              tone='bad'
              onPress={() => removeProduct(action.item)}
            />
          </View>
        ) : action?.kind === 'inventory' ? (
          <View style={{ gap: 4 }}>
            <ActionRow
              icon={Pencil}
              title='تعديل المادة'
              detail='الوحدة، القسم، التخزين، الحدود والأسعار'
              onPress={() => {
                setAction(null);
                openIngredient(action.item);
              }}
            />
            <ActionRow
              icon={PackagePlus}
              title='استلام مخزون'
              detail='عبوات أو كمية مباشرة، بسعر المورد'
              onPress={() => {
                setOp({ kind: 'restock', ingredient: action.item });
              }}
            />
            <ActionRow
              icon={ClipboardCheck}
              title='تسجيل جرد'
              detail='الكمية الفعلية والفرق والقيمة'
              onPress={() => {
                setOp({ kind: 'stocktake', ingredient: action.item });
              }}
            />
            <ActionRow
              icon={AlertTriangle}
              title='تسجيل تالف'
              detail='خصم كمية تالفة مع سبب'
              onPress={() => {
                setOp({ kind: 'waste', ingredient: action.item });
              }}
            />
            <ActionRow
              icon={History}
              title='الحركة والتعديل'
              detail='آخر الحركات وسجل المخزون'
              onPress={() => {
                setAction(null);
                openIngredient(action.item);
              }}
            />
            <ActionRow
              icon={Trash2}
              title='حذف أو تعطيل'
              detail='تعطيل ناعم أو حذف نهائي'
              tone='bad'
              onPress={() => removeIngredient(action.item)}
            />
          </View>
        ) : null}
      </BottomSheet>

    </View>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'bad';
}) {
  const card = useColor('card');
  const border = useColor('border');
  const muted = useColor('mutedForeground');
  const red = useColor('red');
  const green = useColor('green');
  const color = tone === 'bad' ? red : tone === 'good' ? green : undefined;

  return (
    <View style={[styles.stat, { backgroundColor: card, borderColor: border }]}>
      <Text variant='caption' style={{ color: muted, fontSize: 11 }}>
        {label}
      </Text>
      <Text style={{ fontWeight: '700', fontSize: 18, color }}>{value.toLocaleString('en-US')}</Text>
    </View>
  );
}

function ActionRow({
  icon: Icon,
  title,
  detail,
  tone = 'default',
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  detail?: string;
  tone?: 'default' | 'bad';
  onPress: () => void;
}) {
  const muted = useColor('mutedForeground');
  const red = useColor('red');
  const primary = useColor('primary');
  const border = useColor('border');
  const color = tone === 'bad' ? red : primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, { borderColor: border, opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole='button'
      accessibilityLabel={title}
    >
      <View style={[styles.actionIcon, { backgroundColor: withOpacity(color, 0.12) }]}>
        <Icon size={17} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '700', color: tone === 'bad' ? red : undefined }}>{title}</Text>
        {detail ? (
          <Text variant='caption' style={{ color: muted, fontSize: 12 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <ChevronLeft size={16} color={muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: TAB_BAR_SPACE + 24,
    gap: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: { padding: 8, borderRadius: 999 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 2,
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 999,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  direction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  footer: { paddingVertical: 18, alignItems: 'center' },
  loadMore: { paddingVertical: 8, paddingHorizontal: 16 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
