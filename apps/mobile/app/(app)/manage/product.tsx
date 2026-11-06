import type { Category } from '@/api/types';
import { AdminScreen, Chips, Field } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useSaveProduct } from '@/hooks/mutations/catalogue';
import { useCategories, useProduct } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { editNumber } from '@/lib/format';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Layers } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

interface Draft {
  id?: string;
  name: string;
  price: string;
  costPrice: string;
  emoji: string;
  description: string;
  categoryId: string;
  active: boolean;
  supportsRollback: boolean;
}

const emptyDraft = (categoryId: string): Draft => ({
  name: '',
  price: '',
  costPrice: '',
  emoji: '🍔',
  description: '',
  categoryId,
  active: true,
  supportsRollback: true,
});

export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');
  const border = useColor('border');

  const categoriesQuery = useCategories();
  // One product by id, not a scan of the list — the list is paged now, so the
  // row being edited may not be on the page it would have loaded.
  const productQuery = useProduct(id);
  const saveProduct = useSaveProduct();
  const categories: Category[] = categoriesQuery.data?.categories ?? [];
  const [edits, setEdits] = useState<Partial<Draft>>({});
  const [busy, setBusy] = useState(false);

  // Derived draft: the fetched product is the base, local edits sit on top.
  const product = productQuery.data?.product;
  const base: Draft | null = id
    ? product
      ? {
          id: product.id,
          name: product.name,
          price: editNumber(product.price),
          costPrice: editNumber(product.costPrice ?? 0),
          emoji: product.emoji,
          description: product.description,
          categoryId: product.categoryId,
          active: product.active,
          supportsRollback: product.supportsRollback !== false,
        }
      : null
    : emptyDraft(categories[0]?.id ?? '');
  const draft: Draft | null = base ? { ...base, ...edits } : null;
  const loading = !base && (categoriesQuery.isLoading || productQuery.isLoading);

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
      await saveProduct.mutateAsync({
        id: draft.id,
        body: {
          name: draft.name.trim(),
          price,
          costPrice: Number(draft.costPrice) || 0,
          emoji: draft.emoji.trim() || '🍔',
          description: draft.description.trim(),
          categoryId: draft.categoryId,
          active: draft.active,
          supportsRollback: draft.supportsRollback,
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
    <AdminScreen title={id ? 'تعديل صنف' : 'صنف جديد'}>
      {loading ? (
        <Skeleton height={64} style={{ borderRadius: 18 }} />
      ) : draft ? (
        <Card style={{ gap: 12 }}>
          <Field label='الاسم' value={draft.name} onChange={(v) => setEdits((prev) => ({ ...prev, name: v }))} placeholder='كريب فراخ' />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label='السعر' value={draft.price} onChange={(v) => setEdits((prev) => ({ ...prev, price: v }))} keyboardType='number-pad' placeholder='70' />
            </View>
            <View style={{ flex: 1 }}>
              <Field label='التكلفة' value={draft.costPrice} onChange={(v) => setEdits((prev) => ({ ...prev, costPrice: v }))} keyboardType='number-pad' placeholder='حسب الوصفة' />
            </View>
            <View style={{ width: 78 }}>
              <Field label='الأيقونة' value={draft.emoji} onChange={(v) => setEdits((prev) => ({ ...prev, emoji: v }))} />
            </View>
          </View>
          <Chips
            label='القسم'
            value={draft.categoryId}
            onChange={(selected) => setEdits((prev) => ({ ...prev, categoryId: selected }))}
            options={categories.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))}
          />
          <Field label='الوصف' value={draft.description} onChange={(v) => setEdits((prev) => ({ ...prev, description: v }))} placeholder='لحم، خس، طماطم' multiline />
          <Switch
            label='ظاهر في المنيو'
            value={draft.active}
            onValueChange={(active) => setEdits((prev) => ({ ...prev, active }))}
          />
          <Switch
            label='يرجّع المخزون عند الاسترداد'
            value={draft.supportsRollback}
            onValueChange={(supportsRollback) => setEdits((prev) => ({ ...prev, supportsRollback }))}
          />

          {/* A recipe needs a saved product to hang off, so it only appears
              once there is an id. */}
          {draft.id ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/manage/recipe',
                  params: { productId: draft.id!, name: draft.name, price: draft.price },
                })
              }
              style={[styles.recipeLink, { borderColor: border }]}
            >
              <Layers size={18} color={primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>الوصفة</Text>
                <Text variant='caption' style={{ color: muted }}>
                  إيه اللي الصنف بيستهلكه من المخزون وتكلفته
                </Text>
              </View>
              <ChevronLeft size={16} color={muted} />
            </Pressable>
          ) : (
            <Text variant='caption' style={{ color: muted }}>
              احفظ الصنف الأول علشان تضيف الوصفة.
            </Text>
          )}

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
          مفيش صنف مطابق
        </Text>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  recipeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
});
