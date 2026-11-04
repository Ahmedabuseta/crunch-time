import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

// Local calendar math only — no date library, no native module, so this ships
// inside an OTA update. All dates are `YYYY-MM-DD` strings, matching the
// server's local-day convention.
const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
// Saturday-first, matching the Egyptian work week.
const WEEKDAYS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

function partsOf(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y: y || 2026, m: m || 1, d: d || 1 };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * One date filter control: a pill showing the chosen date (or the label),
 * opening an Arabic month-grid calendar. Weeks start on Saturday and future
 * dates beyond `maxDate` are disabled — reports can't be about tomorrow.
 */
export function DatePicker({
  label,
  value,
  onChange,
  maxDate,
  minDate,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  maxDate?: string;
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const card = useColor('card');
  const text = useColor('text');

  const initial = partsOf(value);
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  const grid = useMemo(() => {
    const first = new Date(view.y, view.m - 1, 1);
    const daysInMonth = new Date(view.y, view.m, 0).getDate();
    // (Sunday=0 …) → Saturday-first column index.
    const offset = (first.getDay() + 1) % 7;
    const cells: ({ date: string; day: number; disabled: boolean } | null)[] = [];
    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = ymd(view.y, view.m, day);
      const disabled = Boolean((maxDate && date > maxDate) || (minDate && date < minDate));
      cells.push({ date, day, disabled });
    }
    return cells;
  }, [view, maxDate, minDate]);

  const step = (delta: number) => {
    setView(({ y, m }) => {
      const next = new Date(y, m - 1 + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() + 1 };
    });
  };

  const openCalendar = () => {
    setView({ y: initial.y, m: initial.m });
    setOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={openCalendar}
        accessibilityRole='button'
        accessibilityLabel={label}
        style={[styles.chip, { backgroundColor: card, borderColor: border }]}
      >
        <CalendarDays size={13} color={muted} />
        <Text variant='caption' style={{ color: text, fontWeight: '700' }}>
          {value || label}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType='fade' onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: card, borderColor: border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.header}>
              <Pressable onPress={() => step(-1)} accessibilityLabel='الشهر السابق' style={styles.nav}>
                <ChevronRight size={18} color={text} />
              </Pressable>
              <Text variant='subtitle'>
                {MONTHS[view.m - 1]} {view.y}
              </Text>
              <Pressable onPress={() => step(1)} accessibilityLabel='الشهر التالي' style={styles.nav}>
                <ChevronLeft size={18} color={text} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((day) => (
                <Text key={day} variant='caption' style={[styles.cell, { color: muted }]}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {grid.map((cell, index) =>
                cell ? (
                  <Pressable
                    key={cell.date}
                    disabled={cell.disabled}
                    onPress={() => {
                      onChange(cell.date);
                      setOpen(false);
                    }}
                    style={[
                      styles.cell,
                      styles.day,
                      { backgroundColor: cell.date === value ? primary : 'transparent' },
                      cell.disabled && styles.disabled,
                    ]}
                  >
                    <Text
                      style={{
                        color: cell.disabled ? muted : cell.date === value ? '#0F0A03' : text,
                        fontWeight: cell.date === value ? '800' : '500',
                      }}
                    >
                      {cell.day}
                    </Text>
                  </Pressable>
                ) : (
                  <View key={`blank-${index}`} style={[styles.cell, styles.day]} />
                ),
              )}
            </View>
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
    paddingHorizontal: 16,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { padding: 8 },
  weekRow: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, textAlign: 'center' },
  day: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  disabled: { opacity: 0.35 },
});
