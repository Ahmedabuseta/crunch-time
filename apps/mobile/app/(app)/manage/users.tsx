import { api } from '@/api/endpoints';
import type { AppUser } from '@/api/types';
import { AdminScreen, Chips, Field, ListRow, SearchField } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { fmtMoneyInt } from '@/lib/format';
import { Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable } from 'react-native';

interface Draft {
  id?: string;
  name: string;
  role: 'admin' | 'cashier';
  pin: string;
  hourlyRate: string;
  commissionRate: string;
}

const emptyDraft = (): Draft => ({
  name: '',
  role: 'cashier',
  pin: '',
  hourlyRate: '0',
  commissionRate: '0',
});

const ROLES = [
  { value: 'cashier' as const, label: 'كاشير' },
  { value: 'admin' as const, label: 'مدير' },
];

export default function UsersScreen() {
  const muted = useColor('mutedForeground');
  const red = useColor('red');
  const green = useColor('green');

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.users();
      setUsers(res.users);
    } catch (err: any) {
      Alert.alert('تعذّر تحميل المستخدمين', err?.message ?? '');
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

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((u) => !query || u.name.toLowerCase().includes(query));
  }, [users, search]);

  const edit = (user: AppUser) =>
    setDraft({
      id: user.id,
      name: user.name,
      role: user.role,
      pin: '',
      hourlyRate: String(user.hourlyRate),
      commissionRate: String(user.commissionRate),
    });

  const save = async () => {
    if (!draft?.name.trim()) {
      Alert.alert('اكتب الاسم');
      return;
    }
    if (!draft.id && draft.pin.trim().length < 4) {
      Alert.alert('الرقم السري', 'لازم 4 خانات على الأقل');
      return;
    }
    if (draft.role === 'admin' && draft.pin && draft.pin.trim().length < 8) {
      Alert.alert('كلمة سر المدير', 'لازم 8 حروف أو أكثر وتحتوي حروف مش أرقام بس');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: draft.name.trim(),
        role: draft.role,
        hourlyRate: Number(draft.hourlyRate) || 0,
        commissionRate: Number(draft.commissionRate) || 0,
      };
      if (draft.pin.trim()) body.pin = draft.pin.trim();
      if (draft.id) {
        const res: any = await api.updateUser(draft.id, body);
        if (res?.ok === false) {
          Alert.alert('مش ممكن', res.error ?? '');
          return;
        }
      } else {
        const res: any = await api.createUser(body);
        if (res?.ok === false) {
          Alert.alert('مش ممكن', res.error ?? '');
          return;
        }
      }
      setDraft(null);
      await load();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const remove = (user: AppUser) => {
    Alert.alert('تعطيل المستخدم', `تعطّل «${user.name}»؟ مش هيقدر يسجّل دخول.`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: async () => {
          try {
            const res: any = await api.deleteUser(user.id);
            if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
            await load();
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
      subtitle={`${users.filter((u) => u.active).length} مستخدم نشط`}
      refreshing={refreshing}
      onRefresh={onRefresh}
      right={
        <Button size='sm' className='rounded-xl' icon={Plus} loading={busy} onPress={() => setDraft(emptyDraft())}>
          إضافة
        </Button>
      }
    >
      {draft ? (
        <Card style={{ gap: 12 }}>
          <Text variant='subtitle'>{draft.id ? 'تعديل مستخدم' : 'مستخدم جديد'}</Text>
          <Field label='الاسم' value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder='محمد علي' />
          <Chips label='الصلاحية' value={draft.role} onChange={(role) => setDraft({ ...draft, role })} options={ROLES} />
          <Field
            label={draft.id ? 'رقم سري جديد (سيبه فاضي لو مش هتغيره)' : 'الرقم السري'}
            value={draft.pin}
            onChange={(v) => setDraft({ ...draft, pin: v })}
            secureTextEntry
            placeholder='••••'
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='أجر الساعة' value={draft.hourlyRate} onChange={(v) => setDraft({ ...draft, hourlyRate: v })} keyboardType='number-pad' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='نسبة العمولة %' value={draft.commissionRate} onChange={(v) => setDraft({ ...draft, commissionRate: v })} keyboardType='number-pad' />
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

      <SearchField value={search} onChange={setSearch} placeholder='ابحث عن موظف…' />

      {loading ? (
        <Skeleton height={64} style={{ borderRadius: 18 }} />
      ) : (
        <Card style={{ gap: 4 }}>
          {visible.map((user) => (
            <ListRow
              key={user.id}
              leading={<Text style={{ fontSize: 18 }}>{user.role === 'admin' ? '🛡️' : '👤'}</Text>}
              title={user.name}
              subtitle={`${user.role === 'admin' ? 'مدير' : 'كاشير'}${user.hourlyRate ? ` · ${fmtMoneyInt(user.hourlyRate)}/س` : ''}${user.commissionRate ? ` · ${user.commissionRate}%` : ''}`}
              tint={user.active ? green : red}
              onPress={() => edit(user)}
              trailing={
                <Pressable onPress={() => remove(user)} style={{ padding: 6 }}>
                  <Trash2 size={15} color={red} />
                </Pressable>
              }
            />
          ))}
          {visible.length === 0 ? (
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
