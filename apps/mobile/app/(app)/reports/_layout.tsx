import { Stack } from 'expo-router';
import React from 'react';

/** Reports live behind a stack; the tab keeps its own name. */
export default function ReportsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
