import { useColorScheme } from '@/hooks/useColorScheme';
import { fontsToLoad } from '@/lib/fonts';
import { SessionProvider } from '@/lib/session';
import { ThemeProvider } from '@/providers/theme-provider';
import { Colors } from '@/theme/colors';
import { useFonts } from 'expo-font';
import * as NavigationBar from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import React, { useEffect, useState } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

// The whole app is Arabic and right-to-left, matching the till. RTL is a
// process-wide flag, so it is set before anything renders; a device that has
// never run the app needs one reload for the native mirroring to apply.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

SplashScreen.setOptions({
  duration: 200,
  fade: true,
});

export default function RootLayout() {
  // Hold the first frame until Tajawal is in — otherwise Arabic paints in the
  // system font and reflows a beat later. But never hold it longer than a
  // moment: a font that fails to load (or hangs) must fall back to the system
  // font rather than leaving a blank screen with no way forward.
  const [fontsLoaded, fontError] = useFonts(fontsToLoad);
  const [fontWaited, setFontWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFontWaited(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded && !fontError && !fontWaited) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* `storage` makes the light/dark choice survive a restart. SecureStore
          has no web implementation, so on web this degrades to no persistence
          rather than erroring — the toggle itself still works there. */}
      <ThemeProvider storage={SecureStore} defaultMode='dark'>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
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

  return (
    // The window background is set once at launch and the system bars are
    // transparent in edge-to-edge, so the status-bar strip shows whatever is
    // behind it. Painting the theme colour here is what stops it staying black
    // (and the clock invisible) after switching to light.
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} animated />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name='(app)' options={{ headerShown: false }} />
        <Stack.Screen name='+not-found' />
      </Stack>
    </View>
  );
}
