import { api } from '@/api/endpoints';
import type { AssistantConfig } from '@/api/types';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

interface FormState {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  dailyTokenLimit: string;
}

const EMPTY_FORM: FormState = {
  enabled: false,
  provider: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  dailyTokenLimit: '',
};

/**
 * The three providers worth a single tap. Typing a base URL by hand is the most
 * error-prone part of this sheet, and in practice the answer is always one of
 * these — the fields stay editable for anything else.
 */
const PROVIDERS = [
  {
    label: 'Groq',
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
  },
  {
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    label: 'OpenRouter',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
] as const;

function toForm(config: AssistantConfig): FormState {
  return {
    enabled: config.enabled,
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    // Never seeded from the server: the key only ever travels inwards, and an
    // empty field is what tells `PUT` to keep the stored one.
    apiKey: '',
    dailyTokenLimit: String(config.dailyTokenLimit ?? ''),
  };
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'حصل خطأ غير متوقع';
}

const tokens = (value: number | undefined): string =>
  (Number(value) || 0).toLocaleString('en-US');

/**
 * Everything about the assistant that is configuration rather than chat: the
 * provider and its key, the daily cap, whether it is on at all, and the
 * destructive "forget this conversation" at the bottom.
 */
export function AssistantConfigSheet({
  isVisible,
  onClose,
  onClearHistory,
}: {
  isVisible: boolean;
  onClose: () => void;
  /** Owned by the chat hook, because the thread itself lives there. */
  onClearHistory: () => Promise<void>;
}) {
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    model?: string;
    latencyMs?: number;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const green = useColor('green');
  const red = useColor('red');
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');
  const border = useColor('border');

  // Read on open rather than on mount: the sheet is always mounted, and this is
  // the one moment the values can have changed underneath it.
  useEffect(() => {
    if (!isVisible) return;
    let alive = true;

    void (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);
      setTestResult(null);

      try {
        const { config: loaded } = await api.assistant.config();
        if (!alive) return;
        setConfig(loaded);
        setForm(toForm(loaded));
      } catch (err) {
        if (alive) setError(messageOf(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isVisible]);

  const patch = (next: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...next }));
    setSaved(false);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { config: updated } = await api.assistant.saveConfig({
        enabled: form.enabled,
        provider: form.provider.trim(),
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        // Omitted rather than 0: an empty field means "leave the cap alone",
        // and 0 would block every request.
        ...(Number(form.dailyTokenLimit) > 0
          ? { dailyTokenLimit: Number(form.dailyTokenLimit) }
          : {}),
        // Absent, not empty: an empty string would wipe the stored key.
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      });
      setConfig(updated);
      setForm(toForm(updated));
      setSaved(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api.assistant.test());
    } catch (err) {
      setTestResult({ ok: false, error: messageOf(err) });
    } finally {
      setTesting(false);
    }
  };

  const confirmClear = () => {
    Alert.alert('مسح المحادثة', 'كل الرسائل هتتمسح من الخادم كمان. متأكد؟', [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'امسح',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await onClearHistory();
            } catch (err) {
              setError(messageOf(err));
            }
          })();
        },
      },
    ]);
  };

  const usage = config?.today;

  return (
    <BottomSheet isVisible={isVisible} onClose={onClose} title='إعدادات المساعد' snapPoints={[0.9]}>
      {loading ? (
        <View style={{ paddingVertical: 40 }}>
          <Spinner />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Switch
            label='المساعد شغال'
            value={form.enabled}
            onValueChange={(enabled) => patch({ enabled })}
          />
          <Text variant='caption' style={{ color: muted }}>
            لما تقفله، الشات بيرد إن المساعد متوقف.
          </Text>

          <Separator />

          <View style={styles.presets}>
            {PROVIDERS.map((preset) => {
              const active = form.baseUrl.trim().replace(/\/+$/, '') === preset.baseUrl;
              return (
                <Pressable
                  key={preset.label}
                  onPress={() =>
                    patch({ provider: preset.provider, baseUrl: preset.baseUrl, model: preset.model })
                  }
                  style={[
                    styles.preset,
                    {
                      borderColor: active ? primary : border,
                      backgroundColor: active ? `${primary}1F` : 'transparent',
                    },
                  ]}
                  accessibilityRole='button'
                  accessibilityLabel={preset.label}
                >
                  <Text variant='caption' style={{ color: active ? primary : muted, fontSize: 13 }}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Input
            label='المزود'
            value={form.provider}
            onChangeText={(provider) => patch({ provider })}
            placeholder='groq'
            autoCapitalize='none'
          />
          <Input
            label='العنوان'
            value={form.baseUrl}
            onChangeText={(baseUrl) => patch({ baseUrl })}
            placeholder='https://api.groq.com/openai/v1'
            autoCapitalize='none'
            keyboardType='url'
          />
          <Input
            label='الموديل'
            value={form.model}
            onChangeText={(model) => patch({ model })}
            placeholder='openai/gpt-oss-120b'
            autoCapitalize='none'
          />
          <Input
            label='مفتاح API'
            value={form.apiKey}
            onChangeText={(apiKey) => patch({ apiKey })}
            placeholder='خليه فاضي لو مش عايز تغيّره'
            autoCapitalize='none'
            secureTextEntry
          />
          <Text variant='caption' style={{ color: muted }}>
            {config?.hasKey ? `محدد ✓${config.keyHint ? ` (${config.keyHint})` : ''}` : 'غير محدد'}
          </Text>

          <Input
            label='حد التوكن اليومي'
            value={form.dailyTokenLimit}
            onChangeText={(dailyTokenLimit) => patch({ dailyTokenLimit })}
            placeholder='150000'
            keyboardType='number-pad'
          />

          <Separator />

          <Button
            variant='outline'
            style={{ alignSelf: 'stretch' }}
            loading={testing}
            onPress={() => void runTest()}
            disabled={testing}
          >
            اختبار
          </Button>
          {testing ? null : testResult ? (
            testResult.ok ? (
              <Text variant='caption' style={{ color: green }}>
                ✔ {testResult.model ?? form.model}
                {typeof testResult.latencyMs === 'number' ? ` · ${testResult.latencyMs}ms` : ''}
              </Text>
            ) : (
              <Text variant='caption' style={{ color: red }}>
                {testResult.error ?? 'الاختبار فشل'}
              </Text>
            )
          ) : null}

          <Text variant='caption' style={{ color: muted }}>
            {usage
              ? `استخدام اليوم: ${tokens(usage.total)} توكن · ${tokens(usage.requests)} طلب`
              : 'استخدام اليوم: —'}
          </Text>

          {error ? (
            <Text variant='caption' style={{ color: red }}>
              {error}
            </Text>
          ) : null}

          <Button
            style={{ alignSelf: 'stretch' }}
            loading={saving}
            onPress={() => void save()}
            disabled={saving}
          >
            {saved ? 'اتحفظ ✓' : 'حفظ'}
          </Button>

          <Separator />

          <Button variant='destructive' style={{ alignSelf: 'stretch' }} onPress={confirmClear}>
            مسح المحادثة
          </Button>

          <Text variant='caption' style={[styles.footnote, { color: muted }]}>
            المنفذ المحلي {config?.temporalPort ?? '—'} · {config?.temporalRunning ? 'شغال' : 'واقف'}
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footnote: { textAlign: 'center', marginTop: 4, fontSize: 12 },
  presets: { flexDirection: 'row', gap: 8 },
  preset: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 8, alignItems: 'center' },
});
