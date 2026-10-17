import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import type { SortDir } from '@/lib/listQuery';
import { ArrowUpDown } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Chips, SearchField } from './AdminKit';

export interface SortOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * The search + filter + sort row that sits above a list. Built from the same
 * `SearchField` and `Chips` the other screens already use, so it reads as part
 * of the app rather than a new widget.
 *
 * Paging is not here: the list loads more as it scrolls, and `AdminScreen`
 * owns that.
 */
export function ListControls({
  search,
  onSearch,
  searchPlaceholder,
  groups = [],
  values = {},
  onFilter,
  sort,
  dir,
  sortOptions,
  onSort,
  summary,
}: {
  search: string;
  onSearch: (text: string) => void;
  searchPlaceholder?: string;
  groups?: FilterGroup[];
  values?: Record<string, string | undefined>;
  onFilter?: (key: string, value: string | undefined) => void;
  sort?: string;
  dir?: SortDir;
  sortOptions?: SortOption[];
  onSort?: (key: string, dir?: SortDir) => void;
  /** "٢٥ من ٤١٢" */
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');

  const activeSort = sortOptions?.find((option) => option.value === sort);
  const sortable = Boolean(sortOptions?.length && onSort);

  return (
    <View style={{ gap: 8 }}>
      <SearchField value={search} onChange={onSearch} placeholder={searchPlaceholder} />

      {sortable || summary ? (
        <View style={styles.row}>
          {sortable ? (
            <Pressable
              onPress={() => setOpen((prev) => !prev)}
              accessibilityRole='button'
              accessibilityLabel='ترتيب'
              style={[styles.sortButton, { borderColor: open ? primary : border }]}
            >
              <ArrowUpDown size={14} color={primary} />
              <Text variant='caption' style={{ fontWeight: '700' }}>
                {activeSort?.label ?? 'ترتيب'}
              </Text>
              {/* The arrow is the direction, so it is worth showing without
                  opening the panel. */}
              <Text variant='caption' style={{ color: muted }}>
                {dir === 'desc' ? '↓' : '↑'}
              </Text>
            </Pressable>
          ) : null}
          {summary ? (
            <Text variant='caption' style={{ color: muted, marginLeft: 'auto' }}>
              {summary}
            </Text>
          ) : null}
        </View>
      ) : null}

      {open && sortable ? (
        <Card style={{ gap: 12 }}>
          <Chips
            label='ترتيب حسب'
            options={sortOptions!}
            value={sort ?? ''}
            onChange={(value) => onSort!(value)}
          />
          <Chips
            label='الاتجاه'
            options={[
              { value: 'asc', label: 'تصاعدي ↑' },
              { value: 'desc', label: 'تنازلي ↓' },
            ]}
            value={dir ?? 'asc'}
            onChange={(value) => onSort!(sort ?? '', value as SortDir)}
          />
        </Card>
      ) : null}

      {groups.map((group) => (
        <Chips
          key={group.key}
          label={group.label}
          options={[{ value: '', label: 'الكل' }, ...group.options]}
          value={values[group.key] ?? ''}
          onChange={(value) => onFilter?.(group.key, value || undefined)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
});
