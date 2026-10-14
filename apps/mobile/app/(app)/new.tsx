import { api, type CreateOrderPayload } from '@/api/endpoints';
import type { Addon, Category, DeliveryProfile, DeliveryZone, Modifier, Product } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { categoryColor } from '@/lib/categoryColors';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT, TAB_BAR_SPACE } from '@/theme/globals';
import { fmtMoneyInt } from '@/lib/format';
import { useRouter } from 'expo-router';
import { Check, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type OrderType = 'dine-in' | 'takeaway' | 'delivery';

interface CartLine {
  lineId: string;
  product: Product;
  quantity: number;
  note: string;
  addons: Addon[];
  modifiers: Modifier[];
}

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const lineUnitPrice = (line: CartLine) =>
  line.product.price + line.modifiers.reduce((sum, m) => sum + (m.priceAdjustment || 0), 0);

const lineTotal = (line: CartLine) =>
  lineUnitPrice(line) * line.quantity +
  line.addons.reduce((sum, a) => sum + a.price, 0) * line.quantity;

export default function NewOrderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const card = useColor('card');
  const border = useColor('border');
  const secondary = useColor('secondary');
  const green = useColor('green');
  const red = useColor('red');

  const [menu, setMenu] = useState<{ categories: Category[]; products: Product[] }>({
    categories: [],
    products: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);

  const [optionsFor, setOptionsFor] = useState<Product | null>(null);
  const [options, setOptions] = useState<{ addons: Addon[]; modifierGroups: { id: string; name: string; type: string; modifiers: Modifier[] }[] } | null>(null);
  const [draftAddons, setDraftAddons] = useState<Addon[]>([]);
  const [draftModifiers, setDraftModifiers] = useState<Modifier[]>([]);

  const [checkout, setCheckout] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [paymentType, setPaymentType] = useState<'cash' | 'visa'>('cash');
  const [note, setNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [profiles, setProfiles] = useState<DeliveryProfile[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [taxRate, setTaxRate] = useState(0.14);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [menuRes, settingsRes] = await Promise.all([
        api.menu(),
        api.settings().catch(() => null),
      ]);
      setMenu({ categories: menuRes.categories, products: menuRes.products });
      setCategoryId((prev) => prev || menuRes.categories[0]?.id || '');
      const rate = Number((settingsRes?.settings as any)?.taxRate);
      if (Number.isFinite(rate) && rate >= 0) setTaxRate(rate);
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تحميل القائمة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!checkout || orderType !== 'delivery') return;
    void (async () => {
      try {
        const [z, p] = await Promise.all([api.deliveryZones(), api.deliveryProfiles()]);
        setZones(z.zones);
        setProfiles(p.profiles);
        setZoneId((prev) => prev || z.zones[0]?.id || '');
      } catch {
        // delivery extras are optional
      }
    })();
  }, [checkout, orderType]);

  const products = useMemo(
    () => (categoryId ? menu.products.filter((p) => p.categoryId === categoryId) : menu.products),
    [menu.products, categoryId]
  );

  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0);
  const activeZone = zones.find((z) => z.id === zoneId);
  const deliveryFee = orderType === 'delivery' ? activeZone?.fee ?? 0 : 0;
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + tax + deliveryFee;
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const addLine = (line: CartLine) => setCart((prev) => [...prev, line]);

  const onPickProduct = async (product: Product) => {
    setOptionsFor(product);
    setOptions(null);
    setDraftAddons([]);
    setDraftModifiers([]);
    try {
      const res = await api.productOptions(product.id);
      setOptions({ addons: res.addons, modifierGroups: res.modifierGroups });
    } catch {
      setOptions({ addons: [], modifierGroups: [] });
    }
  };

  const commitOptions = () => {
    if (!optionsFor) return;
    addLine({
      lineId: newKey(),
      product: optionsFor,
      quantity: 1,
      note: '',
      addons: draftAddons,
      modifiers: draftModifiers,
    });
    setOptionsFor(null);
  };

  const toggleAddon = (addon: Addon) => {
    setDraftAddons((prev) =>
      prev.some((a) => a.id === addon.id) ? prev.filter((a) => a.id !== addon.id) : [...prev, addon]
    );
  };

  const toggleModifier = (groupType: string, modifier: Modifier) => {
    setDraftModifiers((prev) => {
      const withoutGroup = groupType === 'single-select'
        ? prev.filter((m) => m.modifierGroupId !== modifier.modifierGroupId)
        : prev;
      return withoutGroup.some((m) => m.id === modifier.id)
        ? withoutGroup.filter((m) => m.id !== modifier.id)
        : [...withoutGroup, modifier];
    });
  };

  const changeQty = (lineId: string, delta: number) =>
    setCart((prev) =>
      prev
        .map((line) =>
          line.lineId === lineId ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line
        )
        .filter((line) => line.quantity > 0)
    );

  const submit = async () => {
    if (cart.length === 0) return;
    setBusy(true);
    try {
      const payload: CreateOrderPayload = {
        orderType,
        paymentType,
        subtotal,
        tax,
        deliveryFee,
        total,
        items: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: lineUnitPrice(line),
          note: line.note || undefined,
          modifiers: line.modifiers.map((m) => ({
            modifierId: m.id,
            modifierName: m.name,
            priceAdjustment: m.priceAdjustment,
          })),
          addons: line.addons.flatMap((a) => Array(line.quantity).fill(a.id)),
        })),
        note: note.trim() || undefined,
        ...(orderType === 'delivery'
          ? {
              customerName: customerName.trim() || undefined,
              customerPhone: customerPhone.trim() || undefined,
              customerAddress: customerAddress.trim() || undefined,
              deliveryZoneId: zoneId || undefined,
              deliveryZoneName: activeZone?.name,
              deliveryProfileId: profileId || undefined,
            }
          : {}),
      };
      const res = await api.createOrder(payload, newKey());
      setCart([]);
      setCheckout(false);
      setNote('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setProfileId('');
      Alert.alert('تم إرسال الطلب', `الطلب ${res.id} اتسجّل، وتذاكر المطبخ طلعت على الكمبيوتر.`, [
        { text: 'تمام', onPress: () => router.push(`/order/${res.id}`) },
      ]);
    } catch (err: any) {
      Alert.alert('تعذّر إنشاء الطلب', err?.message ?? 'حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };

  const columns = width >= 700 ? 3 : 2;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: cart.length ? TAB_BAR_SPACE + 100 : TAB_BAR_SPACE + 12 }}
      >
        <View style={styles.header}>
          <Text variant='title'>طلب جديد</Text>
          <Text variant='caption' style={{ color: muted }}>
            اختار الأصناف وابعتها للمطبخ
          </Text>
        </View>

        {error ? (
          <Text variant='caption' style={{ color: red, textAlign: 'center' }}>
            {error}
          </Text>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {menu.categories.map((c) => {
            const active = categoryId === c.id;
            const tint = categoryColor(c.color, primary);
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? tint : card, borderColor: active ? tint : border },
                ]}
              >
                <Text variant='caption' style={{ color: active ? '#0F0A03' : muted, fontWeight: '700' }}>
                  {c.emoji} {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            <Skeleton height={84} />
            <Skeleton height={84} />
          </View>
        ) : (
          <View style={[styles.grid, { paddingHorizontal: 16 }]}>
            {products.map((product) => (
              <Pressable
                key={product.id}
                onPress={() => void onPickProduct(product)}
                style={{ width: `${100 / columns - 2}%` }}
              >
                <Card style={{ gap: 6 }}>
                  <Text style={{ fontSize: 30 }}>{product.emoji}</Text>
                  <Text numberOfLines={2} style={{ fontWeight: '600', minHeight: 40 }}>
                    {product.name}
                  </Text>
                  <Text style={{ fontWeight: '700', color: primary }}>
                    {fmtMoneyInt(product.price)} ج.م
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {cart.length > 0 ? (
        <View
          style={[
            styles.cartBar,
            {
              backgroundColor: card,
              borderColor: border,
              left: TAB_BAR_GAP,
              right: TAB_BAR_GAP,
              // Sits just above the floating tab bar rather than behind it.
              bottom: TAB_BAR_GAP + insets.bottom + TAB_BAR_HEIGHT + 8,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <ShoppingCart size={18} color={primary} />
            <View>
              <Text style={{ fontWeight: '700' }}>
                {itemCount} صنف · {fmtMoneyInt(total)} ج.م
              </Text>
              <Text variant='caption' style={{ color: muted }}>
                شامل الضريبة{deliveryFee ? ' ورسوم التوصيل' : ''}
              </Text>
            </View>
          </View>
          <Button onPress={() => setCheckout(true)}>إتمام</Button>
        </View>
      ) : null}

      {optionsFor ? (
        <OptionsPanel
          product={optionsFor}
          options={options}
          addons={draftAddons}
          modifiers={draftModifiers}
          onToggleAddon={toggleAddon}
          onToggleModifier={toggleModifier}
          onCancel={() => setOptionsFor(null)}
          onConfirm={commitOptions}
          primary={primary}
          muted={muted}
          card={card}
          border={border}
          secondary={secondary}
          insetsBottom={insets.bottom}
        />
      ) : null}

      {checkout ? (
        <CheckoutPanel
          cart={cart}
          subtotal={subtotal}
          tax={tax}
          deliveryFee={deliveryFee}
          total={total}
          orderType={orderType}
          setOrderType={setOrderType}
          paymentType={paymentType}
          setPaymentType={setPaymentType}
          note={note}
          setNote={setNote}
          customerName={customerName}
          setCustomerName={setCustomerName}
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          customerAddress={customerAddress}
          setCustomerAddress={setCustomerAddress}
          zones={zones}
          zoneId={zoneId}
          setZoneId={setZoneId}
          profiles={profiles}
          profileId={profileId}
          setProfileId={setProfileId}
          onQty={changeQty}
          busy={busy}
          onSubmit={submit}
          onClose={() => setCheckout(false)}
          primary={primary}
          muted={muted}
          card={card}
          border={border}
          secondary={secondary}
          green={green}
          insetsBottom={insets.bottom}
        />
      ) : null}
    </View>
  );
}

interface PanelColors {
  primary: string;
  muted: string;
  card: string;
  border: string;
  secondary: string;
  insetsBottom: number;
}

function Sheet({ children, ...c }: { children: React.ReactNode } & PanelColors) {
  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          // Float above the tab bar so the sheet never hides behind it.
          bottom: TAB_BAR_GAP + c.insetsBottom + TAB_BAR_HEIGHT + 8,
          paddingBottom: 16,
        },
      ]}
    >
      {children}
    </View>
  );
}

function OptionsPanel({
  product,
  options,
  addons,
  modifiers,
  onToggleAddon,
  onToggleModifier,
  onCancel,
  onConfirm,
  ...c
}: {
  product: Product;
  options: { addons: Addon[]; modifierGroups: { id: string; name: string; type: string; modifiers: Modifier[] }[] } | null;
  addons: Addon[];
  modifiers: Modifier[];
  onToggleAddon: (a: Addon) => void;
  onToggleModifier: (type: string, m: Modifier) => void;
  onCancel: () => void;
  onConfirm: () => void;
} & PanelColors) {
  return (
    <Sheet {...c}>
      <View style={styles.sheetHeader}>
        <Text style={{ fontSize: 24 }}>{product.emoji}</Text>
        <Text variant='subtitle' style={{ flex: 1 }}>
          {product.name}
        </Text>
        <Pressable onPress={onCancel}>
          <X size={20} color={c.muted} />
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 320 }}>
        {!options ? (
          <Skeleton height={80} />
        ) : (
          <View style={{ gap: 14 }}>
            {options.modifierGroups.map((group) => (
              <View key={group.id} style={{ gap: 8 }}>
                <Text variant='caption' style={{ color: c.muted, fontWeight: '700' }}>
                  {group.name}
                </Text>
                <View style={styles.chipWrap}>
                  {group.modifiers.map((m) => {
                    const on = modifiers.some((x) => x.id === m.id);
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => onToggleModifier(group.type, m)}
                        style={[
                          styles.chip,
                          { backgroundColor: on ? c.primary : c.secondary, borderColor: 'transparent' },
                        ]}
                      >
                        <Text variant='caption' style={{ color: on ? '#0F0A03' : c.muted, fontWeight: '600' }}>
                          {m.name}
                          {m.priceAdjustment ? ` +${fmtMoneyInt(m.priceAdjustment)}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            {options.addons.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text variant='caption' style={{ color: c.muted, fontWeight: '700' }}>
                  إضافات
                </Text>
                <View style={styles.chipWrap}>
                  {options.addons.map((a) => {
                    const on = addons.some((x) => x.id === a.id);
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => onToggleAddon(a)}
                        style={[
                          styles.chip,
                          { backgroundColor: on ? c.primary : c.secondary, borderColor: 'transparent' },
                        ]}
                      >
                        <Text variant='caption' style={{ color: on ? '#0F0A03' : c.muted, fontWeight: '600' }}>
                          {a.emoji} {a.name} +{fmtMoneyInt(a.price)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {options.modifierGroups.length === 0 && options.addons.length === 0 ? (
              <Text variant='caption' style={{ color: c.muted }}>
                مفيش خيارات للصنف ده — هيتضاف زي ما هو
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
      <Button onPress={onConfirm} style={{ alignSelf: 'stretch' }} icon={Check}>
        إضافة للسلة
      </Button>
    </Sheet>
  );
}

function CheckoutPanel({
  cart,
  subtotal,
  tax,
  deliveryFee,
  total,
  orderType,
  setOrderType,
  paymentType,
  setPaymentType,
  note,
  setNote,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  customerAddress,
  setCustomerAddress,
  zones,
  zoneId,
  setZoneId,
  profiles,
  profileId,
  setProfileId,
  onQty,
  busy,
  onSubmit,
  onClose,
  ...c
}: {
  cart: CartLine[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  paymentType: 'cash' | 'visa';
  setPaymentType: (p: 'cash' | 'visa') => void;
  note: string;
  setNote: (v: string) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  customerAddress: string;
  setCustomerAddress: (v: string) => void;
  zones: DeliveryZone[];
  zoneId: string;
  setZoneId: (v: string) => void;
  profiles: DeliveryProfile[];
  profileId: string;
  setProfileId: (v: string) => void;
  onQty: (lineId: string, delta: number) => void;
  busy: boolean;
  onSubmit: () => void;
  onClose: () => void;
  green: string;
} & PanelColors) {
  const orderTypes: { key: OrderType; label: string }[] = [
    { key: 'dine-in', label: 'صالة' },
    { key: 'takeaway', label: 'تيك أوي' },
    { key: 'delivery', label: 'توصيل' },
  ];

  return (
    <Sheet {...c}>
      <View style={styles.sheetHeader}>
        <Text variant='subtitle' style={{ flex: 1 }}>
          إتمام الطلب
        </Text>
        <Pressable onPress={onClose}>
          <X size={20} color={c.muted} />
        </Pressable>
      </View>

      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 14 }}>
        <View style={{ gap: 8 }}>
          {cart.map((line) => (
            <View key={line.lineId} style={styles.cartLine}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600' }}>
                  {line.product.emoji} {line.product.name}
                </Text>
                {line.modifiers.length > 0 ? (
                  <Text variant='caption' style={{ color: c.muted }}>
                    {line.modifiers.map((m) => m.name).join('، ')}
                  </Text>
                ) : null}
                {line.addons.length > 0 ? (
                  <Text variant='caption' style={{ color: c.muted }}>
                    {line.addons.map((a) => a.name).join('، ')}
                  </Text>
                ) : null}
                <Text variant='caption' style={{ color: c.primary, fontWeight: '700' }}>
                  {fmtMoneyInt(lineTotal(line))} ج.م
                </Text>
              </View>
              <View style={styles.qtyControls}>
                <Pressable onPress={() => onQty(line.lineId, -1)} style={styles.qtyButton}>
                  {line.quantity === 1 ? <Trash2 size={14} color={c.muted} /> : <Minus size={14} color={c.muted} />}
                </Pressable>
                <Text style={{ minWidth: 20, textAlign: 'center', fontWeight: '700' }}>
                  {line.quantity}
                </Text>
                <Pressable onPress={() => onQty(line.lineId, 1)} style={styles.qtyButton}>
                  <Plus size={14} color={c.muted} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <Separator />

        <View style={{ gap: 6 }}>
          <Text variant='caption' style={{ color: c.muted, fontWeight: '700' }}>
            نوع الطلب
          </Text>
          <View style={styles.chipWrap}>
            {orderTypes.map((t) => {
              const on = orderType === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setOrderType(t.key)}
                  style={[
                    styles.chip,
                    { backgroundColor: on ? c.primary : c.secondary, borderColor: 'transparent' },
                  ]}
                >
                  <Text variant='caption' style={{ color: on ? '#0F0A03' : c.muted, fontWeight: '700' }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text variant='caption' style={{ color: c.muted, fontWeight: '700' }}>
            الدفع
          </Text>
          <View style={styles.chipWrap}>
            {(['cash', 'visa'] as const).map((p) => {
              const on = paymentType === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPaymentType(p)}
                  style={[
                    styles.chip,
                    { backgroundColor: on ? c.primary : c.secondary, borderColor: 'transparent' },
                  ]}
                >
                  <Text variant='caption' style={{ color: on ? '#0F0A03' : c.muted, fontWeight: '700' }}>
                    {p === 'cash' ? 'كاش' : 'فيزا'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {orderType === 'delivery' ? (
          <View style={{ gap: 8 }}>
            <Input placeholder='اسم العميل' value={customerName} onChangeText={setCustomerName} />
            <Input
              placeholder='رقم التليفون'
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType='phone-pad'
            />
            <Input placeholder='العنوان' value={customerAddress} onChangeText={setCustomerAddress} />
            {zones.length > 0 ? (
              <View style={styles.chipWrap}>
                {zones.map((z) => {
                  const on = zoneId === z.id;
                  return (
                    <Pressable
                      key={z.id}
                      onPress={() => setZoneId(z.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: on ? c.primary : c.secondary, borderColor: 'transparent' },
                      ]}
                    >
                      <Text variant='caption' style={{ color: on ? '#0F0A03' : c.muted, fontWeight: '600' }}>
                        {z.name} · {fmtMoneyInt(z.fee)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {profiles.length > 0 ? (
              <View style={styles.chipWrap}>
                {profiles.map((p) => {
                  const on = profileId === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setProfileId(on ? '' : p.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: on ? c.green : c.secondary, borderColor: 'transparent' },
                      ]}
                    >
                      <Text variant='caption' style={{ color: on ? '#0F0A03' : c.muted, fontWeight: '600' }}>
                        {p.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        <Input placeholder='ملاحظة على الطلب (اختياري)' value={note} onChangeText={setNote} />

        <View style={{ gap: 4 }}>
          <SummaryRow label='المجموع الفرعي' value={subtotal} muted={c.muted} />
          {deliveryFee > 0 ? <SummaryRow label='رسوم التوصيل' value={deliveryFee} muted={c.muted} /> : null}
          <SummaryRow label='الضريبة' value={tax} muted={c.muted} />
          <Separator />
          <SummaryRow label='الإجمالي' value={total} muted={c.primary} strong />
        </View>
      </ScrollView>

      <Button onPress={onSubmit} loading={busy} disabled={cart.length === 0} style={{ alignSelf: 'stretch' }}>
        إرسال الطلب
      </Button>
    </Sheet>
  );
}

function SummaryRow({ label, value, muted, strong }: { label: string; value: number; muted: string; strong?: boolean }) {
  return (
    <View style={styles.cartLine}>
      <Text variant='caption' style={{ color: muted, fontWeight: strong ? '700' : '400' }}>
        {label}
      </Text>
      <Text style={{ fontWeight: strong ? '700' : '500', color: strong ? muted : undefined }}>
        {fmtMoneyInt(value)} ج.م
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 2 },
  filters: { gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  cartBar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
    left: TAB_BAR_GAP,
    right: TAB_BAR_GAP,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyButton: { padding: 6 },
});
