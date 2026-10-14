import { View } from '@/components/ui/view';
import { useSession } from '@/lib/session';
import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Gate. Reads the persisted config, then sends the owner to setup (address +
 * PIN) or straight to the board. Onboarding is added in the next slice.
 */
export default function Index() {
  const { ready, serverUrl, signedIn } = useSession();

  if (!ready) return <View style={{ flex: 1 }} />;
  if (!serverUrl || !signedIn) return <Redirect href='/setup' />;
  return <Redirect href='/board' />;
}
