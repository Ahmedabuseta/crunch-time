import type { AppUser } from '@/api/types';
import { AdminScreen, ListRow } from '@/components/app/AdminKit';
import { ListControls, type SortOption } from '@/components/app/ListControls';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useDeleteUser } from '@/hooks/mutations/catalogue';
import { usePagedUsers } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { fmtMoneyInt } from '@/lib/format';
import { rangeLabel } from '@/lib/listQuery';
import { useRouter } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable } from 'react-native';

const USER_SORTS: SortOption[] = [
  { value: 'name', label: 'الاسم' },
  { value: 'createdAt', label: 'تاريخ الإضافة' },
  { value: 'role', label: 'الدور' },
];

export default function UsersScreen() {
  const router = useRouter();
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');
  const red = useColor('red');
  const green = useColor('green');

  const paged = usePagedUsers();
  // Paged, searched, filtered and sorted by the server.
  const users = paged.items;
  const loading = paged.loading;
  const deleteUser = useDeleteUser();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await paged.refresh();
    setRefreshing(false);
  };

  const remove = (user: AppUser) => {
    Alert.alert('تعطيل المستخدم', `تعطّل «${user.name}»؟ مش هيقدر يسجّل دخول.`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: async () => {
          try {
            const res: any = await deleteUser.mutateAsync({ id: user.id });
            if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
          } catch (err: any) {
            Alert.alert('تعذّر التعطيل', err?.message ?? '');
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen
      title='الموظفين'
      subtitle={`${paged.total} موظف`}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={paged.loadMore}
      loadingMore={paged.loadingMore}
      hasMore={paged.hasMore}
      listSummary={rangeLabel(paged.items.length, paged.total)}
      right={
        <Pressable
          onPress={() => router.push('/manage/user')}
          style={{ padding: 6 }}
          accessibilityLabel='إضافة مستخدم'
        >
          <Plus size={20} color={primary} />
        </Pressable>
      }
    >
      <ListControls
        search={paged.search}
        onSearch={paged.onSearch}
        searchPlaceholder='ابحث عن موظف…'
        sort={paged.sort}
        dir={paged.dir}
        sortOptions={USER_SORTS}
        onSort={paged.sortBy}
        summary={rangeLabel(paged.items.length, paged.total)}
        groups={[{ key: 'role', label: 'الدور', options: [{ value: 'admin', label: 'مدير' }, { value: 'cashier', label: 'كاشير' }] }]}
        values={paged.filters}
        onFilter={paged.setFilter}
      />

      {loading ? (
        <Skeleton height={64} style={{ borderRadius: 18 }} />
      ) : (
        <Card style={{ gap: 4 }}>
          {users.map((user) => (
            <ListRow
              key={user.id}
              leading={<Text style={{ fontSize: 18 }}>{user.role === 'admin' ? '🛡️' : '👤'}</Text>}
              title={user.name}
              subtitle={`${user.role === 'admin' ? 'مدير' : 'كاشير'}${user.hourlyRate ? ` · ${fmtMoneyInt(user.hourlyRate)}/س` : ''}${user.commissionRate ? ` · ${user.commissionRate}%` : ''}`}
              tint={user.active ? green : red}
              onPress={() => router.push(`/manage/user?id=${user.id}`)}
              trailing={
                <Pressable onPress={() => remove(user)} style={{ padding: 6 }}>
                  <Trash2 size={15} color={red} />
                </Pressable>
              }
            />
          ))}
          {users.length === 0 ? (
            <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 20 }}>
              مفيش موظفين مطابقين
            </Text>
          ) : null}
        </Card>
      )}

      <Text variant='caption' style={{ color: muted }}>
        الكاشير برقم سري قصير (4 خانات)، والمدير بكلمة سر أقوى (8 حروف على الأقل). الفتح والقفل من الكمبيوتر زي ما هو.
      </Text>
    </AdminScreen>
  );
}
