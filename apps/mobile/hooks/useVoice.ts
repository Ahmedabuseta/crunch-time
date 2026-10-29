// Push-to-talk and read-aloud, in one place.
//
// The screen only needs three things from it: is it recording, is it speaking,
// and what went wrong. Everything native — permission, audio mode, the file
// read, the player — stays here so a device-specific fix is one file.
import { api } from '@/api/endpoints';
import { readRecording, speechUrl } from '@/lib/voice';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

/** A spoken question should be a sentence, not a recording session. */
export const MAX_RECORDING_MS = 60_000;

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'حصل خطأ في الصوت';
}

export function useVoice(onTranscript: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(null);
  const playerState = useAudioPlayerStatus(player);

  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recording = recorderState.isRecording;
  const seconds = Math.floor((recorderState.durationMillis ?? 0) / 1000);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('التطبيق محتاج إذن الميكروفون');
        return;
      }
      // Recording and playback want different routes on Android; set it per use
      // rather than once at boot.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      setError(messageOf(err));
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (!recorderState.isRecording) return;
    try {
      await recorder.stop();
      // Playing back through the speaker needs the mode switched back, or the
      // answer comes out of the earpiece at call volume.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      const uri = recorder.uri;
      if (!uri) return;

      setTranscribing(true);
      const { audio, mime } = await readRecording(uri);
      const result = await api.assistant.transcribe({ audio, mime });
      if (result.ok && result.text) onTranscript(result.text);
      else setError(result.error ?? 'مسمعتش حاجة — جرّب تاني');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setTranscribing(false);
    }
  }, [onTranscript, recorder, recorderState.isRecording]);

  // Stop at the cap rather than letting a forgotten recording run on.
  useEffect(() => {
    if (!recording) return;
    if ((recorderState.durationMillis ?? 0) < MAX_RECORDING_MS) return;
    void stop();
  }, [recording, recorderState.durationMillis, stop]);

  const play = useCallback(
    (text: string) => {
      setError(null);
      try {
        player.replace({ uri: speechUrl(text) });
        player.play();
      } catch (err) {
        setError(messageOf(err));
      }
    },
    [player]
  );

  const stopPlayback = useCallback(() => {
    try {
      player.pause();
      void player.seekTo(0);
    } catch {
      // already stopped
    }
  }, [player]);

  return {
    recording,
    seconds,
    transcribing,
    playing: Boolean(playerState?.playing),
    error,
    start,
    stop,
    play,
    stopPlayback,
    clearError: () => setError(null),
  };
}
