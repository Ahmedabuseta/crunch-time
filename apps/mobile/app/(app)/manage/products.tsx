import type { Category, Product } from '@/api/types';
import { AdminScreen, Chips, ListRow, SearchField } from '@/components/app/AdminKit';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useDeleteProduct, useSaveProduct } from '@/hooks/mutations/catalogue';
import { useCategories, usePagedProducts } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { fmtMoneyInt } from '@/lib/format';
import { rangeLabel } from '@/lib/listQuery';
import { useRouter } from 'expo-router';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable } from 'react-native';

// A stable empty list, so identity survives a render without data.
const EMPTY_CATEGORIES: Category[] = [];

export default function ProductsScreen() {
  const router = useRouter();
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');
  const green = useColor('green');
  const red = useColor('red');

  const categoriesQuery = useCategories();
  const paged = usePagedProducts();
  const categories: Category[] = categoriesQuery.data?.categories ?? EMPTY_CATEGORIES;
  // Paged, searched and sorted by the server — the list no longer holds the
  // whole catalogue, so narrowing it here would only filter one page.
  const products = paged.items;
  const loading = paged.loading;
  const saveProduct = useSaveProduct();
  const deleteProduct = useDeleteProduct();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([categoriesQuery.refetch(), paged.refresh()]);
    setRefreshing(false);
  };

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

  const toggleActive = async (product: Product) => {
    try {
      await saveProduct.mutateAsync({ id: product.id, body: { active: !product.active } });
    } catch (err: any) {
      Alert.alert('تعذّر التحديث', err?.message ?? '');
    }
  };

  const remove = (product: Product) => {
    Alert.alert('حذف الصنف', `تدفع «${product.name}» للتقاعد؟`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: async () => {
          try {
            await deleteProduct.mutateAsync({ id: product.id });
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
            const res: any = await deleteProduct.mutateAsync({ id: product.id, hard: true });
            if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
          } catch (err: any) {
            Alert.alert('تعذّر الحذف', err?.message ?? '');
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen
      title='المنتجات'
      subtitle={`${paged.total} صنف`}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={paged.loadMore}
      loadingMore={paged.loadingMore}
      hasMore={paged.hasMore}
      listSummary={rangeLabel(paged.items.length, paged.total)}
      right={
        <Pressable
          onPress={() => router.push('/manage/product')}
          style={{ padding: 6 }}
          accessibilityLabel='إضافة صنف'
        >
          <Plus size={20} color={primary} />
        </Pressable>
      }
    >
      <SearchField value={paged.search} onChange={paged.onSearch} placeholder='ابحث عن صنف…' />
      <Chips
        value={(paged.filters.categoryId as string) ?? ''}
        onChange={(value) => paged.setFilter('categoryId', value || undefined)}
        options={[{ value: '', label: 'الكل' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
      />

      {loading ? (
        <>
          <Skeleton height={64} style={{ borderRadius: 18 }} />
          <Skeleton height={64} style={{ borderRadius: 18 }} />
        </>
      ) : products.length === 0 ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
          مفيش أصناف مطابقة
        </Text>
      ) : (
        <Card style={{ gap: 4 }}>
          {products.map((product) => (
            <ListRow
              key={product.id}
              leading={<Text style={{ fontSize: 22 }}>{product.emoji}</Text>}
              title={product.name}
              subtitle={`${fmtMoneyInt(product.price)} ج.م · ${categoryName(product.categoryId)}${product.active ? '' : ' · معطّل'}`}
              tint={product.active ? undefined : red}
              onPress={() => router.push(`/manage/product?id=${product.id}`)}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Pressable
                    onPress={() => void toggleActive(product)}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text variant='caption' style={{ color: product.active ? green : muted, fontWeight: '700' }}>
                      {product.active ? 'نشط' : 'معطّل'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => router.push(`/manage/product?id=${product.id}`)} style={{ padding: 6 }}>
                    <Pencil size={15} color={muted} />
                  </Pressable>
                  <Pressable onPress={() => remove(product)} style={{ padding: 6 }}>
                    <Trash2 size={15} color={red} />
                  </Pressable>
                </View>
              }
            />
          ))}
        </Card>
      )}

      {categories.length === 0 && !loading ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center' }}>
          أضف قسماً الأول من شاشة الأقسام.
        </Text>
      ) : (
        <Text variant='caption' style={{ color: muted }}>
          السعر اللي بتكتبه هو سعر البيع — الخصومات والإضافات بتتظبط من الكمبيوتر.
        </Text>
      )}
    </AdminScreen>
  );
}
