import { Stack } from 'expo-router';
import React from 'react';

/** The admin screens live behind a stack so they are not tab bar entries. */
export default function ManageLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name='product' options={{ presentation: 'modal' }} />
      <Stack.Screen name='recipe' options={{ presentation: 'modal' }} />
      <Stack.Screen name='category' options={{ presentation: 'modal' }} />
      <Stack.Screen name='ingredient' options={{ presentation: 'modal' }} />
      <Stack.Screen name='user' options={{ presentation: 'modal' }} />
    </Stack>
  );
}
