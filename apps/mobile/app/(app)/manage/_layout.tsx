import { Stack } from 'expo-router';
import React from 'react';

/** The admin screens live behind a stack so they are not tab bar entries. */
export default function ManageLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
