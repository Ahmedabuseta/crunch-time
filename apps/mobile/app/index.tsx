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

  // Onboarding is about getting set up, so it also covers "installed but never
  // connected" — a stored "done" flag from a half-finished setup would
  // otherwise hide it for good. Once an address exists the flag decides.
  if (!onboardingDone || !serverUrl) return <Redirect href='/onboarding' />;
  if (!signedIn) return <Redirect href='/setup' />;
  return <Redirect href='/board' />;
}
