import { useColor } from '@/hooks/useColor';
import { LucideProps } from 'lucide-react-native';
import React from 'react';
import { Platform } from 'react-native';

export type Props = LucideProps & {
  lightColor?: string;
  darkColor?: string;
  name: React.ComponentType<LucideProps>;
};

export function Icon({
  lightColor,
  darkColor,
  name: IconComponent,
  color,
  size = 24,
  strokeWidth = 1.8,
  accessible = false,
  ...rest
}: Props) {
  const themedColor = useColor('icon', { light: lightColor, dark: darkColor });

  // Use provided color prop if available, otherwise use themed color
  const iconColor = color || themedColor;

  return (
    <IconComponent
      color={iconColor}
      size={size}
      strokeWidth={strokeWidth}
      strokeLinecap='round'
      // `accessible` is a React Native a11y prop. On web react-native-svg renders
      // a real <svg>, so forwarding it makes React log "does not recognize the
      // `accessible` prop on a DOM element" — which Expo's web LogBox surfaces as
      // a red ERROR for every icon on screen. Pass it only where it means something.
      {...(Platform.OS === 'web' ? {} : { accessible })}
      {...rest}
    />
  );
}
