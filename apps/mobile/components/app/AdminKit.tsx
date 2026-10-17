import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { useRouter } from 'expo-router';
import { ArrowRight, Search } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Shared chrome for the admin screens reached from المزيد. */
export function AdminScreen({
  title,
  subtitle,
  children,
  refreshing,
  onRefresh,
  right,
  onEndReached,
  loadingMore,
  hasMore,
  listSummary,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  right?: React.ReactNode;
  /** Paged lists: called when the list is scrolled near its end. */
  onEndReached?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
  /** "٢٥ من ٤١٢" — shown under the list once everything is loaded. */
  listSummary?: string;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');

  // Far enough out that the next page has arrived before the user reaches the
  // bottom, so the list does not visibly stall.
  const NEAR_BOTTOM = 240;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!onEndReached || loadingMore || !hasMore) return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const remaining = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (remaining < NEAR_BOTTOM) onEndReached();
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps='handled'
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + 20 }}
      onScroll={onEndReached ? handleScroll : undefined}
      scrollEventThrottle={onEndReached ? 160 : undefined}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={primary} />
        ) : undefined
      }
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={{ padding: 6 }}>
          <ArrowRight size={20} color={muted} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant='title'>{title}</Text>
          {subtitle ? (
            <Text variant='caption' style={{ color: muted }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>{children}</View>

      {loadingMore ? (
        <View style={styles.listFooter}>
          <ActivityIndicator color={primary} />
        </View>
      ) : hasMore && onEndReached ? (
        <Pressable onPress={onEndReached} style={styles.listFooter}>
          <Text variant='caption' style={{ color: primary, fontWeight: '700' }}>
            حمّل المزيد
          </Text>
        </Pressable>
      ) : listSummary ? (
        <View style={styles.listFooter}>
          <Text variant='caption' style={{ color: muted }}>
            {listSummary}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'ابحث…',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const muted = useColor('mutedForeground');
  return (
    <View style={styles.searchRow}>
      <Search size={16} color={muted} />
      <Input
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        containerStyle={{ flex: 1 }}
        inputStyle={{ textAlign: 'left' }}
      />
    </View>
  );
}

/** A labelled row in a list; `tint` colours the leading dot/emoji. */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  tint,
  style,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  tint?: string;
  style?: ViewStyle;
}) {
  const muted = useColor('mutedForeground');
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.row, style]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant='caption' style={{ color: tint ?? muted }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Labelled text input used by the editing forms. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  secureTextEntry,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  secureTextEntry?: boolean;
  multiline?: boolean;
}) {
  const muted = useColor('mutedForeground');
  return (
    <View style={{ gap: 4 }}>
      <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
        {label}
      </Text>
      <Input
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        type={multiline ? 'textarea' : 'input'}
        rows={multiline ? 2 : undefined}
      />
    </View>
  );
}

/** A horizontal set of selectable chips — used for categories, units, roles. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label?: string;
}) {
  const primary = useColor('primary');
  const secondary = useColor('secondary');
  const muted = useColor('mutedForeground');

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
          {label}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? primary : secondary,
                  borderColor: 'transparent',
                },
              ]}
            >
              <Text
                variant='caption'
                style={{ color: active ? '#0F0A03' : muted, fontWeight: '600' }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  listFooter: { paddingVertical: 18, alignItems: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  leading: { width: 28, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
