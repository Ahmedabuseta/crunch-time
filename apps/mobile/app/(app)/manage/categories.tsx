import { api } from '@/api/endpoints';
import type { Category } from '@/api/types';
import { AdminScreen, Field, ListRow, SearchField } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { categoryColor } from '@/lib/categoryColors';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function CategoriesScreen() {
  const muted = useColor('mutedForeground');
  const red = useColor('red');
  const border = useColor('border');

  const [categories, setCategories] = useState<Category[]>([]);
  const [productsCount, setProductsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([api.categories(), api.products()]);
      setCategories(cats.categories);
      setProductsCount(prods.products.length);
    } catch (err: any) {
      Alert.alert('تعذّر تحميل الأقسام', err?.message ?? '');
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
    return categories
      .filter((c) => !query || c.name.toLowerCase().includes(query))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, search]);

  const edit = (category: Category) =>
    setDraft({
      id: category.id,
      name: category.name,
      emoji: category.emoji,
      color: category.color,
      active: category.active,
    });

  const save = async () => {
    if (!draft?.name.trim()) {
      Alert.alert('اكتب اسم القسم');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: draft.name.trim(),
        emoji: draft.emoji.trim() || '🍽️',
        color: draft.color,
        ...(draft.id ? { active: draft.active } : {}),
      };
      if (draft.id) await api.updateCategory(draft.id, body);
      else await api.createCategory(body);
      setDraft(null);
      await load();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
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
              const res: any = await api.deleteCategory(category.id);
              if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
              await load();
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
              const res: any = await api.deleteCategory(category.id, true);
              if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
              await load();
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
      subtitle={`${categories.length} قسم · ${productsCount} صنف`}
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
          <Text variant='subtitle'>{draft.id ? 'تعديل قسم' : 'قسم جديد'}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='الاسم' value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder='كريب حادق' />
            </View>
            <View style={{ width: 90 }}>
              <Field label='الأيقونة' value={draft.emoji} onChange={(v) => setDraft({ ...draft, emoji: v })} />
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
                    onPress={() => setDraft({ ...draft, color: colour.value })}
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
              <Button variant='ghost' style={{ alignSelf: 'stretch' }} onPress={() => setDraft(null)}>
                إلغاء
              </Button>
            </View>
          </View>
        </Card>
      ) : null}

      <SearchField value={search} onChange={setSearch} placeholder='ابحث عن قسم…' />

      {loading ? (
        <Skeleton height={64} style={{ borderRadius: 18 }} />
      ) : (
        <Card style={{ gap: 4 }}>
          {visible.map((category) => (
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
              onPress={() => edit(category)}
              trailing={
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Pressable onPress={() => edit(category)} style={{ padding: 6 }}>
                    <Pencil size={15} color={muted} />
                  </Pressable>
                  <Pressable onPress={() => remove(category)} style={{ padding: 6 }}>
                    <Trash2 size={15} color={red} />
                  </Pressable>
                </View>
              }
            />
          ))}
          {visible.length === 0 ? (
            <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 20 }}>
              مفيش أقسام مطابقة
            </Text>
          ) : null}
        </Card>
      )}
    </AdminScreen>
  );
}
