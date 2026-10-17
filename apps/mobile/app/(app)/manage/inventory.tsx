import { AdminScreen, ListRow } from '@/components/app/AdminKit';
import { ListControls, type SortOption } from '@/components/app/ListControls';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useLowStock, usePagedIngredients } from '@/hooks/queries/inventory';
import { useColor } from '@/hooks/useColor';
import { rangeLabel } from '@/lib/listQuery';
import { useRouter } from 'expo-router';
import { AlertTriangle, ChevronLeft, Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable } from 'react-native';

const INGREDIENT_SORTS: SortOption[] = [
  { value: 'name', label: 'الاسم' },
  { value: 'stock', label: 'الرصيد' },
  { value: 'cost', label: 'التكلفة' },
];

export default function InventoryScreen() {
  const router = useRouter();
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');
  const red = useColor('red');
  const warning = useColor('warning');

  const paged = usePagedIngredients();
  const low = useLowStock();
  // Paged, searched, filtered and sorted by the server.
  const ingredients = paged.items;
  const loading = paged.loading;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([paged.refresh(), low.refetch()]);
    setRefreshing(false);
  };

  const lowCount = low.data?.total ?? 0;
  const lowNames = low.data?.ingredients ?? [];

  return (
    <AdminScreen
      title='المخزون'
      subtitle={`${paged.total} مادة · ${lowCount} تحت الحد`}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={paged.loadMore}
      loadingMore={paged.loadingMore}
      hasMore={paged.hasMore}
      listSummary={rangeLabel(paged.items.length, paged.total)}
      right={
        <Pressable
          onPress={() => router.push('/manage/ingredient')}
          style={{ padding: 6 }}
          accessibilityLabel='إضافة مادة'
        >
          <Plus size={20} color={primary} />
        </Pressable>
      }
    >
      {lowCount > 0 ? (
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
            {lowCount} مادة وصلت للحد الأدنى: {lowNames.map((i) => i.name).join('، ')}
            {lowCount > lowNames.length ? '…' : ''}
          </Text>
        </View>
      ) : null}

      <ListControls
        search={paged.search}
        onSearch={paged.onSearch}
        searchPlaceholder='ابحث عن مادة…'
        sort={paged.sort}
        dir={paged.dir}
        sortOptions={INGREDIENT_SORTS}
        onSort={paged.sortBy}
        summary={rangeLabel(paged.items.length, paged.total)}
        groups={[
          {
            key: 'low',
            label: 'الرصيد',
            options: [{ value: '1', label: 'تحت الحد' }],
          },
        ]}
        values={paged.filters}
        onFilter={paged.setFilter}
      />

      {loading ? (
        <>
          <Skeleton height={64} style={{ borderRadius: 18 }} />
          <Skeleton height={64} style={{ borderRadius: 18 }} />
        </>
      ) : ingredients.length === 0 ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
          مفيش مواد مطابقة
        </Text>
      ) : (
        ingredients.map((ingredient) => {
          const low = ingredient.stockQuantity <= ingredient.minStock;
          return (
            <Card key={ingredient.id}>
              <ListRow
                title={ingredient.name}
                subtitle={`${ingredient.stockQuantity} ${ingredient.unit} · الحد ${ingredient.minStock} · ${ingredient.costPerUnit}/${ingredient.unit}`}
                tint={low ? red : muted}
                onPress={() => router.push(`/manage/ingredient?id=${ingredient.id}`)}
                trailing={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {low ? <AlertTriangle size={15} color={red} /> : null}
                    <ChevronLeft size={16} color={muted} />
                  </View>
                }
              />
            </Card>
          );
        })
      )}

      <Text variant='caption' style={{ color: muted }}>
        الرصيد بيتخصم لوحده مع كل طلب مبيع. الوصفات (كل صنف بيستهلك إيه) بتتظبط من صفحة الصنف ←
        الوصفة، أو من الكمبيوتر.
      </Text>
    </AdminScreen>
  );
}
