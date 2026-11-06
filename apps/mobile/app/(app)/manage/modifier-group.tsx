import { api } from '@/api/endpoints';
import type { Modifier, ModifierGroupSummary } from '@/api/types';
import { AdminScreen, Chips, Field, ListRow } from '@/components/app/AdminKit';
import { LinkProductsSheet } from '@/components/app/LinkProductsSheet';
import { AvoidKeyboard } from '@/components/ui/avoid-keyboard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import {
  useDeleteModifier,
  useReorderModifiers,
  useSaveModifier,
  useSaveModifierGroup,
  useSetModifierGroupProducts,
} from '@/hooks/mutations/catalogue';
import { useModifierGroup, useModifierGroupModifiers } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { fmtMoneyInt } from '@/lib/format';
import { useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, Link2, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';

interface GroupDraft {
  name: string;
  type: 'single-select' | 'multi-select';
  active: boolean;
}

interface OptionDraft {
  name: string;
  priceAdjustment: string;
  active: boolean;
}

const EMPTY_OPTION: OptionDraft = { name: '', priceAdjustment: '0', active: true };

export default function ModifierGroupScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const card = useColor('card');
  const red = useColor('red');

  const groupQuery = useModifierGroup(id);
  const modifiersQuery = useModifierGroupModifiers(id, true);
  const saveGroupMutation = useSaveModifierGroup();
  const saveModifier = useSaveModifier();
  const deleteModifier = useDeleteModifier();
  const reorderModifiers = useReorderModifiers();
  const setGroupProducts = useSetModifierGroupProducts();

  const group: ModifierGroupSummary | undefined = groupQuery.data?.group;
  const modifiers = modifiersQuery.data?.modifiers ?? [];

  const [groupEdits, setGroupEdits] = useState<Partial<GroupDraft>>({});
  const baseGroup: GroupDraft | null = group
    ? {
        name: group.name,
        type: group.type === 'multi-select' ? 'multi-select' : 'single-select',
        active: group.active !== false,
      }
    : null;
  const groupDraft: GroupDraft | null = baseGroup ? { ...baseGroup, ...groupEdits } : null;

  const [optionOpen, setOptionOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<Modifier | null>(null);
  const [optionDraft, setOptionDraft] = useState<OptionDraft>(EMPTY_OPTION);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkIds, setLinkIds] = useState<string[]>([]);

  const persistGroup = async () => {
    if (!id || !groupDraft) return;
    if (!groupDraft.name.trim()) return Alert.alert('اسم المجموعة مطلوب');
    try {
      await saveGroupMutation.mutateAsync({
        id,
        body: { name: groupDraft.name.trim(), type: groupDraft.type, active: groupDraft.active },
      });
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    }
  };

  const openCreateOption = () => {
    setEditingOption(null);
    setOptionDraft(EMPTY_OPTION);
    setOptionOpen(true);
  };

  const openEditOption = (modifier: Modifier) => {
    setEditingOption(modifier);
    setOptionDraft({
      name: modifier.name,
      priceAdjustment: String(modifier.priceAdjustment ?? 0),
      active: modifier.active !== false,
    });
    setOptionOpen(true);
  };

  const saveOption = async () => {
    if (!id) return;
    const name = optionDraft.name.trim();
    const priceAdjustment = Number(optionDraft.priceAdjustment || 0);
    if (!name) return Alert.alert('اسم الخيار مطلوب');
    if (!Number.isFinite(priceAdjustment)) return Alert.alert('اكتب فرق سعر صحيح');
    try {
      await saveModifier.mutateAsync({
        id: editingOption?.id,
        body: {
          ...(editingOption ? {} : { modifierGroupId: id }),
          name,
          priceAdjustment,
          active: optionDraft.active,
        },
      });
      setOptionOpen(false);
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    }
  };

  const toggleOption = async (modifier: Modifier) => {
    try {
      await saveModifier.mutateAsync({
        id: modifier.id,
        body: { active: modifier.active === false },
      });
    } catch (err: any) {
      Alert.alert('تعذّر التحديث', err?.message ?? '');
    }
  };

  const moveOption = async (modifier: Modifier, direction: -1 | 1) => {
    const ids = modifiers.map((entry) => entry.id);
    const index = ids.indexOf(modifier.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderModifiers.mutateAsync(ids);
    } catch (err: any) {
      Alert.alert('تعذّر الترتيب', err?.message ?? '');
    }
  };

  const removeOption = (modifier: Modifier) => {
    Alert.alert('حذف الخيار', `تعطّل «${modifier.name}» وتخفيه من شاشة البيع؟`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: async () => {
          try {
            await deleteModifier.mutateAsync({ id: modifier.id });
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
            await deleteModifier.mutateAsync({ id: modifier.id, hard: true });
          } catch (err: any) {
            Alert.alert('تعذّر الحذف', err?.message ?? '');
          }
        },
      },
    ]);
  };

  const openLinks = async () => {
    if (!id) return;
    try {
      const res = await api.modifierGroupProducts(id);
      setLinkIds(res.products.map((product) => product.id));
      setLinkOpen(true);
    } catch (err: any) {
      Alert.alert('تعذّر تحميل المنتجات', err?.message ?? '');
    }
  };

  return (
    <AdminScreen title='مجموعة الخيارات' subtitle={group?.name}>
      {groupQuery.isLoading ? (
        <Skeleton height={120} style={{ borderRadius: 18 }} />
      ) : !groupDraft ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
          المجموعة غير موجودة
        </Text>
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <Field
              label='الاسم'
              value={groupDraft.name}
              onChange={(name) => setGroupEdits((current) => ({ ...current, name }))}
            />
            <Chips
              label='النوع'
              value={groupDraft.type}
              onChange={(next) =>
                setGroupEdits((current) => ({ ...current, type: next as GroupDraft['type'] }))
              }
              options={[
                { value: 'single-select', label: 'اختيار واحد' },
                { value: 'multi-select', label: 'اختيار متعدد' },
              ]}
            />
            <Switch
              label='ظاهرة في شاشة البيع'
              value={groupDraft.active}
              onValueChange={(active) => setGroupEdits((current) => ({ ...current, active }))}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label='حفظ المجموعة'
                loading={saveGroupMutation.isPending}
                style={{ flex: 1 }}
                onPress={() => void persistGroup()}
              />
              <Button
                label='ربط المنتجات'
                variant='secondary'
                icon={Link2}
                style={{ flex: 1 }}
                onPress={() => void openLinks()}
              />
            </View>
          </Card>

          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant='subtitle'>الخيارات ({modifiers.length})</Text>
              <Pressable onPress={openCreateOption} style={{ padding: 6 }} accessibilityLabel='خيار جديد'>
                <Plus size={18} color={primary} />
              </Pressable>
            </View>

            {modifiersQuery.isLoading ? (
              <Skeleton height={100} style={{ borderRadius: 18 }} />
            ) : modifiers.length === 0 ? (
              <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 18 }}>
                مفيش خيارات — أضف أول خيار.
              </Text>
            ) : (
              modifiers.map((modifier) => (
                <ListRow
                  key={modifier.id}
                  onPress={() => openEditOption(modifier)}
                  title={modifier.name}
                  subtitle={`${modifier.priceAdjustment > 0 ? '+' : ''}${fmtMoneyInt(modifier.priceAdjustment)} ج.م${modifier.active === false ? ' · مخفي' : ''}`}
                  tint={modifier.active === false ? muted : undefined}
                  trailing={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Pressable onPress={() => void moveOption(modifier, -1)} style={{ padding: 5 }}>
                        <ArrowUp size={14} color={muted} />
                      </Pressable>
                      <Pressable onPress={() => void moveOption(modifier, 1)} style={{ padding: 5 }}>
                        <ArrowDown size={14} color={muted} />
                      </Pressable>
                      <Pressable onPress={() => void toggleOption(modifier)} style={{ padding: 5 }}>
                        <Text
                          variant='caption'
                          style={{ color: modifier.active === false ? muted : primary, fontWeight: '700' }}
                        >
                          {modifier.active === false ? 'مخفي' : 'ظاهر'}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => openEditOption(modifier)} style={{ padding: 5 }}>
                        <Pencil size={15} color={muted} />
                      </Pressable>
                      <Pressable onPress={() => removeOption(modifier)} style={{ padding: 5 }}>
                        <Trash2 size={15} color={red} />
                      </Pressable>
                    </View>
                  }
                />
              ))
            )}
          </Card>
        </>
      )}

      <Modal visible={optionOpen} transparent animationType='slide' onRequestClose={() => setOptionOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOptionOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: card, borderColor: border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <ScrollView keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Text variant='title'>{editingOption ? 'تعديل خيار' : 'خيار جديد'}</Text>
                <Pressable onPress={() => setOptionOpen(false)} style={{ padding: 6 }}>
                  <X size={20} color={muted} />
                </Pressable>
              </View>
              <View style={{ gap: 12 }}>
                <Field
                  label='الاسم'
                  value={optionDraft.name}
                  onChange={(name) => setOptionDraft((current) => ({ ...current, name }))}
                  placeholder='كبير'
                />
                <Field
                  label='فرق السعر (يقبل سالب)'
                  value={optionDraft.priceAdjustment}
                  onChange={(priceAdjustment) =>
                    setOptionDraft((current) => ({ ...current, priceAdjustment }))
                  }
                  placeholder='10'
                />
                <Switch
                  label='ظاهر في شاشة البيع'
                  value={optionDraft.active}
                  onValueChange={(active) => setOptionDraft((current) => ({ ...current, active }))}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    label='حفظ'
                    loading={saveModifier.isPending}
                    style={{ flex: 1 }}
                    onPress={() => void saveOption()}
                  />
                  <Button
                    label='إلغاء'
                    variant='ghost'
                    style={{ flex: 1 }}
                    onPress={() => setOptionOpen(false)}
                  />
                </View>
              </View>
            </ScrollView>
          </Pressable>
          <AvoidKeyboard />
        </Pressable>
      </Modal>

      <LinkProductsSheet
        visible={linkOpen}
        title={`ربط «${group?.name ?? ''}» بالمنتجات`}
        productIds={linkIds}
        onSave={async (ids) => {
          if (!id) return;
          await setGroupProducts.mutateAsync({ id, productIds: ids });
        }}
        onClose={() => setLinkOpen(false)}
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
