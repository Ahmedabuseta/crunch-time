import type { ActionChatCard, ChatMessage } from '@/api/types';
import { AskRail } from '@/components/app/AskRail';
import { AssistantConfigSheet } from '@/components/app/AssistantConfigSheet';
import { ChatBubble } from '@/components/app/ChatBubble';
import { ChatCardView } from '@/components/app/ChatCardView';
import { AvoidKeyboard } from '@/components/ui/avoid-keyboard';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useAssistantChat } from '@/hooks/useAssistantChat';
import { useColor } from '@/hooks/useColor';
import { useHaptics } from '@/hooks/useHaptics';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { withOpacity } from '@/theme/colors';
import { ArrowUp, ChevronLeft, Settings, Sparkles, Square, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The questions an owner actually asks. The rail scrolls sideways, so this list
 * can grow without making the composer taller.
 */
const SUGGESTIONS = [
  'بعت بكام النهاردة؟',
  'إيه اللي ناقص في المخزون؟',
  'أفضل صنف عندي إيه؟',
  'أرباح الشهر إيه؟',
  'مين أحسن موظف؟',
  'كام طلب دليفري عندي؟',
];

/** Four lines of 22pt plus the field's own padding; past that it scrolls. */
const INPUT_MAX_HEIGHT = 4 * 22 + 18;

/**
 * The assistant lives outside the `(app)` tab navigator on purpose: this is a
 * focused conversation, so the floating tab bar and the quick-action dial both
 * disappear while it is open. It is a root route, reached from the icon on the
 * board and from المزيد.
 */
export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const feedback = useHaptics();
  const { isKeyboardVisible } = useKeyboardHeight();
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

  // A chat auto-scrolls, but not on every content change: while text streams the
  // content size changes many times a second, and an animation per change fights
  // the previous one — expensive on an old device and jarring to read.
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;

  const scheduleScroll = useCallback(() => {
    if (scrollTimer.current) return;
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = null;
      // Jump while text is arriving; animate only when a finished line lands.
      listRef.current?.scrollToEnd({ animated: !streamingRef.current });
    }, 120);
  }, []);

  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    []
  );

  const closeSheet = useCallback(() => setSheetOpen(false), []);

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
    feedback('selection');
    setDraft('');
    void send(value);
  }, [draft, feedback, send, streaming]);

  /** A suggestion or a follow-up is a real question: tapping it sends it. */
  const ask = useCallback(
    (question: string) => {
      if (streaming) return;
      feedback('selection');
      void send(question);
    },
    [feedback, send, streaming]
  );

  const confirmClear = useCallback(() => {
    Alert.alert('مسح المحادثة', 'كل الرسائل هتتمسح من الخادم كمان. متأكد؟', [
      { text: 'رجوع', style: 'cancel' },
      { text: 'امسح', style: 'destructive', onPress: () => void clear() },
    ]);
  }, [clear]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageRow item={item} onAsk={ask} onConfirm={confirm} onCancel={cancel} />
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

        {/* The bot has a name, not a tab title: it is the product's identity. */}
        <View style={styles.identity}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: withOpacity(primary, 0.14), borderColor: withOpacity(primary, 0.3) },
            ]}
          >
            <Sparkles size={17} color={primary} />
          </View>
          <View style={styles.identityText}>
            <Text variant='subtitle' numberOfLines={1}>
              كرنش تايم
            </Text>
            <Text variant='caption' numberOfLines={1} style={{ color: muted }}>
              مساعدك في المحل — اسأل وأنا أجاوب
            </Text>
          </View>
        </View>

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
        // A chat reads from its newest line, but re-scrolling on every content
        // change is what stutters during streaming — this coalesces it.
        onContentSizeChange={scheduleScroll}
        // Sized for an old handset: keep the mounted window small and mount
        // rows in small batches rather than all at once on first paint.
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={9}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          messages.length === 0 && !streaming ? <EmptyState loading={loadingHistory} /> : null
        }
        ListFooterComponent={streaming ? <PendingTurn partial={partial} status={status} /> : null}
      />

      {error ? (
        <Text variant='caption' style={{ color: red, paddingHorizontal: 20, paddingBottom: 6 }}>
          {error}
        </Text>
      ) : null}

      {/* Always on screen, even mid-conversation: the owner should never have to
          think of a question from a blank slate. Tapping one sends it. */}
      <View style={styles.rail}>
        <AskRail
          items={SUGGESTIONS}
          onAsk={ask}
          disabled={streaming}
          label='اقتراحات سريعة'
          edgePadding={16}
        />
      </View>

      {/* The home-indicator inset only applies while the keyboard is down — once
          it is up, the keyboard covers that strip, so adding the inset again
          would float the composer above the keys. */}
      <View
        style={[
          styles.composer,
          { paddingBottom: (isKeyboardVisible ? 0 : insets.bottom) + 10 },
        ]}
      >
        <View style={[styles.field, { backgroundColor: card, borderColor: border }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder='اكتب سؤالك لكرنش تايم…'
            placeholderTextColor={muted}
            multiline
            editable={!streaming}
            // Not the ui `Input`: that one fixes its height to `rows`, and this
            // field has to grow with the line being typed.
            style={[
              styles.input,
              {
                color: text,
                maxHeight: INPUT_MAX_HEIGHT,
              },
            ]}
            accessibilityLabel='رسالتك لكرنش تايم'
          />
        </View>

        {streaming ? (
          <Pressable
            onPress={abort}
            style={[styles.send, { backgroundColor: red }]}
            accessibilityRole='button'
            accessibilityLabel='وقف'
          >
            <Square size={15} color='#FFFFFF' />
          </Pressable>
        ) : (
          <Pressable
            onPress={submit}
            disabled={!draft.trim()}
            style={({ pressed }) => [
              styles.send,
              {
                backgroundColor: draft.trim() ? primary : secondary,
                opacity: pressed && draft.trim() ? 0.85 : 1,
              },
            ]}
            accessibilityRole='button'
            accessibilityLabel='إرسال'
          >
            <ArrowUp size={20} color={draft.trim() ? primaryForeground : muted} />
          </Pressable>
        )}
      </View>

      {/* Zero height until the keyboard is up, then exactly its height, which
          lifts the composer to sit on top of it. */}
      <AvoidKeyboard />

      <AssistantConfigSheet
        isVisible={sheetOpen}
        onClose={closeSheet}
        onClearHistory={clear}
      />
    </View>
  );
}

