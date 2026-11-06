import type { Ingredient, Product } from '@/api/types';
import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { categoryLabel } from '@/lib/inventoryTaxonomy';
import { fmtDecimal } from '@/lib/format';
import { withOpacity } from '@/theme/colors';
import { Boxes, MoreHorizontal } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

function Pill({ label, tone }: { label: string; tone: 'muted' | 'bad' | 'warn' }) {
  const red = useColor('red');
  const orange = useColor('orange');
  const muted = useColor('mutedForeground');
  const color = tone === 'bad' ? red : tone === 'warn' ? orange : muted;
  return (
    <View style={[styles.pill, { backgroundColor: withOpacity(color, 0.14) }]}>
      <Text style={{ color, fontSize: 10, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** A product row: emoji, name + description, price/category and its links. */
export const ProductRow = React.memo(function ProductRow({
  product,
  categoryName,
  onPress,
  onActions,
}: {
  product: Product;
  categoryName: string;
  onPress: (product: Product) => void;
  onActions: (product: Product) => void;
}) {
  const card = useColor('card');
  const border = useColor('border');
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');

  const links = [
    product.recipeCount ? `${product.recipeCount} مكون` : null,
    product.addonCount ? `${product.addonCount} إضافة` : null,
    product.modifierCount ? `${product.modifierCount} خيار` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => onPress(product)}
      style={[styles.row, { backgroundColor: card, borderColor: border }]}
      accessibilityRole='button'
      accessibilityLabel={product.name}
    >
      <View style={[styles.leading, { backgroundColor: withOpacity(primary, 0.1) }]}>
        <Text style={{ fontSize: 21 }}>{product.emoji}</Text>
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {product.name}
          </Text>
          {product.active ? null : <Pill label='مخفي' tone='bad' />}
        </View>
        {product.description ? (
          <Text variant='caption' numberOfLines={1} style={[styles.detail, { color: muted }]}>
            {product.description}
          </Text>
        ) : null}
        <Text variant='caption' numberOfLines={1} style={[styles.detail, { color: muted }]}>
          {fmtDecimal(product.price)} ج.م
          {categoryName ? ` · ${categoryName}` : ''}
          {links.length ? ` · ${links.join(' · ')}` : ''}
        </Text>
      </View>

      <Pressable
        onPress={() => onActions(product)}
        hitSlop={10}
        style={styles.more}
        accessibilityRole='button'
        accessibilityLabel={`إجراءات ${product.name}`}
      >
        <MoreHorizontal size={18} color={muted} />
      </Pressable>
    </Pressable>
  );
});

/** An inventory row: current balance, minimum, unit cost and category. */
export const InventoryRow = React.memo(function InventoryRow({
  ingredient,
  onPress,
  onActions,
}: {
  ingredient: Ingredient;
  onPress: (ingredient: Ingredient) => void;
  onActions: (ingredient: Ingredient) => void;
}) {
  const card = useColor('card');
  const border = useColor('border');
  const muted = useColor('mutedForeground');
  const red = useColor('red');
  const primary = useColor('primary');

  const low = ingredient.stockQuantity <= ingredient.minStock;
  const value = ingredient.stockQuantity * ingredient.costPerUnit;

  return (
    <Pressable
      onPress={() => onPress(ingredient)}
      style={[styles.row, { backgroundColor: card, borderColor: border }]}
      accessibilityRole='button'
      accessibilityLabel={ingredient.name}
    >
      <View
        style={[
          styles.leading,
          { backgroundColor: withOpacity(low ? red : primary, 0.1) },
        ]}
      >
        <Boxes size={19} color={low ? red : primary} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {ingredient.name}
          </Text>
          {low ? <Pill label='تحت الحد' tone='bad' /> : null}
          {ingredient.active ? null : <Pill label='معطّل' tone='warn' />}
        </View>
        <Text variant='caption' numberOfLines={1} style={[styles.detail, { color: low ? red : muted }]}>
          {fmtDecimal(ingredient.stockQuantity)} {ingredient.unit} · الحد {fmtDecimal(ingredient.minStock)} {ingredient.unit}
        </Text>
        <Text variant='caption' numberOfLines={1} style={[styles.detail, { color: muted }]}>
          {fmtDecimal(ingredient.costPerUnit)}/{ingredient.unit}
          {` · ${fmtDecimal(value)} ج.م`}
          {` · ${categoryLabel(ingredient.category)}`}
        </Text>
      </View>

      <Pressable
        onPress={() => onActions(ingredient)}
        hitSlop={10}
        style={styles.more}
        accessibilityRole='button'
        accessibilityLabel={`إجراءات ${ingredient.name}`}
      >
        <MoreHorizontal size={18} color={muted} />
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  leading: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, fontWeight: '700', fontSize: 15 },
  detail: { fontSize: 12 },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  more: { padding: 8 },
});
