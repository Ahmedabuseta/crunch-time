import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { WifiOff } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

/**
 * A single line over the tab bar whenever the phone has no connection. The
 * screens keep working — every read is served from the persisted cache — so
 * this only has to say that what is on screen may be a little behind.
 *
 * Rendered once, in the app's tab layout.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const warning = useColor('warning');

  if (online) return null;

  return (
    <View pointerEvents='none' style={[styles.banner, { backgroundColor: warning }]}>
      <WifiOff size={14} color='#0F0A03' />
      <Text variant='caption' style={styles.label}>
        غير متصل — بتشوف آخر بيانات محفوظة
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: TAB_BAR_SPACE + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  label: { color: '#0F0A03', fontWeight: '700' },
});
