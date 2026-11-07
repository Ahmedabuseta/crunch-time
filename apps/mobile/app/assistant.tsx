import type { ActionChatCard, ChatMessage } from '@/api/types';
import { AskRail } from '@/components/app/AskRail';
import { AssistantComposer } from '@/components/app/AssistantComposer';
import { AssistantConfigSheet } from '@/components/app/AssistantConfigSheet';
import { ChatBubble } from '@/components/app/ChatBubble';
import { ChatCardView } from '@/components/app/ChatCardView';
import { ThinkingPanel } from '@/components/app/ThinkingPanel';
import { AvoidKeyboard } from '@/components/ui/avoid-keyboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useAssistantChat } from '@/hooks/useAssistantChat';
import { useColor } from '@/hooks/useColor';
import { useHaptics } from '@/hooks/useHaptics';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useVoice } from '@/hooks/useVoice';
import { withOpacity } from '@/theme/colors';
import {
  AlertTriangle,
  ChevronLeft,
  PackageSearch,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  Trash2,
  TrendingUp,
  Trophy,
  Volume2,
  Wallet,
  X,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet } from 'react-native';
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

/**
 * The empty screen's four starting points. Each one is a real question, not a
 * feature label: tapping it sends the question, so the first tap always shows
 * an answer instead of a menu.
 */
const QUICK_STARTS = [
  { label: 'مبيعات النهاردة', question: 'بعت بكام النهاردة؟', icon: TrendingUp },
  { label: 'المخزون الناقص', question: 'إيه اللي ناقص في المخزون؟', icon: PackageSearch },
  { label: 'أعلى صنف', question: 'أفضل صنف عندي إيه؟', icon: Trophy },
  { label: 'أرباح الشهر', question: 'أرباح الشهر إيه؟', icon: Wallet },
] as const;

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
    thinking,
    thinkingOpen,
    toggleThinking,
    status,
    error,
    loadingHistory,
    send,
    retry,
    abort,
    dismissError,
    confirm,
    cancel,
    clear,
  } = useAssistantChat();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [playingText, setPlayingText] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Speaking a question sends it: the owner pressed the mic to ask, not to fill
  // in a form. A misheard sentence is visible in their own bubble straight away.
  const voice = useVoice(useCallback((text: string) => void send(text), [send]));

  // Destructured so these two stay stable across renders. `voice` is a fresh
  // object every render, so a callback keyed on it would be re-created each
  // time — which re-creates `renderItem`, and the FlatList then re-renders every
  // row on every streaming flush instead of just the line that changed.
  const { play: playSpeech, stopPlayback: stopSpeech } = voice;

  const playReply = useCallback(
    (text: string) => {
      setPlayingText(text);
      playSpeech(text);
    },
    [playSpeech]
  );

  const stopPlayback = useCallback(() => {
    setPlayingText(null);
    stopSpeech();
  }, [stopSpeech]);

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
  const muted = useColor('mutedForeground');
  const background = useColor('background');

  const submit = useCallback(() => {
    const value = draft.trim();
    if (!value || streaming) return;
    // The composer fires the press haptic itself, so a second one here would
    // buzz twice for one tap.
    setDraft('');
    void send(value);
  }, [draft, send, streaming]);

  /** A suggestion or a follow-up is a real question: tapping it sends it. */
  const ask = useCallback(
    (question: string) => {
      if (streaming) return;
      feedback('selection');
      void send(question);
    },
    [feedback, send, streaming]
  );

  const retryLast = useCallback(() => {
    if (streaming) return;
    feedback('selection');
    void retry();
  }, [feedback, retry, streaming]);

  const confirmClear = useCallback(() => {
    Alert.alert('مسح المحادثة', 'كل الرسائل هتتمسح من الخادم كمان. متأكد؟', [
      { text: 'رجوع', style: 'cancel' },
      { text: 'امسح', style: 'destructive', onPress: () => void clear() },
    ]);
  }, [clear]);

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <MessageRow
        item={item}
        isLast={index === messages.length - 1}
        onConfirm={confirm}
        onCancel={cancel}
        onAsk={ask}
        onRetry={retryLast}
        onPlay={playReply}
        onStopPlayback={stopPlayback}
        speaking={voice.playing && playingText === item.content}
      />
    ),
    [
      ask,
      cancel,
      confirm,
      messages.length,
      playReply,
      playingText,
      retryLast,
      stopPlayback,
      voice.playing,
    ]
  );

  const canRetry = !streaming && messages.some((message) => message.role === 'user');

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
            {/* The subtitle doubles as the live status line, so the answer's
                progress is readable even after the transcript has scrolled. */}
            <View style={styles.subtitleRow}>
              {streaming ? <View style={[styles.liveDot, { backgroundColor: primary }]} /> : null}
              <Text
                variant='caption'
                numberOfLines={1}
                style={{ color: streaming ? primary : muted, flexShrink: 1 }}
              >
                {streaming ? status ?? 'بيفكر…' : 'مساعدك في المحل — اسأل وأنا أجاوب'}
              </Text>
            </View>
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
        keyboardDismissMode='interactive'
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
          messages.length === 0 && !streaming ? (
            <EmptyState loading={loadingHistory} onAsk={ask} disabled={streaming} />
          ) : null
        }
        ListFooterComponent={
          streaming ? (
            <PendingTurn
              partial={partial}
              status={status}
              thinking={thinking}
              thinkingOpen={thinkingOpen}
              onToggleThinking={toggleThinking}
            />
          ) : null
        }
      />

      {error ? (
        <ErrorBar
          message={error}
          onRetry={canRetry ? retryLast : undefined}
          onDismiss={dismissError}
        />
      ) : null}

      {/* Always on screen, even mid-conversation: the owner should never have to
          think of a question from a blank slate. Hidden while typing, because
          then the keyboard needs the height more than the suggestions do. */}
      {!isKeyboardVisible ? (
        <View style={styles.rail}>
          <AskRail
            items={SUGGESTIONS}
            onAsk={ask}
            disabled={streaming}
            label='اقتراحات سريعة'
            edgePadding={16}
          />
        </View>
      ) : null}

      {/* The home-indicator inset only applies while the keyboard is down — once
          it is up, the keyboard covers that strip, so adding the inset again
          would float the composer above the keys. */}
      <AssistantComposer
        value={draft}
        onChangeText={setDraft}
        onSubmit={submit}
        onStop={abort}
        streaming={streaming}
        bottomInset={isKeyboardVisible ? 0 : insets.bottom}
        voice={{
          recording: voice.recording,
          transcribing: voice.transcribing,
          seconds: voice.seconds,
          error: voice.error,
          onStart: () => void voice.start(),
          onStop: () => void voice.stop(),
          onClearError: voice.clearError,
        }}
      />

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
 * One transcript line with its cards, its controls and its follow-ups.
 *
 * Memoised because the screen re-renders whenever the streaming partial
 * changes: without this, every flush re-lays-out the whole visible transcript.
 */
