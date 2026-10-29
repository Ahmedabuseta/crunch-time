// The two pieces of the phone side that are not React: where the spoken answer
// lives, and how a recording becomes something the server can accept.
//
// Playback deliberately never downloads the audio. The server serves speech on
// GET with the bearer token in the query string, which is exactly what a media
// player can fetch — so the player streams it instead of the JS thread holding
// a blob in memory on a low-end handset.
import * as FileSystem from 'expo-file-system/legacy'
import { getApiBaseUrl, getToken } from '@/api/client'

/**
 * A player can only issue a GET and cannot carry headers from a plain source
 * in every case, so the token rides in the query string. The server's auth hook
 * already accepts `?token=` for the live-events socket.
 */
export function speechUrl(text: string): string {
  const base = getApiBaseUrl()
  const token = getToken() ?? ''
  const query = `text=${encodeURIComponent(text)}&token=${encodeURIComponent(token)}`
  return `${base}/assistant/speech?${query}`
}

export interface Recording {
  /** Base64, as the transcript endpoint expects. */
  audio: string
  mime: string
}

/** Reads the recorder's file into the shape the server takes. */
export async function readRecording(uri: string): Promise<Recording> {
  const audio = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  // The recorder writes m4a on both platforms; wav only if the preset changes.
  const mime = uri.endsWith('.wav') ? 'audio/wav' : 'audio/mp4'
  return { audio, mime }
}
