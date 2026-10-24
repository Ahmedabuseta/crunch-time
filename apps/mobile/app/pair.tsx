import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { usePairing } from '@/hooks/usePairing';
import { normalizeBaseUrl } from '@/lib/http';
import { pairPayloadFromParams } from '@/lib/pairPayload';
import { useSession } from '@/lib/session';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { QrCode, Wifi } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

/**
 * Where the pairing QR lands when the owner scans it with the phone's own
 * camera app instead of our in-app scanner. `crunchtime://pair?u=…&c=…` is
 * resolved to the path `pair?u=…&c=…`, so this route is what makes a system
 * scan work — without it the link fell through to `+not-found`.
 */
export default function PairScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { signedIn, serverUrl } = useSession();
  const { busy, error, run } = usePairing();
  const primary = useColor('primary');
  const destructive = useColor('destructive');
  const started = useRef(false);

  const url = String(params.u ?? params.url ?? '').trim();
  const code = String(params.c ?? params.code ?? '').trim();

  // A code for the shop we are already in: pairing again would only burn it.
  const alreadyConnected =
    signedIn && Boolean(url) && normalizeBaseUrl(url) === normalizeBaseUrl(serverUrl);

  // Runs once — a re-render (or the redirect below) must not pair twice, and a
  // pairing code is single-use on the desktop.
  useEffect(() => {
    if (started.current || alreadyConnected) return;
    const payload = pairPayloadFromParams({ u: url, c: code });
    if (!payload) return;
    started.current = true;
    void run(payload);
  }, [alreadyConnected, url, code, run]);

  if (alreadyConnected) return <Redirect href='/board' />;

  // A link with no address in it is not one of ours — send them to the scanner
  // that can read the desktop's QR directly.
  if (!url) {
    return (
      <View style={styles.center}>
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <QrCode size={18} color={primary} />
            <Text variant='subtitle'>الكود ناقص</Text>
          </View>
          <Text variant='caption'>
            الكود ده مش كود ربط كرنش تايم. امسح الكود من شاشة الكمبيوتر من جوّه التطبيق.
          </Text>
          <Button onPress={() => router.replace('/scan')} style={{ alignSelf: 'stretch' }}>
            امسح كود الربط
          </Button>
          <Button
            variant='ghost'
            onPress={() => router.replace('/setup')}
            style={{ alignSelf: 'stretch' }}
          >
            الإعداد اليدوي
          </Button>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <Wifi size={18} color={primary} />
          <Text variant='subtitle'>{error ? 'تعذّر الربط' : 'جارٍ الربط بالكمبيوتر…'}</Text>
        </View>

        <Text variant='caption' numberOfLines={2}>
          {url}
        </Text>

        {error ? (
          <Text variant='caption' style={{ color: destructive, textAlign: 'center' }}>
            {error}
          </Text>
        ) : (
          <ActivityIndicator color={primary} />
        )}

        {error ? (
          <>
            <Button
              icon={QrCode}
              disabled={busy}
              onPress={() => router.replace('/scan')}
              style={{ alignSelf: 'stretch' }}
            >
              امسح كود جديد
            </Button>
            <Button
              variant='ghost'
              loading={busy}
              onPress={() => {
                // The same code is worth another try when the desktop was the
                // side that was not ready — a fresh one is only needed once it
                // has expired.
                started.current = false;
                const payload = pairPayloadFromParams({ u: url, c: code });
                if (payload) {
                  started.current = true;
                  void run(payload);
                }
              }}
              style={{ alignSelf: 'stretch' }}
            >
              حاول تاني
            </Button>
          </>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
