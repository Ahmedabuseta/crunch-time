import { AdminScreen, Field } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useSaveCategory } from '@/hooks/mutations/catalogue';
import { useCategory } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { categoryColor } from '@/lib/categoryColors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable } from 'react-native';

// The till stores category colours as its CSS variables, so writing one of
// these keeps the phone and the PC showing the same palette.
const PALETTE: { value: string; label: string }[] = [
  { value: 'var(--cat-burgers)', label: 'أحمر' },
  { value: 'var(--cat-pizza)', label: 'برتقالي' },
  { value: 'var(--cat-chicken)', label: 'أصفر' },
  { value: 'var(--cat-sides)', label: 'أخضر' },
  { value: 'var(--cat-drinks)', label: 'أزرق' },
  { value: 'var(--cat-desserts)', label: 'بنفسجي' },
  { value: 'var(--cat-crepe-savory)', label: 'كريب حادق' },
  { value: 'var(--cat-crepe-sweet)', label: 'كريب حلو' },
  { value: 'var(--cat-meals)', label: 'وجبات' },
];

interface Draft {
  id?: string;
  name: string;
  emoji: string;
  color: string;
  active: boolean;
}

const emptyDraft = (): Draft => ({ name: '', emoji: '🍽️', color: PALETTE[0].value, active: true });

export default function CategoryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const muted = useColor('mutedForeground');
  const border = useColor('border');

  const categoryQuery = useCategory(id);
  const saveCategory = useSaveCategory();
  const [edits, setEdits] = useState<Partial<Draft>>({});
  const [busy, setBusy] = useState(false);

  // The draft is derived, not copied into state: the fetched row is the base and
  // local edits sit on top, so nothing has to seed state when the row arrives.
  const category = categoryQuery.data?.category;
  const base: Draft | null = id
    ? category
      ? {
          id: category.id,
          name: category.name,
          emoji: category.emoji,
          color: category.color,
          active: category.active,
        }
      : null
    : emptyDraft();
  const draft: Draft | null = base ? { ...base, ...edits } : null;
  const loading = !base && categoryQuery.isLoading;

  const save = async () => {
    if (!draft?.name.trim()) {
      Alert.alert('اكتب اسم القسم');
      return;
    }
    setBusy(true);
    try {
      await saveCategory.mutateAsync({
        id: draft.id,
        body: {
          name: draft.name.trim(),
          emoji: draft.emoji.trim() || '🍽️',
          color: draft.color,
          ...(draft.id ? { active: draft.active } : {}),
        },
      });
      router.back();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminScreen title={id ? 'تعديل قسم' : 'قسم جديد'}>
      {loading ? (
        <Skeleton height={64} style={{ borderRadius: 18 }} />
      ) : draft ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='الاسم' value={draft.name} onChange={(v) => setEdits((prev) => ({ ...prev, name: v }))} placeholder='كريب حادق' />
            </View>
            <View style={{ width: 90 }}>
              <Field label='الأيقونة' value={draft.emoji} onChange={(v) => setEdits((prev) => ({ ...prev, emoji: v }))} />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
              اللون
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PALETTE.map((colour) => {
                const active = draft.color === colour.value;
                return (
                  <Pressable
                    key={colour.value}
                    onPress={() => setEdits((prev) => ({ ...prev, color: colour.value }))}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: categoryColor(colour.value, muted),
                      borderWidth: active ? 3 : 1,
                      borderColor: active ? muted : border,
                    }}
                  />
                );
              })}
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
          مفيش قسم مطابق
        </Text>
      )}
    </AdminScreen>
  );
}
