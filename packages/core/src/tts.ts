/** Web Speech API wrapper, isolated so callers degrade gracefully when
 *  speechSynthesis is unavailable (older/headless browsers). */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** True once the engine has at least one voice. When false, no site can produce
 *  speech — the device has no TTS voice installed. */
export function hasVoices(): boolean {
  return isSpeechSupported() && window.speechSynthesis.getVoices().length > 0;
}

export interface SpeakSettings {
  /** A11yPrefs.voiceRateLevel, 0-100 — same 2**((level-50)/50) mapping as voice-over.ts. */
  rateLevel?: number;
  /** A11yPrefs.voicePitchLevel, 0-100, same mapping, clamped to the valid 0-2 pitch range. */
  pitchLevel?: number;
  /** A11yPrefs.voiceURI, or omitted/null for "let the platform pick". */
  voiceURI?: string | null;
}

function levelToFactor(level: number): number {
  return 2 ** ((level - 50) / 50);
}

/** Picks a voice to set explicitly on the utterance — but only if the voice list is
 *  already populated. On macOS, Chrome often produces NO audio with `utterance.voice`
 *  unset, so we set one when we can. On Android, `getVoices()` is frequently empty at
 *  click time; there we leave it unset and let the platform default handle it (setting
 *  a stale/guessed voice is worse than not setting one). Never blocks or defers. */
export function pickVoice(voiceURI?: string | null): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (voiceURI) {
    const exact = voices.find((v) => v.voiceURI === voiceURI);
    if (exact) return exact;
  }
  const lang = ((typeof navigator !== 'undefined' && navigator.language) || 'en-US').toLowerCase();
  const base = lang.slice(0, 2);
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  return (
    sameLang.find((v) => v.default) ??
    sameLang.find((v) => v.lang.toLowerCase() === lang) ??
    sameLang[0] ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

/** Split into chunks so no single utterance runs long enough to hit Chrome's ~15s
 *  single-utterance cutoff (past which it silently stops mid-read). */
function chunkText(text: string, max = 200): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let buf = '';
  for (const piece of text.split(/(?<=[.!?。！？])\s+/)) {
    if (buf && (buf + ' ' + piece).length > max) {
      parts.push(buf);
      buf = piece;
    } else {
      buf = buf ? buf + ' ' + piece : piece;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

/** Speaks `text`. Long text is sentence-chunked and queued.
 *
 *  MUST be called directly inside a user-gesture handler (a click) — Android Chrome
 *  in particular blocks `speechSynthesis.speak()` that isn't synchronous with a live
 *  user activation, which is why this never defers the first `speak()` behind a
 *  timeout or `voiceschanged` listener.
 *
 *  `onEnd` fires when the whole thing finishes or errors (not on a deliberate
 *  stopSpeaking()/re-speak). `onFail` fires if the browser refused to speak at all —
 *  nothing started within ~1.2s and the engine reports nothing playing, or an outright
 *  synthesis error before any audio — so the caller can tell the user (common with
 *  Brave, or a device with no installed voice). */
export function speak(
  text: string,
  settings?: SpeakSettings,
  onEnd?: () => void,
  onFail?: () => void
): void {
  if (!isSpeechSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  // Some engines need a nudge before getVoices() populates; harmless if already loaded.
  synth.getVoices();

  const voice = pickVoice(settings?.voiceURI);
  const chunks = chunkText(text.replace(/\s+/g, ' ').trim());
  let i = 0;
  let started = false;
  let finished = false;

  const done = (): void => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };

  const speakChunk = (): void => {
    if (i >= chunks.length) {
      done();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i++]);
    if (voice) u.voice = voice;
    if (settings?.rateLevel != null) u.rate = levelToFactor(settings.rateLevel);
    if (settings?.pitchLevel != null) u.pitch = Math.max(0, Math.min(2, levelToFactor(settings.pitchLevel)));
    u.onstart = () => { started = true; };
    u.onend = speakChunk;
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (!started) onFail?.();
      done();
    };
    synth.speak(u);
  };

  // Speak synchronously in the caller's gesture. Only interrupt if something is
  // genuinely mid-utterance (calling cancel() on an idle engine wedges desktop Chrome).
  synth.resume();
  if (synth.speaking || synth.pending) synth.cancel();
  speakChunk();

  // Nothing started shortly after we asked -> the browser blocked it.
  window.setTimeout(() => {
    if (!started && !finished && !synth.speaking && !synth.pending) {
      onFail?.();
      done();
    }
  }, 1200);
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
