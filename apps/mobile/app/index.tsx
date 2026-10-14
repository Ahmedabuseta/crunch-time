import { View } from '@/components/ui/view';
import { useSession } from '@/lib/session';
import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Gate. Reads the persisted config, then sends the owner through onboarding,
 * setup (address + PIN), or straight to the board when already signed in.
 */
export default function Index() {
  const { ready, onboardingDone, serverUrl, signedIn } = useSession();

  if (!ready) return <View style={{ flex: 1 }} />;
  if (!onboardingDone) return <Redirect href='/onboarding' />;
  if (!serverUrl || !signedIn) return <Redirect href='/setup' />;
  return <Redirect href='/board' />;
}
