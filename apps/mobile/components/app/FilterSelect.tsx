import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { ChevronDown } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * One compact filter control: a pill that shows the filter's name when nothing
 * is chosen and the chosen value once there is one, opening a short option list.
 * Keeping every filter to a single pill is what stops the filter bar from
 * growing as more filters are added.
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const card = useColor('card');
  const text = useColor('text');

  const active = value !== '';
  const selected = options.find((option) => option.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole='button'
        accessibilityLabel={label}
        style={[
          styles.chip,
          { backgroundColor: active ? primary : card, borderColor: active ? primary : border },
        ]}
      >
        <Text variant='caption' style={{ color: active ? '#0F0A03' : muted, fontWeight: '700' }}>
          {active ? selected?.label ?? label : label}
        </Text>
        <ChevronDown size={13} color={active ? '#0F0A03' : muted} />
      </Pressable>

      <Modal visible={open} transparent animationType='fade' onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: card, borderColor: border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text variant='subtitle' style={styles.title}>
              {label}
            </Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const on = option.value === value;
                return (
                  <Pressable
                    key={option.value || 'all'}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={styles.option}
                  >
                    <Text style={{ color: on ? primary : text, fontWeight: on ? '700' : '500' }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 4,
  },
  title: { textAlign: 'center', paddingBottom: 8 },
  option: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
});
