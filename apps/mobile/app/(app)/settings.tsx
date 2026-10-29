import { getApiBaseUrl } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { ModeToggle } from '@/components/ui/mode-toggle';
import { useHealth } from '@/hooks/queries/store';
import { useColor } from '@/hooks/useColor';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { useSession } from '@/lib/session';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { BarChart3, Boxes, LogOut, Radio, Server, Sparkles, Wallet } from 'lucide-react-native';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { serverUrl, signOut, resetOnboarding } = useSession();

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const secondary = useColor('secondary');
  const green = useColor('green');
  const red = useColor('red');

  const online = useOnlineStatus();
  const health = useHealth({ refetchInterval: 15000 });
  // null until the first answer, so the badge shows "..." rather than a guess.
  const reachable: boolean | null = !online
    ? false
    : health.isSuccess
      ? true
      : health.isError
        ? false
        : null;

  const confirmSignOut = () =>
    Alert.alert('تسجيل الخروج', 'هتحتاج الرقم السري تاني للدخول.', [
      { text: 'رجوع', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_BAR_SPACE + 20 }}>
      <View style={styles.header}>
        <Text variant='title'>المزيد</Text>
        <Text variant='caption' style={{ color: muted }}>
          الخادم والمظهر والحساب
        </Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Server size={18} color={primary} />
            <Text variant='subtitle' style={{ flex: 1 }}>
              الخادم
            </Text>
            <View
              style={[
                styles.pill,
                { backgroundColor: reachable === false ? `${red}22` : secondary },
              ]}
            >
              <Radio size={12} color={reachable === false ? red : reachable ? green : muted} />
              <Text
                variant='caption'
                style={{ color: reachable === false ? red : reachable ? green : muted, fontSize: 12 }}
              >
                {reachable === null ? '...' : reachable ? 'متصل' : 'غير متصل'}
              </Text>
            </View>
          </View>
          <Separator />
          <Row label='العنوان' value={serverUrl || getApiBaseUrl() || '—'} muted={muted} />
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Wallet size={18} color={green} />
            <Text variant='subtitle' style={{ flex: 1 }}>
              الوردية والتقارير
            </Text>
          </View>
          <Button variant='secondary' icon={Wallet} style={{ alignSelf: 'stretch' }} onPress={() => router.push('/shift')}>
            الوردية والدرج
          </Button>
          <Button variant='secondary' icon={BarChart3} style={{ alignSelf: 'stretch' }} onPress={() => router.push('/reports')}>
            التقارير
          </Button>
        </Card>

        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Boxes size={18} color={primary} />
            <Text variant='subtitle' style={{ flex: 1 }}>
              الإدارة
            </Text>
          </View>
          <Text variant='caption' style={{ color: muted }}>
            منتجات · أقسام · مخزون · موظفين · بيانات المحل — كلهم من زر الإجراءات العائم تحت.
          </Text>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant='subtitle'>المظهر</Text>
          <View style={styles.row}>
            <Text variant='caption' style={{ color: muted }}>
              فاتح / داكن
            </Text>
            <ModeToggle />
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color={primary} />
            <Text variant='subtitle' style={{ flex: 1 }}>
              المساعد
            </Text>
          </View>
          <Button
            variant='secondary'
            icon={Sparkles}
            style={{ alignSelf: 'stretch' }}
            onPress={() => router.push('/assistant')}
          >
            اسأل المساعد
          </Button>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant='subtitle'>مساعدة</Text>
          <Button
            variant='secondary'
            icon={Sparkles}
            style={{ alignSelf: 'stretch' }}
            onPress={async () => {
              await resetOnboarding();
              router.push('/onboarding');
            }}
          >
            شاهد التعريف تاني
          </Button>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant='subtitle'>الحساب</Text>
          <Button
            variant='destructive'
            icon={LogOut}
            style={{ alignSelf: 'stretch' }}
            onPress={confirmSignOut}
          >
            تسجيل الخروج
          </Button>
        </Card>

        <Pressable disabled>
          <Text variant='caption' style={{ color: muted, textAlign: 'center' }}>
            كرنش تايم — تطبيق المالك · نسخة {Constants.expoConfig?.version ?? '0.1.0'}
          </Text>
        </Pressable>
      </View>
      </ScrollView>
    </>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted: string }) {
  return (
    <View style={styles.row}>
      <Text variant='caption' style={{ color: muted }}>
        {label}
      </Text>
      <Text style={{ fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
});
