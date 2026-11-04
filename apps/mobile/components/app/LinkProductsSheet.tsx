import type { Product } from '@/api/types';
import { ListRow, SearchField } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useAllProducts } from '@/hooks/queries/catalogue';
import { useColor } from '@/hooks/useColor';
import { Check, EyeOff, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

interface LinkProductsSheetProps {
  visible: boolean;
  title: string;
  productIds: string[];
  onSave: (ids: string[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Reverse-link picker used from an addon or a modifier group. The products list
 * is fetched whole here because this is a deliberate, one-off admin action.
 */
export function LinkProductsSheet({
  visible,
  title,
  productIds,
  onSave,
  onClose,
}: LinkProductsSheetProps) {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const card = useColor('card');

  const productsQuery = useAllProducts();
  const products = productsQuery.data?.products ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(productIds));
    setSearch('');
    setSaving(false);
  }, [visible, productIds]);

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => product.name.toLowerCase().includes(needle));
  }, [products, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave([...selected]);
      onClose();
    } catch (err: any) {
      Alert.alert('تعذّر حفظ الربط', err?.message ?? '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: card, borderColor: border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text variant='title' numberOfLines={2}>
                {title}
              </Text>
              <Text variant='caption' style={{ color: muted }}>
                اختَر المنتجات اللي تعرض العنصر ده. المخفي بيظهر هنا كمان.
              </Text>
            </View>
            <Pressable onPress={onClose} style={{ padding: 6 }}>
              <X size={20} color={muted} />
            </Pressable>
          </View>

          <SearchField value={search} onChange={setSearch} placeholder='ابحث عن منتج…' />

          <View style={styles.countRow}>
            <Text variant='caption' style={{ color: muted }}>
              المحدد: <Text style={{ color: primary, fontWeight: '700' }}>{selected.size}</Text>
            </Text>
            <Pressable
              onPress={() => setSelected(new Set(visibleProducts.map((product) => product.id)))}
            >
              <Text variant='caption' style={{ color: primary, fontWeight: '700' }}>
                تحديد الظاهر
              </Text>
            </Pressable>
            <Pressable onPress={() => setSelected(new Set())}>
              <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
                مسح
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: 340 }}
            keyboardShouldPersistTaps='handled'
            showsVerticalScrollIndicator={false}
          >
            {productsQuery.isLoading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator color={primary} />
              </View>
            ) : visibleProducts.length === 0 ? (
              <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
                مفيش منتج مطابق
              </Text>
            ) : (
              <Card style={{ gap: 2 }}>
                {visibleProducts.map((product) => (
                  <ListRow
                    key={product.id}
                    onPress={() => toggle(product.id)}
                    leading={
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: selected.has(product.id) ? primary : border,
                            backgroundColor: selected.has(product.id) ? primary : 'transparent',
                          },
                        ]}
                      >
                        {selected.has(product.id) ? <Check size={13} color='#0F0A03' /> : null}
                      </View>
                    }
                    title={`${product.emoji} ${product.name}`}
                    subtitle={product.active ? undefined : 'مخفي'}
                    tint={product.active ? undefined : muted}
                    trailing={
                      product.active ? undefined : <EyeOff size={14} color={muted} />
                    }
                  />
                ))}
              </Card>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button label='حفظ الربط' loading={saving} style={{ flex: 1 }} onPress={() => void save()} />
            <Button label='إلغاء' variant='ghost' style={{ flex: 1 }} onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  sheet: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    maxHeight: '92%',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flexDirection: 'row', gap: 10 },
});
