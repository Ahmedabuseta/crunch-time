import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import React from 'react';

/** Temporary body for a tab while its screen is built out. */
export function Placeholder({ title, note }: { title: string; note?: string }) {
  const muted = useColor('mutedForeground');

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 24,
      }}
    >
      <Text variant='title'>{title}</Text>
      {note ? (
        <Text variant='caption' style={{ textAlign: 'center', color: muted }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
