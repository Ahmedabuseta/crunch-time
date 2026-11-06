import type { ModifierGroupSummary } from '@/api/types';
import { AdminScreen, Chips, Field, ListRow, SearchField } from '@/components/app/AdminKit';
import { FilterSelect } from '@/components/app/FilterSelect';
import { AvoidKeyboard } from '@/components/ui/avoid-keyboard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import {
  useDeleteModifierGroup,
  useReorderModifierGroups,
  useSaveModifierGroup,
} from '@/hooks/mutations/catalogue';
import { useModifierGroups } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

const TYPE_LABEL = (type: string) =>
  type === 'multi-select' ? 'اختيار متعدد' : 'اختيار واحد';

interface Draft {
  name: string;
  type: 'single-select' | 'multi-select';
  active: boolean;
}

const EMPTY: Draft = { name: '', type: 'single-select', active: true };

export default function ModifiersScreen() {
  const router = useRouter();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const card = useColor('card');
  const red = useColor('red');

  const groupsQuery = useModifierGroups(true);
  const saveGroup = useSaveModifierGroup();
  const deleteGroup = useDeleteModifierGroup();
  const reorderGroups = useReorderModifierGroups();
  const groups = groupsQuery.data?.groups ?? [];

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModifierGroupSummary | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return groups.filter((group) => {
      if (status === 'active' && group.active === false) return false;
      if (status === 'hidden' && group.active !== false) return false;
      if (type && group.type !== type) return false;
      return !needle || group.name.toLowerCase().includes(needle);
    });
  }, [groups, search, status, type]);

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY);
    setFormOpen(true);
  };

  const openEdit = (group: ModifierGroupSummary) => {
    setEditing(group);
    setDraft({
      name: group.name,
      type: group.type === 'multi-select' ? 'multi-select' : 'single-select',
      active: group.active !== false,
    });
    setFormOpen(true);
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) return Alert.alert('اسم المجموعة مطلوب');
    try {
      await saveGroup.mutateAsync({
        id: editing?.id,
        body: { name, type: draft.type, active: draft.active },
      });
      setFormOpen(false);
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    }
  };

  const toggleActive = async (group: ModifierGroupSummary) => {
    try {
      await saveGroup.mutateAsync({
        id: group.id,
        body: { active: group.active === false },
      });
    } catch (err: any) {
      Alert.alert('تعذّر التحديث', err?.message ?? '');
    }
  };

  const move = async (group: ModifierGroupSummary, direction: -1 | 1) => {
    const ids = groups.map((entry) => entry.id);
    const index = ids.indexOf(group.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderGroups.mutateAsync(ids);
    } catch (err: any) {
      Alert.alert('تعذّر الترتيب', err?.message ?? '');
    }
  };

  const remove = (group: ModifierGroupSummary) => {
    Alert.alert('حذف المجموعة', `تعطّل «${group.name}» وتشيلها من شاشة البيع؟`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تعطيل',
        onPress: async () => {
          try {
            await deleteGroup.mutateAsync({ id: group.id });
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
            await deleteGroup.mutateAsync({ id: group.id, hard: true });
          } catch (err: any) {
            Alert.alert('تعذّر الحذف', err?.message ?? '');
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen
      title='الموديفاير'
      subtitle={`${groups.length} مجموعة`}
      refreshing={groupsQuery.isFetching}
      onRefresh={() => void groupsQuery.refetch()}
      right={
        <Pressable onPress={openCreate} style={{ padding: 6 }} accessibilityLabel='مجموعة جديدة'>
          <Plus size={20} color={primary} />
        </Pressable>
      }
    >
      <SearchField value={search} onChange={setSearch} placeholder='ابحث عن مجموعة…' />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
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
        <FilterSelect
          label='النوع'
          value={type}
          onChange={setType}
          options={[
            { value: '', label: 'كل الأنواع' },
            { value: 'single-select', label: 'اختيار واحد' },
            { value: 'multi-select', label: 'اختيار متعدد' },
          ]}
        />
      </View>

      {groupsQuery.isLoading ? (
        <View style={{ paddingVertical: 30, alignItems: 'center' }}>
          <ActivityIndicator color={primary} />
        </View>
      ) : filtered.length === 0 ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
          مفيش مجموعات مطابقة
        </Text>
      ) : (
        <Card style={{ gap: 2 }}>
          {filtered.map((group) => (
            <ListRow
              key={group.id}
              onPress={() =>
                router.push({ pathname: '/manage/modifier-group', params: { id: group.id } })
              }
              title={group.name}
              subtitle={`${TYPE_LABEL(group.type)} · ${group.productCount ?? 0} منتج · ${group.modifierCount ?? 0} خيار${group.active === false ? ' · مخفي' : ''}`}
              tint={group.active === false ? muted : undefined}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Pressable onPress={() => void move(group, -1)} style={{ padding: 5 }}>
                    <ArrowUp size={14} color={muted} />
                  </Pressable>
                  <Pressable onPress={() => void move(group, 1)} style={{ padding: 5 }}>
                    <ArrowDown size={14} color={muted} />
                  </Pressable>
                  <Pressable onPress={() => void toggleActive(group)} style={{ padding: 5 }}>
                    <Text
                      variant='caption'
                      style={{ color: group.active === false ? muted : primary, fontWeight: '700' }}
                    >
                      {group.active === false ? 'مخفي' : 'ظاهر'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => openEdit(group)} style={{ padding: 5 }}>
                    <Pencil size={15} color={muted} />
                  </Pressable>
                  <Pressable onPress={() => remove(group)} style={{ padding: 5 }}>
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
                <Text variant='title'>{editing ? 'تعديل مجموعة' : 'مجموعة جديدة'}</Text>
                <Pressable onPress={() => setFormOpen(false)} style={{ padding: 6 }}>
                  <X size={20} color={muted} />
                </Pressable>
              </View>
              <View style={{ gap: 12 }}>
                <Field
                  label='الاسم'
                  value={draft.name}
                  onChange={(name) => setDraft((current) => ({ ...current, name }))}
                  placeholder='الحجم'
                />
                <Chips
                  label='النوع'
                  value={draft.type}
                  onChange={(next) => setDraft((current) => ({ ...current, type: next as Draft['type'] }))}
                  options={[
                    { value: 'single-select', label: 'اختيار واحد' },
                    { value: 'multi-select', label: 'اختيار متعدد' },
                  ]}
                />
                <Switch
                  label='ظاهرة في شاشة البيع'
                  value={draft.active}
                  onValueChange={(active) => setDraft((current) => ({ ...current, active }))}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button label='حفظ' loading={saveGroup.isPending} style={{ flex: 1 }} onPress={() => void save()} />
                  <Button label='إلغاء' variant='ghost' style={{ flex: 1 }} onPress={() => setFormOpen(false)} />
                </View>
              </View>
            </ScrollView>
          </Pressable>
          <AvoidKeyboard />
        </Pressable>
      </Modal>
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