const MessageRow = React.memo(function MessageRow({
  item,
  isLast,
  onConfirm,
  onCancel,
  onAsk,
  onRetry,
  onPlay,
  onStopPlayback,
  speaking,
}: {
  item: ChatMessage;
  /** Only the newest answer carries retry and its follow-up questions. */
  isLast: boolean;
  onConfirm: (card: ActionChatCard) => Promise<void>;
  onCancel: (card: ActionChatCard) => Promise<void>;
  onAsk: (question: string) => void;
  onRetry: () => void;
  onPlay: (text: string) => void;
  onStopPlayback: () => void;
  /** True when this row's answer is the one currently being read aloud. */
  speaking: boolean;
}) {
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');

  const isAssistant = item.role === 'assistant';
  const canSpeak = isAssistant && Boolean(item.content.trim());
  const showActions = canSpeak || (isLast && isAssistant);
  const followups = isLast && isAssistant ? item.followups ?? [] : [];

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

      {showActions ? (
        <View style={styles.actions}>
          {canSpeak ? (
            <Pressable
              // Sits under the assistant's bubble, which is where the answer
              // ends: the control belongs to the answer, not to the screen.
              onPress={() => (speaking ? onStopPlayback() : onPlay(item.content))}
              hitSlop={8}
              style={styles.actionButton}
              accessibilityRole='button'
              accessibilityLabel={speaking ? 'وقف القراءة' : 'اسمع الرد'}
            >
              {speaking ? (
                <Square size={13} color={primary} />
              ) : (
                <Volume2 size={15} color={muted} />
              )}
            </Pressable>
          ) : null}

          {isLast && isAssistant ? (
            <Pressable
              onPress={onRetry}
              hitSlop={8}
              style={styles.actionButton}
              accessibilityRole='button'
              accessibilityLabel='جرّب الإجابة تاني'
            >
              <RefreshCw size={14} color={muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* The server already sends 2–3 follow-ups with every answer. They were
          stored and never drawn; under the newest answer they are one tap from
          the next question. */}
      {followups.length > 0 ? (
        <AskRail items={followups} onAsk={onAsk} edgePadding={0} />
      ) : null}
    </View>
  );
});

/**
 * The line shown while the assistant works.
 *
 * Order matters: the reasoning comes first, the answer bubble second. Once text
 * exists the panel folds itself away, so the two are rarely on screen together —
 * and when they are, the answer is the thing being read.
 */
const PendingTurn = React.memo(function PendingTurn({
  partial,
  status,
  thinking,
  thinkingOpen,
  onToggleThinking,
}: {
  partial: string;
  status: string | null;
  thinking: string;
  thinkingOpen: boolean;
  onToggleThinking: () => void;
}) {
  const muted = useColor('mutedForeground');

  return (
    <View style={{ gap: 8 }}>
      <ThinkingPanel
        text={thinking}
        open={thinkingOpen}
        onToggle={onToggleThinking}
        active={!partial}
      />

      {partial ? (
        <ChatBubble message={{ role: 'assistant', content: partial }} />
      ) : (
        <View style={styles.pending} accessibilityLiveRegion='polite'>
          <Spinner size='sm' variant='dots' color={muted} />
          <Text variant='caption' style={{ color: muted }}>
            {status ?? 'بيفكر…'}
          </Text>
        </View>
      )}
    </View>
  );
});

/**
 * A refused or failed turn. Dismissible, and retryable when there is a question
 * to retry — a dead-end red line is worse than no line at all.
 */
function ErrorBar({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  const red = useColor('red');
  const muted = useColor('mutedForeground');

  return (
    <View
      style={[
        styles.errorBar,
        { backgroundColor: withOpacity(red, 0.1), borderColor: withOpacity(red, 0.3) },
      ]}
      accessibilityLiveRegion='polite'
    >
      <AlertTriangle size={16} color={red} />
      <Text variant='caption' style={[styles.errorText, { color: red }]} numberOfLines={3}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          hitSlop={8}
          style={styles.errorAction}
          accessibilityRole='button'
          accessibilityLabel='جرّب تاني'
        >
          <RefreshCw size={16} color={red} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        style={styles.errorAction}
        accessibilityRole='button'
        accessibilityLabel='قفل التنبيه'
      >
        <X size={16} color={muted} />
      </Pressable>
    </View>
  );
}

function EmptyState({
  loading,
  onAsk,
  disabled,
}: {
  loading: boolean;
  onAsk: (question: string) => void;
  disabled: boolean;
}) {
  const primary = useColor('primary');
  const foreground = useColor('foreground');
  const muted = useColor('mutedForeground');

  // History is still coming: draw the shape of a conversation instead of a
  // lone spinner, so the screen never looks empty while it loads.
  if (loading) {
    return (
      <View style={styles.empty}>
        <Skeleton width='74%' height={54} variant='rounded' style={{ alignSelf: 'flex-end' }} />
        <Skeleton width='52%' height={38} variant='rounded' style={{ alignSelf: 'flex-start' }} />
        <Skeleton width='86%' height={92} variant='rounded' style={{ alignSelf: 'flex-end' }} />
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

      <View style={styles.quickGrid}>
        {QUICK_STARTS.map(({ label, question, icon: Icon }) => (
          <Pressable
            key={label}
            onPress={() => onAsk(question)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.quickTile,
              {
                borderColor: withOpacity(primary, 0.22),
                backgroundColor: withOpacity(primary, pressed ? 0.16 : 0.08),
                opacity: disabled ? 0.5 : 1,
              },
            ]}
            accessibilityRole='button'
            accessibilityLabel={question}
          >
            <Icon size={16} color={primary} />
            <Text variant='caption' style={{ color: foreground, fontSize: 13 }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
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
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 14 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  /** The compact control strip under one answer: listen, and retry on the last. */
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  actionButton: { padding: 6, borderRadius: 999 },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  errorText: { flex: 1, textAlign: 'right', writingDirection: 'rtl' },
  errorAction: { padding: 4 },
  rail: { paddingTop: 10 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 48, paddingHorizontal: 12, width: '100%' },
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
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    width: '100%',
  },
  quickTile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
