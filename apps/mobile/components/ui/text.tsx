import { useColor } from '@/hooks/useColor';
import { FONT_SIZE } from '@/theme/globals';
import { tajawalForWeight } from '@/lib/fonts';
import React, { forwardRef } from 'react';
import {
  I18nManager,
  StyleSheet,
  Text as RNText,
  TextProps as RNTextProps,
  TextStyle,
} from 'react-native';

type TextVariant =
  'body' | 'title' | 'subtitle' | 'caption' | 'heading' | 'link';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  lightColor?: string;
  darkColor?: string;
  children: React.ReactNode;
}

const headingVariants: TextVariant[] = ['heading', 'title', 'subtitle'];

export const Text = React.memo(
  forwardRef<RNText, TextProps>(
    (
      { variant = 'body', lightColor, darkColor, style, children, ...props },
      ref
    ) => {
      const textColor = useColor('text', {
        light: lightColor,
        dark: darkColor,
      });
      const mutedColor = useColor('textMuted');
      const defaultAccessibilityRole = headingVariants.includes(variant)
        ? 'header'
        : undefined;

      const getTextStyle = (): TextStyle => {
        const baseStyle: TextStyle = {
          color: textColor,
        };

        switch (variant) {
          case 'heading':
            return {
              ...baseStyle,
              fontSize: 28,
              fontWeight: '700',
            };
          case 'title':
            return {
              ...baseStyle,
              fontSize: 24,
              fontWeight: '700',
            };
          case 'subtitle':
            return {
              ...baseStyle,
              fontSize: 19,
              fontWeight: '600',
            };
          case 'caption':
            return {
              ...baseStyle,
              fontSize: FONT_SIZE,
              fontWeight: '400',
              color: mutedColor,
            };
          case 'link':
            return {
              ...baseStyle,
              fontSize: FONT_SIZE,
              fontWeight: '500',
              textDecorationLine: 'underline',
            };
          default: // 'body'
            return {
              ...baseStyle,
              fontSize: FONT_SIZE,
              fontWeight: '400',
            };
        }
      };

      const resolved = StyleSheet.flatten([getTextStyle(), style]) as TextStyle;
      const fontFamily = tajawalForWeight(resolved?.fontWeight);
      const resolvedStyle = physicalTextAlign(resolved);

      return (
        <RNText
          ref={ref}
          style={[resolvedStyle, { fontFamily }]}
          accessibilityRole={defaultAccessibilityRole}
          {...props}
        >
          {children}
        </RNText>
      );
    }
  )
);

Text.displayName = 'Text';

/**
 * React Native mirrors `textAlign` under RTL: `right` becomes the physical
 * left. Every screen in this app is written in Arabic and means the physical
 * edge, so the flip is undone once here instead of in a hundred style sheets.
 */
function physicalTextAlign(style: TextStyle): TextStyle {
  if (!I18nManager.isRTL) return style;
  if (style.textAlign === 'right') return { ...style, textAlign: 'left' };
  if (style.textAlign === 'left') return { ...style, textAlign: 'right' };
  return style;
}
