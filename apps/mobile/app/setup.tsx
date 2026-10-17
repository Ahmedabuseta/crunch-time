import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { useSession } from '@/lib/session';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { ArrowLeft, Lock, QrCode, Server } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

type Step = 'server' | 'pin';

export default function SetupScreen() {
  const router = useRouter();
  const { serverUrl, signedIn, connect, signIn } = useSession();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const destructive = useColor('destructive');

  const [step, setStep] = useState<Step>(serverUrl ? 'pin' : 'server');
  const [url, setUrl] = useState(serverUrl);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (signedIn) return <Redirect href='/board' />;

  const onConnect = async () => {
    setBusy(true);
    setError('');
    try {
      await connect(url);
      setStep('pin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الاتصال — راجع العنوان');
    } finally {
      setBusy(false);
    }
  };

  const onSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signIn(pin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'الرقم السري غلط');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps='handled'>
      <Image
        source={require('../assets/images/logo.png')}
        style={styles.logo}
        contentFit='contain'
      />

      <Text variant='title'>ربط الخادم</Text>
      <Text variant='caption' style={{ textAlign: 'center', color: muted }}>
        {step === 'server'
          ? 'أسهل طريقة: امسح كود الربط من شاشة الكمبيوتر. أو اكتب عنوان الجهاز بنفسك.'
          : 'اكتب الرقم السري اللي ظبّطته من إعدادات الخادم على الكمبيوتر، أو امسح كود ربط جديد.'}
      </Text>

      {/* Always available — a returning owner lands on the PIN step, and the
          scan is still the easiest way back in. */}
      <Button onPress={() => router.push('/scan')} icon={QrCode} style={{ alignSelf: 'stretch' }}>
        امسح كود الربط
      </Button>

      <Card style={styles.card}>
        {step === 'server' ? (
          <View style={{ gap: 12 }}>
            <View style={styles.row}>
              <Server size={16} color={muted} />
              <Text variant='caption' style={{ color: muted }}>
                عنوان الخادم
              </Text>
            </View>
            <Input
              placeholder='100.101.102.103:4317'
              value={url}
              onChangeText={setUrl}
              autoCapitalize='none'
              autoCorrect={false}
              keyboardType='url'
              inputStyle={{ textAlign: 'left' }}
            />
            <Text variant='caption' style={{ color: muted }}>
              أمثلة: 192.168.1.5:4317 داخل المحل · 100.101.102.103:4317 عبر Tailscale
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={styles.row}>
              <Lock size={16} color={muted} />
              <Text variant='caption' style={{ color: muted }}>
                الرقم السري
              </Text>
            </View>
            <Input
              placeholder='••••'
              value={pin}
              onChangeText={setPin}
              secureTextEntry
              keyboardType='number-pad'
              inputStyle={{ textAlign: 'center', letterSpacing: 8 }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Server size={14} color={muted} />
              <Text variant='caption' style={{ color: muted }}>
                {url}
              </Text>
            </View>
          </View>
        )}
      </Card>

      {error ? (
        <Text variant='caption' style={{ color: destructive, textAlign: 'center' }}>
          {error}
        </Text>
      ) : null}

      {step === 'server' ? (
        <Button onPress={onConnect} loading={busy} disabled={!url.trim()} style={{ alignSelf: 'stretch' }}>
          اتصال
        </Button>
      ) : (
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          <Button onPress={onSignIn} loading={busy} disabled={pin.length < 4} style={{ alignSelf: 'stretch' }}>
            دخول
          </Button>
          <Button
            variant='ghost'
            icon={ArrowLeft}
            onPress={() => {
              setStep('server');
              setError('');
            }}
            style={{ alignSelf: 'stretch' }}
          >
            تغيير عنوان الخادم
          </Button>
        </View>
      )}

      <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: border, opacity: 0.5 }} />
      <Button variant='ghost' onPress={() => router.push('/onboarding')} style={{ alignSelf: 'stretch' }}>
        شاهد التعريف تاني
      </Button>
      <Text variant='caption' style={{ textAlign: 'center', color: primary }}>
        كرنش تايم — تطبيق المالك
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  logo: { width: 104, height: 104 },
  card: { alignSelf: 'stretch', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