/**
 * One transcript line with its cards and follow-ups.
 *
 * Memoised because the screen re-renders whenever the streaming partial
 * changes: without this, every flush re-lays-out the whole visible transcript.
 */
const MessageRow = React.memo(function MessageRow({
  item,
  onAsk,
  onConfirm,
  onCancel,
}: {
  item: ChatMessage;
  onAsk: (question: string) => void;
  onConfirm: (card: ActionChatCard) => Promise<void>;
  onCancel: (card: ActionChatCard) => Promise<void>;
}) {
  return (
    <View style={{ gap: 8 }}>
      <ChatBubble message={item} />
      {item.cards?.map((messageCard, index) => (
        <ChatCardView
          key={`card-${index}`}
          card={messageCard}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ))}
      {/* The model's follow-ups are one tap from being asked. */}
      {item.followups?.length ? <AskRail items={item.followups} onAsk={onAsk} /> : null}
    </View>
  );
});

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

function EmptyState({ loading }: { loading: boolean }) {
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
      <View
        style={[
          styles.heroAvatar,
          { backgroundColor: withOpacity(primary, 0.12), borderColor: withOpacity(primary, 0.26) },
        ]}
      >
        <Sparkles size={28} color={primary} />
      </View>
      <Text variant='subtitle' style={styles.centred}>
        أهلاً، أنا كرنش تايم
      </Text>
      <Text variant='caption' style={[styles.centred, { color: muted }]}>
        مساعدك في المحل. مبيعات، أرباح، مخزون، موظفين — ولو محتاج تعديل، هجهزلك كارت
        تأكيد قبل ما ينفّذ.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  iconButton: { padding: 8 },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 1 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 14 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rail: { paddingTop: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  field: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 48,
  },
  input: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', gap: 10, paddingTop: 56, paddingHorizontal: 12 },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  centred: { textAlign: 'center' },
});
