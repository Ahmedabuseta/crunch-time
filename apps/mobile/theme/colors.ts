// Crunch Time palette — the mobile twin of the till's src/index.css tokens.
// The desktop declares these in oklch; these are the same values converted to
// sRGB, so the phone and the PC read as one product. Dark is the default.
const lightColors = {
  // Base colors
  background: '#F4F5F7',
  foreground: '#090B0F',

  // Card colors
  card: '#FFFFFF',
  cardForeground: '#090B0F',

  // Popover colors
  popover: '#FFFFFF',
  popoverForeground: '#090B0F',

  // Primary colors — the till's warm gold
  primary: '#CB9400',
  primaryForeground: '#0F0A03',

  // Secondary colors
  secondary: '#E6E8EB',
  secondaryForeground: '#13161B',

  // Muted colors
  muted: '#E6E8EB',
  mutedForeground: '#606369',

  // Accent colors
  accent: '#E6E8EB',
  accentForeground: '#13161B',

  // Destructive colors
  destructive: '#D40924',
  destructiveForeground: '#FFFFFF',

  // Border and input
  border: '#D5D7DB',
  input: '#D5D7DB',
  ring: '#CB9400',

  // Text colors
  text: '#090B0F',
  textMuted: '#606369',

  // Legacy support for existing components
  tint: '#CB9400',
  icon: '#606369',
  tabIconDefault: '#606369',
  tabIconSelected: '#CB9400',

  // Accents (the till's data-color set)
  blue: '#0081F1',
  green: '#00AF44',
  red: '#D40924',
  orange: '#FF5453',
  yellow: '#E6AD00',
  pink: '#CE74E3',
  purple: '#955BE3',
  teal: '#00A0B0',
  indigo: '#7C5CE6',

  // Semantic states
  success: '#00AF44',
  successForeground: '#FFFFFF',
  warning: '#D78E00',
  warningForeground: '#FFFFFF',
  info: '#0081F1',
  infoForeground: '#FFFFFF',
  error: '#D40924',
  errorForeground: '#FFFFFF',
};

const darkColors = {
  // Base colors
  background: '#05070B',
  foreground: '#EEEEEE',

  // Card colors
  card: '#0E1218',
  cardForeground: '#EEEEEE',

  // Popover colors
  popover: '#0E1218',
  popoverForeground: '#EEEEEE',

  // Primary colors — the till's warm gold
  primary: '#E6AD00',
  primaryForeground: '#0F0A03',

  // Secondary colors
  secondary: '#151B24',
  secondaryForeground: '#DEDEDE',

  // Muted colors
  muted: '#151B24',
  mutedForeground: '#79818D',

  // Accent colors
  accent: '#151B24',
  accentForeground: '#DEDEDE',

  // Destructive colors
  destructive: '#DF202E',
  destructiveForeground: '#F8F8F8',

  // Border and input
  border: '#1E242E',
  input: '#1E242E',
  ring: '#E6AD00',

  // Text colors
  text: '#EEEEEE',
  textMuted: '#79818D',

  // Legacy support for existing components
  tint: '#E6AD00',
  icon: '#79818D',
  tabIconDefault: '#79818D',
  tabIconSelected: '#E6AD00',

  // Accents (the till's data-color set)
  blue: '#0081F1',
  green: '#00AF44',
  red: '#EE0B2A',
  orange: '#FF5453',
  yellow: '#E6AD00',
  pink: '#CE74E3',
  purple: '#955BE3',
  teal: '#00A0B0',
  indigo: '#7C5CE6',

  // Semantic states
  success: '#00AF44',
  successForeground: '#FFFFFF',
  warning: '#E38700',
  warningForeground: '#FFFFFF',
  info: '#0081F1',
  infoForeground: '#FFFFFF',
  error: '#DF202E',
  errorForeground: '#FFFFFF',
};

export const Colors = {
  light: lightColors,
  dark: darkColors,
};

// Export individual color schemes for easier access
export { darkColors, lightColors };

// Utility type for color keys
export type ColorKeys = keyof typeof lightColors;

// Helper function to get color with opacity (useful for React Native)
export const withOpacity = (color: string, opacity: number) => {
  // Handle rgba colors
  if (color.startsWith('rgba')) {
    return color;
  }

  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  return color;
};
