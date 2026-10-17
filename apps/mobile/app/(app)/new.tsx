import type { CreateOrderPayload } from '@/api/endpoints';
import type { Addon, Category, DeliveryProfile, DeliveryZone, Modifier, Product } from '@/api/types';
import { GlassPane } from '@/components/app/GlassPane';
import { QuantityStepper } from '@/components/app/QuantityStepper';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useValidateDiscountCode } from '@/hooks/mutations/lookup';
import { useCreateOrder } from '@/hooks/mutations/orders';
import { useMenu, useProductOptions } from '@/hooks/queries/catalogue';
import { useDeliveryProfiles, useDeliveryZones } from '@/hooks/queries/reference';
import { useSettings } from '@/hooks/queries/store';
import { useColor } from '@/hooks/useColor';
import { categoryColor } from '@/lib/categoryColors';
import { computeDiscount, describeDiscount, type DiscountRule } from '@/lib/discount';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT, TAB_BAR_SPACE } from '@/theme/globals';
import { fmtMoneyInt } from '@/lib/format';
import { BlurTargetView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Check, ShoppingCart, Trash2, X } from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View as RNView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BlurTarget = { current: RNView | null };

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

// Stable empty collections, so the derived lists keep their identity between
// renders and the memo below is not invalidated.
const NO_MENU: { categories: Category[]; products: Product[] } = { categories: [], products: [] };
const NO_ZONES: DeliveryZone[] = [];

