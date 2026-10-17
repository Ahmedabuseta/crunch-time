import type { Category } from '@/api/types';
import { AdminScreen, ListRow } from '@/components/app/AdminKit';
import { ListControls, type SortOption } from '@/components/app/ListControls';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useDeleteCategory } from '@/hooks/mutations/catalogue';
import { usePagedCategories, useProducts } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { categoryColor } from '@/lib/categoryColors';
import { rangeLabel } from '@/lib/listQuery';
import { useRouter } from 'expo-router';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable } from 'react-native';

const CATEGORY_SORTS: SortOption[] = [
  { value: 'sortOrder', label: 'الترتيب' },
  { value: 'name', label: 'الاسم' },
];

export default function CategoriesScreen() {
  const router = useRouter();
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');
  const red = useColor('red');

  const paged = usePagedCategories();
  // The product count is the catalogue's size, not a page of it.
  const productsQuery = useProducts();
  const categories = paged.items;
  const productsCount = productsQuery.data?.total ?? 0;
  const loading = paged.loading;
  const deleteCategory = useDeleteCategory();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([paged.refresh(), productsQuery.refetch()]);
    setRefreshing(false);
  };

  const remove = (category: Category) => {
    Alert.alert(
      'حذف القسم',
      `لو القسم فيه أصناف نشطة مش هينفع يتعطّل. تقاعد «${category.name}»؟`,
      [
        { text: 'رجوع', style: 'cancel' },
        {
          text: 'تعطيل',
          onPress: async () => {
            try {
              const res: any = await deleteCategory.mutateAsync({ id: category.id });
              if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
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
              const res: any = await deleteCategory.mutateAsync({ id: category.id, hard: true });
              if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
            } catch (err: any) {
              Alert.alert('تعذّر الحذف', err?.message ?? '');
            }
          },
        },
      ]
    );
  };

  return (
    <AdminScreen
      title='الأقسام'
      subtitle={`${paged.total} قسم · ${productsCount} صنف`}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={paged.loadMore}
      loadingMore={paged.loadingMore}
      hasMore={paged.hasMore}
      listSummary={rangeLabel(paged.items.length, paged.total)}
      right={
        <Pressable
          onPress={() => router.push('/manage/category')}
          style={{ padding: 6 }}
          accessibilityLabel='إضافة قسم'
        >
          <Plus size={20} color={primary} />
        </Pressable>
      }
    >
      <ListControls
        search={paged.search}
        onSearch={paged.onSearch}
        searchPlaceholder='ابحث عن قسم…'
        sort={paged.sort}
        dir={paged.dir}
        sortOptions={CATEGORY_SORTS}
        onSort={paged.sortBy}
        summary={rangeLabel(paged.items.length, paged.total)}
      />

      {loading ? (
        <Skeleton height={64} style={{ borderRadius: 18 }} />
      ) : (
        <Card style={{ gap: 4 }}>
          {categories.map((category) => (
            <ListRow
              key={category.id}
              leading={
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: categoryColor(category.color, muted),
                  }}
                />
              }
              title={`${category.emoji} ${category.name}`}
              subtitle={category.active ? 'نشط' : 'معطّل'}
              tint={category.active ? categoryColor(category.color, muted) : red}
              onPress={() => router.push(`/manage/category?id=${category.id}`)}
              trailing={
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Pressable onPress={() => router.push(`/manage/category?id=${category.id}`)} style={{ padding: 6 }}>
                    <Pencil size={15} color={muted} />
                  </Pressable>
                  <Pressable onPress={() => remove(category)} style={{ padding: 6 }}>
                    <Trash2 size={15} color={red} />
                  </Pressable>
                </View>
              }
            />
          ))}
          {categories.length === 0 ? (
            <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 20 }}>
              مفيش أقسام مطابقة
            </Text>
          ) : null}
        </Card>
      )}
    </AdminScreen>
  );
}
