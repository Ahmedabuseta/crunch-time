import { api } from '@/api/endpoints';
import type { PrinterInfo, StoreSettings } from '@/api/types';
import { AdminScreen, Field } from '@/components/app/AdminKit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { Database, Printer, Store } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

export default function StoreScreen() {
  const muted = useColor('mutedForeground');
  const green = useColor('green');

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [backup, setBackup] = useState<{ lastBackup: string | null; backupCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [settings, printersRes, backupRes] = await Promise.all([
        api.settings(),
        api.printers().catch(() => ({ printers: [] as PrinterInfo[] })),
        api.backupStatus().catch(() => null),
      ]);
      const s = settings.settings as StoreSettings;
      setDraft({
        restaurantName: String(s.restaurantName ?? ''),
        storeTagline: String(s.storeTagline ?? ''),
        storePhone: String(s.storePhone ?? ''),
        storePhone2: String(s.storePhone2 ?? ''),
        storeAddress: String(s.storeAddress ?? ''),
        taxNumber: String(s.taxNumber ?? ''),
        vatNumber: String(s.vatNumber ?? ''),
        receiptFooter: String(s.receiptFooter ?? ''),
        currencyLabel: String(s.currencyLabel ?? ''),
        taxRate: String(Math.round(Number(s.taxRate ?? 0) * 100)),
      });
      setPrinters(printersRes.printers ?? []);
      setBackup(backupRes?.status ?? null);
    } catch (err: any) {
      Alert.alert('تعذّر تحميل بيانات المحل', err?.message ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        restaurantName: draft.restaurantName?.trim() ?? '',
        storeTagline: draft.storeTagline?.trim() || null,
        storePhone: draft.storePhone?.trim() || null,
        storePhone2: draft.storePhone2?.trim() || null,
        storeAddress: draft.storeAddress?.trim() || null,
        taxNumber: draft.taxNumber?.trim() || null,
        vatNumber: draft.vatNumber?.trim() || null,
        receiptFooter: draft.receiptFooter?.trim() ?? '',
        currencyLabel: draft.currencyLabel?.trim() ?? '',
      };
      const percent = Number(draft.taxRate);
      if (Number.isFinite(percent) && percent >= 0) payload.taxRate = percent / 100;
      await api.saveSettings(payload);
      Alert.alert('تم', 'اتحفظت بيانات المحل — هتظهر على الإيصالات الجاية.');
      await load();
    } catch (err: any) {
      Alert.alert('تعذّر الحفظ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const runBackup = async () => {
    setBusy(true);
    try {
      const res: any = await api.triggerBackup();
      Alert.alert(res?.ok ? 'تم النسخ الاحتياطي' : 'تعذّر النسخ', res?.message || res?.error || '');
      await load();
    } catch (err: any) {
      Alert.alert('تعذّر النسخ', err?.message ?? '');
    } finally {
      setBusy(false);
    }
  };

  const field = (key: string, label: string, placeholder?: string, keyboardType?: 'default' | 'number-pad') => (
    <Field
      label={label}
      value={draft[key] ?? ''}
      onChange={(v) => setDraft((prev) => ({ ...prev, [key]: v }))}
      placeholder={placeholder}
      keyboardType={keyboardType}
    />
  );

  return (
    <AdminScreen
      title='المحل والإعدادات'
      subtitle='بيانات تظهر على الإيصالات، والطابعات، والنسخ الاحتياطي'
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {loading ? (
        <>
          <Skeleton height={120} style={{ borderRadius: 18 }} />
          <Skeleton height={80} style={{ borderRadius: 18 }} />
        </>
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Store size={18} color={green} />
              <Text variant='subtitle'>بيانات المحل</Text>
            </View>
            {field('restaurantName', 'اسم المحل', 'كرنش تايم')}
            {field('storeTagline', 'الوصف تحت الاسم', 'كريب · حلو · عصير')}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>{field('storePhone', 'التليفون', '0100…')}</View>
              <View style={{ flex: 1 }}>{field('storePhone2', 'تليفون إضافي')}</View>
            </View>
            {field('storeAddress', 'العنوان')}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>{field('taxNumber', 'السجل التجاري')}</View>
              <View style={{ flex: 1 }}>{field('vatNumber', 'الرقم الضريبي')}</View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>{field('receiptFooter', 'رسالة أسفل الإيصال', 'شكراً لزيارتكم')}</View>
              <View style={{ flex: 1 }}>{field('currencyLabel', 'رمز العملة', 'ج.م')}</View>
            </View>
            {field('taxRate', 'نسبة الضريبة %', '14', 'number-pad')}
            <Button loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void save()}>
              حفظ بيانات المحل
            </Button>
          </Card>

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Printer size={18} color={muted} />
              <Text variant='subtitle'>الطابعات على الكمبيوتر</Text>
            </View>
            {printers.length === 0 ? (
              <Text variant='caption' style={{ color: muted }}>
                مفيش طابعات ظاهرة. الطابعات بتتظبط من الكمبيوتر والطباعة بتخرج منه.
              </Text>
            ) : (
              printers.map((printer) => (
                <View key={printer.name} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text variant='caption' style={{ color: muted, flex: 1 }} numberOfLines={1}>
                    {printer.displayName || printer.name}
                  </Text>
                  {printer.isDefault ? (
                    <Text variant='caption' style={{ color: green, fontWeight: '700' }}>
                      الافتراضية
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </Card>

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Database size={18} color={muted} />
              <Text variant='subtitle'>النسخ الاحتياطي</Text>
            </View>
            <Text variant='caption' style={{ color: muted }}>
              {backup?.lastBackup ? `آخر نسخة: ${backup.lastBackup}` : 'آخر نسخة: لا توجد'}
              {backup?.backupCount ? ` — عدد النسخ: ${backup.backupCount}` : ''}
            </Text>
            <Button variant='secondary' loading={busy} style={{ alignSelf: 'stretch' }} onPress={() => void runBackup()}>
              نسخ احتياطي الآن
            </Button>
          </Card>

          <Text variant='caption' style={{ color: muted }}>
            الإعدادات الأعمق (المحطات، الإيصال، الأكواد، التوجيه) بتتفضّل من الكمبيوتر.
          </Text>
        </>
      )}
    </AdminScreen>
  );
}