export default function NewOrderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Android blurs sample a `BlurTargetView` snapshot, not the window, and a
  // target may not contain the view that samples it. The overlays below (cart
  // bar, sheets) are therefore siblings of this, not children, and blur the
  // product list through it.
  const contentRef = useRef<RNView | null>(null);

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const card = useColor('card');
  const border = useColor('border');
  const secondary = useColor('secondary');
  const green = useColor('green');
  const red = useColor('red');

  // The menu and the tax rate come from the cache, so a tab switch or a cold
  // start paints immediately instead of showing the grid shimmer again.
  const menuQuery = useMenu();
  const settingsQuery = useSettings();
  const menu = menuQuery.data ?? NO_MENU;
  const loading = menuQuery.isLoading;
  const error = menuQuery.error ? (menuQuery.error as Error).message : '';

  const settingsTaxRate = Number((settingsQuery.data?.settings as any)?.taxRate);
  const taxRate = Number.isFinite(settingsTaxRate) && settingsTaxRate >= 0 ? settingsTaxRate : 0.14;

  const [categoryIdOverride, setCategoryId] = useState('');
  // The first category is the default until the owner taps another one — derived
  // rather than seeded from an effect.
  const categoryId = categoryIdOverride || menu.categories[0]?.id || '';
  const [cart, setCart] = useState<CartLine[]>([]);

  const [optionsFor, setOptionsFor] = useState<Product | null>(null);
  const optionsQuery = useProductOptions(optionsFor?.id);
  const options = optionsFor ? optionsQuery.data ?? null : null;
  const [draftAddons, setDraftAddons] = useState<Addon[]>([]);
  const [draftModifiers, setDraftModifiers] = useState<Modifier[]>([]);

  const [checkout, setCheckout] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [paymentType, setPaymentType] = useState<'cash' | 'visa'>('cash');
  const [note, setNote] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [zoneIdOverride, setZoneId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [discountResult, setDiscountResult] = useState<{
    valid: boolean;
    discount?: DiscountRule;
    error?: string;
  } | null>(null);

  // Delivery reference data, fetched only when checkout actually needs it.
  const deliveryEnabled = checkout && orderType === 'delivery';
  const zonesQuery = useDeliveryZones(deliveryEnabled);
  const profilesQuery = useDeliveryProfiles(deliveryEnabled);
  const zones: DeliveryZone[] = zonesQuery.data?.zones ?? NO_ZONES;
  const profiles: DeliveryProfile[] = profilesQuery.data?.profiles ?? [];

  const createOrderMutation = useCreateOrder();
  const validateDiscountMutation = useValidateDiscountCode();
  const checkingCode = validateDiscountMutation.isPending;

  // Same for the delivery zone: the first one, until the owner picks another.
  const zoneId = zoneIdOverride || zones[0]?.id || '';

  const products = useMemo(
    () => (categoryId ? menu.products.filter((p) => p.categoryId === categoryId) : menu.products),
    [menu.products, categoryId]
  );

  // Money stays in whole pounds: round the subtotal once, then derive tax,
  // discount and total from it, so the receipt adds up exactly — same as the
  // till.
  const subtotal = Math.round(cart.reduce((sum, line) => sum + lineTotal(line), 0));
  const activeZone = zones.find((z) => z.id === zoneId);
  const deliveryFee = orderType === 'delivery' ? Math.round(activeZone?.fee ?? 0) : 0;
  const tax = Math.round(subtotal * taxRate);

  const appliedDiscount = discountResult?.valid ? discountResult.discount ?? null : null;
  const { total: discountAmount, lineDiscounts } = computeDiscount(
    appliedDiscount,
    cart.map((line) => ({
      lineId: line.lineId,
      productId: line.product.id,
      lineTotal: Math.round(lineTotal(line)),
    })),
    subtotal
  );

  const total = subtotal + tax + deliveryFee - discountAmount;
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const addLine = (line: CartLine) => setCart((prev) => [...prev, line]);

  const onPickProduct = (product: Product) => {
    setOptionsFor(product);
    setDraftAddons([]);
    setDraftModifiers([]);
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

  const setQuantity = (lineId: string, quantity: number) =>
    setCart((prev) =>
      prev.map((line) => (line.lineId === lineId ? { ...line, quantity: Math.max(1, quantity) } : line))
    );

  const setLineNote = (lineId: string, next: string) =>
    setCart((prev) => prev.map((line) => (line.lineId === lineId ? { ...line, note: next } : line)));

  const removeLine = (lineId: string) => setCart((prev) => prev.filter((line) => line.lineId !== lineId));

  const clearCart = () => {
    if (cart.length === 0) return;
    Alert.alert('تفريغ السلة', 'كل الأصناف هتتشال من الطلب.', [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'تفريغ',
        style: 'destructive',
        onPress: () => {
          setCart([]);
          setDiscountCode('');
          setDiscountResult(null);
        },
      },
    ]);
  };

  const onValidateDiscount = async () => {
    const code = discountCode.trim();
    if (!code) {
      setDiscountResult(null);
      return;
    }
    try {
      const res = await validateDiscountMutation.mutateAsync(code);
      setDiscountResult(res.validation);
    } catch (err: any) {
      setDiscountResult({ valid: false, error: err?.message ?? 'تعذّر التحقق من الكود' });
    }
  };

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
          itemDiscount: lineDiscounts[line.lineId] || 0,
          modifiers: line.modifiers.map((m) => ({
            modifierId: m.id,
            modifierName: m.name,
            priceAdjustment: m.priceAdjustment,
          })),
          addons: line.addons.flatMap((a) => Array(line.quantity).fill(a.id)),
        })),
        note: note.trim() || undefined,
        // The server marks the code used itself when it creates the order.
        discountCode: discountAmount > 0 ? discountCode.trim() : undefined,
        discountCodeId: discountAmount > 0 ? appliedDiscount?.id : undefined,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
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
        ...(orderType === 'dine-in' && tableNumber.trim()
          ? { tableNumber: tableNumber.trim() }
          : {}),
      };
      const res = await createOrderMutation.mutateAsync({ payload, idempotencyKey: newKey() });
      setCart([]);
      setCheckout(false);
      setNote('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setProfileId('');
      setTableNumber('');
      setDiscountCode('');
      setDiscountResult(null);
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
      <BlurTargetView ref={contentRef} style={{ flex: 1 }}>
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
      </BlurTargetView>

      {cart.length > 0 ? (
        <GlassPane
          blurTarget={contentRef}
          borderColor={border}
          style={[
            styles.cartBar,
            {
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
          <Button
            onPress={() => {
              setCheckoutStep(0);
              setCheckout(true);
            }}
          >
            إتمام
          </Button>
        </GlassPane>
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
          blurTarget={contentRef}
          primary={primary}
          muted={muted}
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
          tableNumber={tableNumber}
          setTableNumber={setTableNumber}
          step={checkoutStep}
          setStep={setCheckoutStep}
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
          onSetQuantity={setQuantity}
          onRemoveLine={removeLine}
          onSetLineNote={setLineNote}
          onClear={clearCart}
          discountCode={discountCode}
          setDiscountCode={(next) => {
            setDiscountCode(next);
            if (!next.trim()) setDiscountResult(null);
          }}
          onValidateDiscount={onValidateDiscount}
          discountResult={discountResult}
          discountAmount={discountAmount}
          checkingCode={checkingCode}
          busy={busy}
          onSubmit={submit}
          onClose={() => setCheckout(false)}
          blurTarget={contentRef}
          primary={primary}
          muted={muted}
          border={border}
          secondary={secondary}
          green={green}
          red={red}
          insetsBottom={insets.bottom}
        />
      ) : null}
    </View>
  );
}

interface PanelColors {
  primary: string;
  muted: string;
  border: string;
  secondary: string;
  insetsBottom: number;
}

function Sheet({
  children,
  blurTarget,
  ...c
}: { children: React.ReactNode; blurTarget?: BlurTarget } & PanelColors) {
  return (
    <GlassPane
      blurTarget={blurTarget}
      borderColor={c.border}
      style={[
        styles.sheet,
        {
          // Float above the tab bar so the sheet never hides behind it.
          bottom: TAB_BAR_GAP + c.insetsBottom + TAB_BAR_HEIGHT + 8,
          paddingBottom: 16,
        },
      ]}
    >
      {children}
    </GlassPane>
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
  blurTarget,
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
  blurTarget?: BlurTarget;
} & PanelColors) {
  return (
    <Sheet {...c} blurTarget={blurTarget}>
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
  tableNumber,
  setTableNumber,
  step,
  setStep,
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
  onSetQuantity,
  onRemoveLine,
  onSetLineNote,
  onClear,
  discountCode,
  setDiscountCode,
  onValidateDiscount,
  discountResult,
  discountAmount,
  checkingCode,
  busy,
  onSubmit,
  onClose,
  blurTarget,
  ...c
}: {
  cart: CartLine[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  tableNumber: string;
  setTableNumber: (v: string) => void;
  /** 0 = cart items, 1 = order details. */
  step: number;
  setStep: (n: number) => void;
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
  onSetQuantity: (lineId: string, quantity: number) => void;
  onRemoveLine: (lineId: string) => void;
  onSetLineNote: (lineId: string, next: string) => void;
  onClear: () => void;
  discountCode: string;
  setDiscountCode: (v: string) => void;
  onValidateDiscount: () => void;
  discountResult: { valid: boolean; discount?: DiscountRule; error?: string } | null;
  discountAmount: number;
  checkingCode: boolean;
  busy: boolean;
  onSubmit: () => void;
  onClose: () => void;
  blurTarget?: BlurTarget;
  green: string;
  red: string;
} & PanelColors) {
  const orderTypes: { key: OrderType; label: string }[] = [
    { key: 'dine-in', label: 'صالة' },
    { key: 'takeaway', label: 'تيك أوي' },
    { key: 'delivery', label: 'توصيل' },
  ];

  // Step 1 reviews the cart, step 2 fills in the order details and sends it.
  const onItemsStep = step === 0;

  return (
    <Sheet {...c} blurTarget={blurTarget}>
      <View style={styles.sheetHeader}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant='subtitle'>{onItemsStep ? 'السلة' : 'إتمام الطلب'}</Text>
          <View style={styles.steps}>
            {[0, 1].map((i) => (
              <View
                key={i}
                style={[styles.stepDot, { backgroundColor: i <= step ? c.primary : c.secondary }]}
              />
            ))}
          </View>
        </View>
        <Pressable onPress={onClear} accessibilityLabel='تفريغ السلة' style={{ padding: 4 }}>
          <Trash2 size={18} color={c.muted} />
        </Pressable>
        <Pressable onPress={onClose} accessibilityLabel='إغلاق'>
          <X size={20} color={c.muted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ maxHeight: 420 }}
        contentContainerStyle={{ gap: 14 }}
        keyboardShouldPersistTaps='handled'
      >
        {onItemsStep ? (
          cart.length === 0 ? (
            <Text variant='caption' style={{ color: c.muted }}>
              السلة فاضية — ارجع واختار أصناف.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {cart.map((line) => (
                <View key={line.lineId} style={{ gap: 6 }}>
                  <View style={styles.cartLine}>
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
                    <QuantityStepper
                      quantity={line.quantity}
                      onChange={(next) => onSetQuantity(line.lineId, next)}
                      onRemove={() => onRemoveLine(line.lineId)}
                      size='sm'
                    />
                  </View>
                  <Input
                    placeholder='ملاحظة على الصنف (اختياري)'
                    value={line.note}
                    onChangeText={(next) => onSetLineNote(line.lineId, next)}
                  />
                </View>
              ))}
            </View>
          )
        ) : (
          <>
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

            {orderType === 'dine-in' ? (
              <View style={{ gap: 6 }}>
                <Text variant='caption' style={{ color: c.muted, fontWeight: '700' }}>
                  رقم الترابيزة
                </Text>
                <Input
                  placeholder='مثال: 5'
                  value={tableNumber}
                  onChangeText={setTableNumber}
                  keyboardType='number-pad'
                />
              </View>
            ) : null}

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

            <View style={{ gap: 6 }}>
              <Text variant='caption' style={{ color: c.muted, fontWeight: '700' }}>
                كود الخصم
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Input
                  placeholder='اكتب الكود'
                  value={discountCode}
                  onChangeText={setDiscountCode}
                  containerStyle={{ flex: 1 }}
                  autoCapitalize='characters'
                />
                <Button onPress={onValidateDiscount} loading={checkingCode} disabled={!discountCode.trim()}>
                  تحقق
                </Button>
              </View>
              {discountResult ? (
                discountResult.valid ? (
                  <View style={{ gap: 2 }}>
                    <Text variant='caption' style={{ color: c.green, fontWeight: '700' }}>
                      {describeDiscount(discountResult.discount)}
                    </Text>
                    {discountResult.discount?.remaining != null ? (
                      <Text variant='caption' style={{ color: c.muted }}>
                        متبقي {discountResult.discount.remaining} استخدام النهاردة
                      </Text>
                    ) : null}
                    {discountAmount === 0 ? (
                      <Text variant='caption' style={{ color: c.muted }}>
                        مفيش صنف في السلة بيشمله الكود ده
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text variant='caption' style={{ color: c.red, fontWeight: '700' }}>
                    {discountResult.error ?? 'كود غير صالح'}
                  </Text>
                )
              ) : null}
            </View>

            <View style={{ gap: 4 }}>
              <SummaryRow label='المجموع الفرعي' value={subtotal} muted={c.muted} />
              {deliveryFee > 0 ? <SummaryRow label='رسوم التوصيل' value={deliveryFee} muted={c.muted} /> : null}
              <SummaryRow label='الضريبة' value={tax} muted={c.muted} />
              {discountAmount > 0 ? (
                <SummaryRow
                  label={`الخصم (${discountCode.trim()})`}
                  value={-discountAmount}
                  muted={c.green}
                />
              ) : null}
              <Separator />
              <SummaryRow label='الإجمالي' value={total} muted={c.primary} strong />
            </View>
          </>
        )}
      </ScrollView>

      {onItemsStep ? (
        <Button onPress={() => setStep(1)} disabled={cart.length === 0} style={{ alignSelf: 'stretch' }}>
          التالي
        </Button>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant='outline' onPress={() => setStep(0)} style={{ flex: 1 }}>
            رجوع
          </Button>
          <Button onPress={onSubmit} loading={busy} disabled={cart.length === 0} style={{ flex: 2 }}>
            إرسال الطلب
          </Button>
        </View>
      )}
    </Sheet>
  );
}

function SummaryRow({ label, value, muted, strong }: { label: string; value: number; muted: string; strong?: boolean }) {
  // Without an explicit colour RN's default text colour is black — which is
  // invisible on the dark sheet, so the money rows must name the theme colour.
  const text = useColor('text');
  return (
    <View style={styles.cartLine}>
      <Text variant='caption' style={{ color: muted, fontWeight: strong ? '700' : '400' }}>
        {label}
      </Text>
      <Text style={{ fontWeight: strong ? '700' : '500', color: strong ? muted : text }}>
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
  },
  sheet: {
    position: 'absolute',
    left: TAB_BAR_GAP,
    right: TAB_BAR_GAP,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  steps: { flexDirection: 'row', gap: 6 },
  stepDot: { width: 22, height: 4, borderRadius: 999 },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
