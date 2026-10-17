import { useColorScheme } from '@/hooks/useColorScheme';
import { AppSplash } from '@/components/app/AppSplash';
import { fontsToLoad } from '@/lib/fonts';
import { persistOptions, queryClient } from '@/lib/queryClient';
import { installQueryRuntime } from '@/lib/queryRuntime';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider } from '@/providers/theme-provider';
import { Colors } from '@/theme/colors';
import { useFonts } from 'expo-font';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as NavigationBar from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import React, { useCallback, useEffect, useState } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import 'react-native-reanimated';

// The whole app is Arabic and right-to-left, matching the till. RTL is a
// process-wide flag, so it is set before anything renders; a device that has
// never run the app needs one reload for the native mirroring to apply.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

// Point React Query at the phone's connectivity and foreground events. Once.
installQueryRuntime();

// Hold the native splash until the app actually has something to show, so
// there is never a blank frame between the two. We hide it ourselves below.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// `setOptions` is a development-build API — Expo Go ignores it and warns, so
// we only call it where it does something (`Constants`, not `isRunningInExpoGo`
// from `expo`, to match the check in `RootNavigator`).
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  SplashScreen.setOptions({
    duration: 200,
    fade: true,
  });
}

export default function RootLayout() {
  // The fonts are small local files, so they are normally in before the first
  // frame. If they are not almost immediately, something is wrong: a
  // system-font first frame beats staring at the splash.
  const [fontsLoaded, fontError] = useFonts(fontsToLoad);
  const [fontWaited, setFontWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFontWaited(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const fontsReady = fontsLoaded || Boolean(fontError) || fontWaited;

  // The native splash is a flat themed colour now; hide it on the very first
  // frame so the owner watches `AppSplash` instead, and a failed load can never
  // leave us staring at it.
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* `storage` makes the light/dark choice survive a restart. SecureStore
            has no web implementation, so on web this degrades to no persistence
            rather than erroring — the toggle itself still works there. */}
        <ThemeProvider storage={SecureStore} defaultMode='dark'>
          <SessionProvider>
            <RootNavigator />
            <SplashGate fontsReady={fontsReady} />
          </SessionProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
  );
}

/**
 * Holds `AppSplash` over the app until fonts and the persisted session are in,
 * then lets it fade away. The short floor stops the intro animation flashing by
 * on a fast boot.
 */
function SplashGate({ fontsReady }: { fontsReady: boolean }) {
  const { ready: sessionReady } = useSession();
  const [minElapsed, setMinElapsed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), 1100);
    return () => clearTimeout(timer);
  }, []);

  const handleDone = useCallback(() => setDone(true), []);

  if (done) return null;
  return <AppSplash ready={fontsReady && sessionReady && minElapsed} onDone={handleDone} />;
}

/**
 * Split out so `useColorScheme()` resolves *inside* `ThemeProvider`. Read above
 * it and this would see the OS scheme rather than the user's choice — which on
 * native the global `Appearance` override happens to paper over, but on web
 * would leave the sheet's colors stuck on the system theme.
 */
function RootNavigator() {
  const colorScheme = useColorScheme() || 'light';

  useEffect(() => {
    if (Platform.OS === 'android') {
      // `setButtonStyleAsync` was removed in expo-navigation-bar 57; `setStyle`
      // is the replacement and is synchronous.
      NavigationBar.setStyle(colorScheme === 'light' ? 'dark' : 'light');
    }
  }, [colorScheme]);

  // Keep the root view background color in sync with the current theme
  useEffect(() => {
    setBackgroundColorAsync(
      colorScheme === 'dark' ? Colors.dark.background : Colors.light.background
    );
  }, [colorScheme]);

  const backgroundColor =
    colorScheme === 'dark' ? Colors.dark.background : Colors.light.background;

  // Expo Go draws its OWN opaque dark status bar and applies none of our
  // app.json (that config is baked in at build time), so there is no way to
  // recolour it from JS. The one thing we control is the icon colour, so there
  // we always ask for light icons — otherwise dark icons land on its black bar
  // and the clock disappears. A real build is translucent and edge-to-edge, so
  // it follows the theme.
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const statusBarStyle = isExpoGo || colorScheme === 'dark' ? 'light' : 'dark';

  return (
    // The window background is set once at launch and the system bars are
    // transparent in edge-to-edge, so the status-bar strip shows whatever is
    // behind it. Painting the theme colour here is what stops it staying black
    // (and the clock invisible) after switching to light.
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar style={statusBarStyle} animated />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name='(app)' options={{ headerShown: false }} />
        <Stack.Screen name='+not-found' />
      </Stack>
    </View>
  );
}
