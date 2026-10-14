import { api } from '@/api/endpoints';
import type { Category, Product } from '@/api/types';
import { AdminScreen, Chips, Field, ListRow, SearchField } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { fmtMoneyInt } from '@/lib/format';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable } from 'react-native';

interface Draft {
  id?: string;
  name: string;
  price: string;
  emoji: string;
  description: string;
  categoryId: string;
  active: boolean;
}

const emptyDraft = (categoryId: string): Draft => ({
  name: '',
  price: '',
  emoji: '🍔',
  description: '',
  categoryId,
  active: true,
});

export default function ProductsScreen() {
  const muted = useColor('mutedForeground');
  const green = useColor('green');
  const red = useColor('red');

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([api.categories(), api.products()]);
      setCategories(cats.categories);
      setProducts(prods.products);
    } catch (err: any) {
      Alert.alert('تعذّر تحميل المنتجات', err?.message ?? '');
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
    return products
      .filter((p) => (filter ? p.categoryId === filter : true))
      .filter((p) => !query || p.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [products, search, filter]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

  const edit = (product: Product) =>
    setDraft({
      id: product.id,
      name: product.name,
      price: String(product.price),
      emoji: product.emoji,
      description: product.description,
      categoryId: product.categoryId,
      active: product.active,
    });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      Alert.alert('اكتب اسم الصنف');
      return;
    }
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('اكتب سعر صحيح');
      return;
    }
    if (!draft.categoryId) {
      Alert.alert('اختار القسم');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: draft.name.trim(),
        price,
        emoji: draft.emoji.trim() || '🍔',
        description: draft.description.trim(),
        categoryId: draft.categoryId,
        ...(draft.id ? { active: draft.active } : {}),
      };
      if (draft.id) await api.updateProduct(draft.id, body);
      else await api.createProduct(body);
      setDraft(null);
      await load();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (product: Product) => {
    try {
      await api.updateProduct(product.id, { active: !product.active });
      await load();
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
            await api.deleteProduct(product.id);
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
            const res: any = await api.deleteProduct(product.id, true);
            if (res?.ok === false) Alert.alert('مش ممكن', res.error ?? '');
            await load();
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
      subtitle={`${products.filter((p) => p.active).length} صنف نشط`}
      refreshing={refreshing}
      onRefresh={onRefresh}
      right={
        <Button
          size='sm'
          className='rounded-xl'
          icon={draft?.id ? undefined : Plus}
          loading={busy}
          onPress={() => setDraft(emptyDraft(categories[0]?.id ?? ''))}
        >
          إضافة
        </Button>
      }
    >
      {draft ? (
        <Card style={{ gap: 12 }}>
          <Text variant='subtitle'>{draft.id ? 'تعديل صنف' : 'صنف جديد'}</Text>
          <Field label='الاسم' value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder='كريب فراخ' />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='السعر' value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} keyboardType='number-pad' placeholder='70' />
            </View>
            <View style={{ width: 90 }}>
              <Field label='الأيقونة' value={draft.emoji} onChange={(v) => setDraft({ ...draft, emoji: v })} />
            </View>
          </View>
          <Chips
            label='القسم'
            value={draft.categoryId}
            onChange={(id) => setDraft({ ...draft, categoryId: id })}
            options={categories.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))}
          />
          <Field label='الوصف' value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} placeholder='لحم، خس، طماطم' multiline />
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

      <SearchField value={search} onChange={setSearch} placeholder='ابحث عن صنف…' />
      <Chips
        value={filter}
        onChange={setFilter}
        options={[{ value: '', label: 'الكل' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
      />

      {loading ? (
        <>
          <Skeleton height={64} style={{ borderRadius: 18 }} />
          <Skeleton height={64} style={{ borderRadius: 18 }} />
        </>
      ) : visible.length === 0 ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
          مفيش أصناف مطابقة
        </Text>
      ) : (
        <Card style={{ gap: 4 }}>
          {visible.map((product) => (
            <ListRow
              key={product.id}
              leading={<Text style={{ fontSize: 22 }}>{product.emoji}</Text>}
              title={product.name}
              subtitle={`${fmtMoneyInt(product.price)} ج.م · ${categoryName(product.categoryId)}${product.active ? '' : ' · معطّل'}`}
              tint={product.active ? undefined : red}
              onPress={() => edit(product)}
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
                  <Pressable onPress={() => edit(product)} style={{ padding: 6 }}>
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
