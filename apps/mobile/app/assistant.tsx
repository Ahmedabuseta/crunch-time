import type { ChatMessage } from '@/api/types';
import { AssistantConfigSheet } from '@/components/app/AssistantConfigSheet';
import { ChatBubble } from '@/components/app/ChatBubble';
import { ChatCardView } from '@/components/app/ChatCardView';
import { AvoidKeyboard } from '@/components/ui/avoid-keyboard';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useAssistantChat } from '@/hooks/useAssistantChat';
import { useColor } from '@/hooks/useColor';
import { ChevronLeft, Settings, Sparkles, Square, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Three questions the owner actually asks — a blank screen teaches nothing. */
const EXAMPLES = ['بعت بكام النهاردة؟', 'إيه اللي ناقص في المخزون؟', 'أفضل صنف عندي إيه؟'];

/** Four lines of 20pt plus the field's own padding; past that it scrolls. */
const INPUT_MAX_HEIGHT = 4 * 20 + 20;

/**
 * The assistant lives outside the `(app)` tab navigator on purpose: this is a
 * focused conversation, so the floating tab bar and the quick-action dial both
 * disappear while it is open. It is a root route, reached from the icon on the
 * board and from المزيد.
 */
export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    messages,
    streaming,
    partial,
    status,
    error,
    loadingHistory,
    send,
    abort,
    confirm,
    cancel,
    clear,
  } = useAssistantChat();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const primary = useColor('primary');
  const primaryForeground = useColor('primaryForeground');
  const card = useColor('card');
  const text = useColor('text');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const secondary = useColor('secondary');
  const red = useColor('red');
  const background = useColor('background');

  const submit = useCallback(() => {
    const value = draft.trim();
    if (!value || streaming) return;
    setDraft('');
    void send(value);
  }, [draft, send, streaming]);

  const ask = useCallback(
    (question: string) => {
      void send(question);
    },
    [send]
  );

  const confirmClear = useCallback(() => {
    Alert.alert('مسح المحادثة', 'كل الرسائل هتتمسح من الخادم كمان. متأكد؟', [
      { text: 'رجوع', style: 'cancel' },
      { text: 'امسح', style: 'destructive', onPress: () => void clear() },
    ]);
  }, [clear]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <View style={{ gap: 8 }}>
        <ChatBubble message={item} />
        {item.cards?.map((messageCard, index) => (
          <ChatCardView
            key={`card-${index}`}
            card={messageCard}
            onConfirm={confirm}
            onCancel={cancel}
          />
        ))}
        {item.followups?.length ? (
          <View style={styles.chips}>
            {item.followups.map((followup) => (
              <Chip key={followup} label={followup} onPress={() => ask(followup)} />
            ))}
          </View>
        ) : null}
      </View>
    ),
    [ask, cancel, confirm]
  );

  return (
    <View style={{ flex: 1, backgroundColor: background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.iconButton}
          accessibilityRole='button'
          accessibilityLabel='رجوع'
        >
          <ChevronLeft size={22} color={muted} />
        </Pressable>
        <Text variant='title' style={{ flex: 1 }}>
          المساعد
        </Text>
        <Pressable
          onPress={confirmClear}
          hitSlop={10}
          style={styles.iconButton}
          accessibilityRole='button'
          accessibilityLabel='مسح المحادثة'
        >
          <Trash2 size={20} color={muted} />
        </Pressable>
        <Pressable
          onPress={() => setSheetOpen(true)}
          hitSlop={10}
          style={styles.iconButton}
          accessibilityRole='button'
          accessibilityLabel='إعدادات المساعد'
        >
          <Settings size={20} color={muted} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps='handled'
        // A chat reads from its newest line: on open (the history arrives after
        // the first layout) and on every answer.
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          messages.length === 0 && !streaming ? (
            <EmptyState loading={loadingHistory} onPick={ask} />
          ) : null
        }
        ListFooterComponent={streaming ? <PendingTurn partial={partial} status={status} /> : null}
      />

      {error ? (
        <Text variant='caption' style={{ color: red, paddingHorizontal: 20, paddingBottom: 6 }}>
          {error}
        </Text>
      ) : null}

      {/* No tab bar on this screen, so the composer only has to clear the home
          indicator. */}
      <View
        style={[
          styles.composer,
          { borderTopColor: border, backgroundColor: background, paddingBottom: insets.bottom + 10 },
        ]}
      >
        <View style={styles.composerRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder='اسأل عن مبيعاتك…'
            placeholderTextColor={muted}
            multiline
            editable={!streaming}
            // Not the ui `Input`: that one fixes its height to `rows`, and this
            // field has to grow with the line being typed.
            style={[
              styles.input,
              {
                backgroundColor: card,
                borderColor: border,
                color: text,
                maxHeight: INPUT_MAX_HEIGHT,
              },
            ]}
            accessibilityLabel='رسالتك للمساعد'
          />

          {streaming ? (
            <Pressable
              onPress={abort}
              style={[styles.send, { backgroundColor: red }]}
              accessibilityRole='button'
              accessibilityLabel='وقف'
            >
              <Square size={16} color='#FFFFFF' />
            </Pressable>
          ) : (
            <Pressable
              onPress={submit}
              disabled={!draft.trim()}
              style={[styles.send, { backgroundColor: draft.trim() ? primary : secondary }]}
              accessibilityRole='button'
              accessibilityLabel='إرسال'
            >
              <Sparkles size={17} color={draft.trim() ? primaryForeground : muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Zero height until the keyboard is up, then exactly its height, which
          lifts the composer to sit on top of it. */}
      <AvoidKeyboard />

      <AssistantConfigSheet
        isVisible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClearHistory={clear}
      />
    </View>
  );
}

/** The line shown while the assistant works and has not written anything yet. */
function PendingTurn({ partial, status }: { partial: string; status: string | null }) {
  const muted = useColor('mutedForeground');

  if (partial) return <ChatBubble message={{ role: 'assistant', content: partial }} />;

  return (
    <View style={styles.pending}>
      <Spinner size='sm' color={muted} />
      <Text variant='caption' style={{ color: muted }}>
        {status ?? 'بيفكر…'}
      </Text>
    </View>
  );
}

function EmptyState({ loading, onPick }: { loading: boolean; onPick: (question: string) => void }) {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');

  if (loading) {
    return (
      <View style={styles.empty}>
        <Spinner size='sm' color={muted} />
      </View>
    );
  }

  return (
    <View style={styles.empty}>
      <Sparkles size={26} color={primary} />
      <Text variant='subtitle' style={styles.centred}>
        اسألني عن شغلك
      </Text>
      <Text variant='caption' style={[styles.centred, { color: muted }]}>
        مبيعات، أرباح، مخزون، موظفين — ولو محتاج تعديل، هجهزلك كارت تأكيد قبل ما ينفّذ.
      </Text>
      <View style={styles.chips}>
        {EXAMPLES.map((question) => (
          <Chip key={question} label={question} onPress={() => onPick(question)} primary={primary} />
        ))}
      </View>
    </View>
  );
}

function Chip({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: string;
}) {
  const muted = useColor('mutedForeground');
  const border = useColor('border');

  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { borderColor: primary ?? border }]}
      accessibilityRole='button'
      accessibilityLabel={label}
    >
      <Text variant='caption' style={{ color: primary ?? muted, fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  iconButton: { padding: 8 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  composer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
    lineHeight: 20,
    textAlignVertical: 'top',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 8 },
  centred: { textAlign: 'center' },
});
