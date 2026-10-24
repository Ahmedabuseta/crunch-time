import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { usePairing } from '@/hooks/usePairing';
import { parsePairPayload } from '@/lib/pairPayload';
import { useSession } from '@/lib/session';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useRouter } from 'expo-router';
import { QrCode, X } from 'lucide-react-native';
import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';

export default function ScanScreen() {
  const router = useRouter();
  const { signedIn } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const { busy, error, reportError, run } = usePairing();
  const handled = useRef(false);

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const red = useColor('red');

  if (signedIn) return <Redirect href='/board' />;

  const onScanned = async ({ data }: { data: string }) => {
    if (handled.current || busy) return;
    const payload = parsePairPayload(data);
    if (!payload) {
      reportError('الكود ده مش كود ربط كرنش تايم');
      return;
    }
    handled.current = true;
    // A failure frees the camera again, so the next code can be scanned.
    if (!(await run(payload))) handled.current = false;
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text variant='body'>جارٍ تجهيز الكاميرا…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <QrCode size={18} color={primary} />
            <Text variant='subtitle'>كاميرا لمسح كود الربط</Text>
          </View>
          <Text variant='caption' style={{ color: muted }}>
            محتاجين إذن الكاميرا عشان تمسح الكود اللي على شاشة الكمبيوتر.
          </Text>
          <Button onPress={() => void requestPermission()} style={{ alignSelf: 'stretch' }}>
            السماح بالكاميرا
          </Button>
          {permission.canAskAgain === false ? (
            <Text variant='caption' style={{ color: red }}>
              افتح إعدادات الموبايل واسمح بالكاميرا للتطبيق.
            </Text>
          ) : null}
          <Button variant='ghost' onPress={() => router.back()}>
            رجوع
          </Button>
        </Card>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing='back'
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : (result) => void onScanned(result)}
      />

      <View style={styles.overlay} pointerEvents='box-none'>
        <View style={styles.topBar}>
          <Text variant='subtitle' style={{ color: '#fff' }}>
            امسح الكود الظاهر على شاشة الكمبيوتر
          </Text>
          <Button variant='ghost' icon={X} onPress={() => router.back()}>
            إلغاء
          </Button>
        </View>

        <View style={[styles.frame, { borderColor: primary }]} />

        {error ? (
          <View style={styles.errorBox}>
            <Text variant='caption' style={{ color: red, textAlign: 'center' }}>
              {error}
            </Text>
          </View>
        ) : (
          <Text variant='caption' style={{ color: '#fff', textAlign: 'center' }}>
            الإعدادات → النظام → الخادم البعيد → «إظهار كود الربط»
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 24 },
  topBar: { alignItems: 'center', gap: 8, paddingTop: 40 },
  frame: { width: 240, height: 240, borderWidth: 3, borderRadius: 24 },
  errorBox: { backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, padding: 12 },
});
