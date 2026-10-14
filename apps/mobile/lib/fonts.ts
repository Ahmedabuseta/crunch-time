import type { TextStyle } from 'react-native';

// The till ships Tajawal; the phone loads the same three faces so Arabic reads
// identically on both. BNA UI's Text sets size/weight but no fontFamily, so we
// map weight -> face here and inject it in components/ui/text.tsx.
export const FONT_FAMILY = {
  regular: 'Tajawal-Regular',
  medium: 'Tajawal-Medium',
  bold: 'Tajawal-Bold',
} as const;

// Relative requires: Metro does not resolve the `@/` alias inside require().
export const fontsToLoad = {
  'Tajawal-Regular': require('../assets/fonts/Tajawal-Regular.ttf'),
  'Tajawal-Medium': require('../assets/fonts/Tajawal-Medium.ttf'),
  'Tajawal-Bold': require('../assets/fonts/Tajawal-Bold.ttf'),
} as const;

export function tajawalForWeight(weight?: TextStyle['fontWeight']): string {
  const numeric = typeof weight === 'string' ? parseInt(weight, 10) : weight;
  if (!numeric || Number.isNaN(numeric)) return FONT_FAMILY.regular;
  if (numeric >= 600) return FONT_FAMILY.bold;
  if (numeric >= 500) return FONT_FAMILY.medium;
  return FONT_FAMILY.regular;
}
