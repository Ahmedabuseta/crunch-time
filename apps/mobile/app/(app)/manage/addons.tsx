import { api } from '@/api/endpoints';
import type { Addon } from '@/api/types';
import { AdminScreen, Field, ListRow, SearchField } from '@/components/app/AdminKit';
import { FilterSelect } from '@/components/app/FilterSelect';
import { LinkProductsSheet } from '@/components/app/LinkProductsSheet';
import { AvoidKeyboard } from '@/components/ui/avoid-keyboard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import {
  useDeleteAddon,
  useSaveAddon,
  useSetAddonProducts,
} from '@/hooks/mutations/catalogue';
import { useAddons } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { fmtMoneyInt } from '@/lib/format';
import { Pencil, Plus, Trash2, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

interface Draft {
  name: string;
  emoji: string;
  price: string;
  active: boolean;
}

const EMPTY: Draft = { name: '', emoji: '➕', price: '', active: true };

export default function AddonsScreen() {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const card = useColor('card');
  const red = useColor('red');

  const addonsQuery = useAddons(true);
  const saveAddon = useSaveAddon();
  const deleteAddon = useDeleteAddon();
  const setAddonProducts = useSetAddonProducts();

  const addons = addonsQuery.data?.addons ?? [];
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Addon | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [linkFor, setLinkFor] = useState<Addon | null>(null);
  const [linkIds, setLinkIds] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return addons.filter((addon) => {
      if (status === 'active' && !addon.active) return false;
      if (status === 'hidden' && addon.active) return false;
      return !needle || addon.name.toLowerCase().includes(needle);
    });
  }, [addons, search, status]);

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY);
    setFormOpen(true);
  };

  const openEdit = (addon: Addon) => {
    setEditing(addon);
    setDraft({
      name: addon.name,
      emoji: addon.emoji,
      price: String(addon.price),
      active: addon.active !== false,
    });
    setFormOpen(true);
  };

  const save = async () => {
    const name = draft.name.trim();
    const price = Number(draft.price);
    if (!name) return Alert.alert('اسم الإضافة مطلوب');
    if (!Number.isFinite(price) || price < 0) return Alert.alert('اكتب سعر صحيح');

    try {
      await saveAddon.mutateAsync({
        id: editing?.id,
        body: {
          name,
          emoji: draft.emoji.trim() || '➕',
          price,
          active: draft.active,
        },
      });
      setFormOpen(false);
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    }
  };

  const toggleActive = async (addon: Addon) => {
    try {
      await saveAddon.mutateAsync({
        id: addon.id,
        body: { active: addon.active === false },
      });
    } catch (err: any) {
      Alert.alert('تعذّر التحديث', err?.message ?? '');
    }
  };

  const remove = (addon: Addon) => {
    Alert.alert('حذف الإضافة', `تعطّل «${addon.name}» وتشيلها من قوائم البيع؟`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: async () => {
          try {
            await deleteAddon.mutateAsync({ id: addon.id });
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
            await deleteAddon.mutateAsync({ id: addon.id, hard: true });
          } catch (err: any) {
            Alert.alert('تعذّر الحذف', err?.message ?? '');
          }
        },
      },
    ]);
  };

  const openLinks = async (addon: Addon) => {
    try {
      const res = await api.addonProducts(addon.id);
      setLinkIds(res.products.map((product) => product.id));
      setLinkFor(addon);
    } catch (err: any) {
      Alert.alert('تعذّر تحميل المنتجات', err?.message ?? '');
    }
  };

  return (
    <AdminScreen
      title='الإضافات'
      subtitle={`${addons.length} عنصر`}
      refreshing={addonsQuery.isFetching}
      onRefresh={() => void addonsQuery.refetch()}
      right={
        <Pressable onPress={openCreate} style={{ padding: 6 }} accessibilityLabel='إضافة جديدة'>
          <Plus size={20} color={primary} />
        </Pressable>
      }
    >
      <SearchField value={search} onChange={setSearch} placeholder='ابحث عن إضافة…' />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <FilterSelect
          label='الظهور'
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'الكل' },
            { value: 'active', label: 'ظاهر' },
            { value: 'hidden', label: 'مخفي' },
          ]}
        />
      </View>

      {addonsQuery.isLoading ? (
        <View style={{ paddingVertical: 30, alignItems: 'center' }}>
          <ActivityIndicator color={primary} />
        </View>
      ) : filtered.length === 0 ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
          مفيش إضافات مطابقة
        </Text>
      ) : (
        <Card style={{ gap: 2 }}>
          {filtered.map((addon) => (
            <ListRow
              key={addon.id}
              onPress={() => openEdit(addon)}
              leading={<Text style={{ fontSize: 22 }}>{addon.emoji}</Text>}
              title={addon.name}
              subtitle={`${fmtMoneyInt(addon.price)} ج.م · ${addon.productCount ?? 0} منتج${addon.active === false ? ' · مخفي' : ''}`}
              tint={addon.active === false ? muted : undefined}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Pressable onPress={() => void toggleActive(addon)} style={{ padding: 6 }}>
                    <Text
                      variant='caption'
                      style={{ color: addon.active === false ? muted : primary, fontWeight: '700' }}
                    >
                      {addon.active === false ? 'مخفي' : 'ظاهر'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => void openLinks(addon)} style={{ padding: 6 }}>
                    <Text style={{ color: primary, fontWeight: '700', fontSize: 12 }}>ربط</Text>
                  </Pressable>
                  <Pressable onPress={() => openEdit(addon)} style={{ padding: 6 }}>
                    <Pencil size={15} color={muted} />
                  </Pressable>
                  <Pressable onPress={() => remove(addon)} style={{ padding: 6 }}>
                    <Trash2 size={15} color={red} />
                  </Pressable>
                </View>
              }
            />
          ))}
        </Card>
      )}

      <Modal visible={formOpen} transparent animationType='slide' onRequestClose={() => setFormOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFormOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: card, borderColor: border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <ScrollView keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Text variant='title'>{editing ? 'تعديل إضافة' : 'إضافة جديدة'}</Text>
                <Pressable onPress={() => setFormOpen(false)} style={{ padding: 6 }}>
                  <X size={20} color={muted} />
                </Pressable>
              </View>
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Field label='الاسم' value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} placeholder='جبنة إضافية' />
                  </View>
                  <View style={{ width: 86 }}>
                    <Field label='الأيقونة' value={draft.emoji} onChange={(emoji) => setDraft((d) => ({ ...d, emoji }))} />
                  </View>
                </View>
                <Field label='السعر' value={draft.price} onChange={(price) => setDraft((d) => ({ ...d, price }))} keyboardType='number-pad' placeholder='10' />
                <Switch label='ظاهر في قوائم البيع' value={draft.active} onValueChange={(active) => setDraft((d) => ({ ...d, active }))} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button label='حفظ' loading={saveAddon.isPending} style={{ flex: 1 }} onPress={() => void save()} />
                  <Button label='إلغاء' variant='ghost' style={{ flex: 1 }} onPress={() => setFormOpen(false)} />
                </View>
              </View>
            </ScrollView>
          </Pressable>
          <AvoidKeyboard />
        </Pressable>
      </Modal>

      <LinkProductsSheet
        visible={Boolean(linkFor)}
        title={`ربط «${linkFor?.name ?? ''}» بالمنتجات`}
        productIds={linkIds}
        onSave={async (ids) => {
          if (!linkFor) return;
          await setAddonProducts.mutateAsync({ id: linkFor.id, productIds: ids });
        }}
        onClose={() => setLinkFor(null)}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  sheet: { borderRadius: 24, borderWidth: 1, padding: 16, maxHeight: '92%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
});
