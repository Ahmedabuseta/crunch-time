import { AdminScreen, Chips, Field } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useSaveUser } from '@/hooks/mutations/catalogue';
import { useUser } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';

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

export default function UserFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const muted = useColor('mutedForeground');

  const userQuery = useUser(id);
  const saveUser = useSaveUser();
  const [edits, setEdits] = useState<Partial<Draft>>({});
  const [busy, setBusy] = useState(false);

  // Derived draft: the fetched user is the base, local edits sit on top.
  const user = userQuery.data?.user;
  const base: Draft | null = id
    ? user
      ? {
          id: user.id,
          name: user.name,
          role: user.role,
          pin: '',
          hourlyRate: String(user.hourlyRate),
          commissionRate: String(user.commissionRate),
        }
      : null
    : emptyDraft();
  const draft: Draft | null = base ? { ...base, ...edits } : null;
  const loading = !base && userQuery.isLoading;

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
      const res: any = await saveUser.mutateAsync({ id: draft.id, body });
      if (res?.ok === false) {
        Alert.alert('مش ممكن', res.error ?? '');
        return;
      }
      router.back();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminScreen title={id ? 'تعديل مستخدم' : 'مستخدم جديد'}>
      {loading ? (
        <Skeleton height={64} style={{ borderRadius: 18 }} />
      ) : draft ? (
        <Card style={{ gap: 12 }}>
          <Field label='الاسم' value={draft.name} onChange={(v) => setEdits((prev) => ({ ...prev, name: v }))} placeholder='محمد علي' />
          <Chips label='الصلاحية' value={draft.role} onChange={(role) => setEdits((prev) => ({ ...prev, role }))} options={ROLES} />
          <Field
            label={draft.id ? 'رقم سري جديد (سيبه فاضي لو مش هتغيره)' : 'الرقم السري'}
            value={draft.pin}
            onChange={(v) => setEdits((prev) => ({ ...prev, pin: v }))}
            secureTextEntry
            placeholder='••••'
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='أجر الساعة' value={draft.hourlyRate} onChange={(v) => setEdits((prev) => ({ ...prev, hourlyRate: v }))} keyboardType='number-pad' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='نسبة العمولة %' value={draft.commissionRate} onChange={(v) => setEdits((prev) => ({ ...prev, commissionRate: v }))} keyboardType='number-pad' />
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
        </Card>
      ) : (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 20 }}>
          مفيش مستخدم مطابق
        </Text>
      )}
    </AdminScreen>
  );
}
