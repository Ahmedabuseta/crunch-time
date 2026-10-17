import { useColor } from '@/hooks/useColor';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';

/**
 * − / count / +, shared by the cart and anywhere else a quantity is edited.
 * At one, the minus becomes a delete so removing a line is the same gesture as
 * reducing it.
 */
export function QuantityStepper({
  quantity,
  onChange,
  onRemove,
  size = 'md',
}: {
  quantity: number;
  onChange: (next: number) => void;
  /** Called instead of `onChange(0)` when the last unit is removed, so the
   * caller can confirm before dropping the line. */
  onRemove?: () => void;
  size?: 'sm' | 'md';
}) {
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const dim = size === 'sm' ? 14 : 16;
  const last = quantity <= 1;

  return (
    <View style={[styles.wrap, { borderColor: border }]}>
      <Pressable
        onPress={() => (last ? onRemove?.() : onChange(quantity - 1))}
        style={styles.button}
        accessibilityLabel={last ? 'حذف الصنف' : 'تقليل الكمية'}
      >
        {last ? <Trash2 size={dim} color={muted} /> : <Minus size={dim} color={muted} />}
      </Pressable>
      <Text style={styles.count}>{quantity}</Text>
      <Pressable
        onPress={() => onChange(quantity + 1)}
        style={styles.button}
        accessibilityLabel='زيادة الكمية'
      >
        <Plus size={dim} color={muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  button: { paddingHorizontal: 10, paddingVertical: 6 },
  count: { minWidth: 22, textAlign: 'center', fontWeight: '700' },
});
