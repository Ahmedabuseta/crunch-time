import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';

// Entry point for now; Phase 2 turns this into the onboarding → setup → app gate.
export default function Index() {
  const muted = useColor('mutedForeground');

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 28,
      }}
    >
      <Image
        source={require('../assets/images/logo.png')}
        style={{ width: 152, height: 152 }}
        contentFit='contain'
      />
      <Text variant='heading'>كرنش تايم</Text>
      <Text variant='caption' style={{ textAlign: 'center', color: muted }}>
        تطبيق المالك — الطلبات والورديات والتقارير من الموبايل
      </Text>
      <Link href='/board' asChild>
        <Button style={{ alignSelf: 'stretch' }}>ابدأ</Button>
      </Link>
    </View>
  );
}
