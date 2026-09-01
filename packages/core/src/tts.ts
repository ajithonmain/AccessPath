/** Web Speech API wrapper, isolated so callers degrade gracefully when
 *  speechSynthesis is unavailable (older/headless browsers). */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export interface SpeakSettings {
  /** A11yPrefs.voiceRateLevel, 0-100 — same 2**((level-50)/50) mapping as voice-over.ts. */
  rateLevel?: number;
  /** A11yPrefs.voicePitchLevel, 0-100, same mapping, clamped to the valid 0-2 pitch range. */
  pitchLevel?: number;
  /** A11yPrefs.voiceURI, or omitted/null for the browser default. */
  voiceURI?: string | null;
}

/** 0-100 level -> a 0.5x..2x multiplier centred on 1x at level 50 — mirrors
 *  levelToFactor() in voice-over.ts (kept duplicated: tts.ts stays a standalone
 *  Web Speech wrapper with no dependency on the voice-over module). */
function levelToFactor(level: number): number {
  return 2 ** ((level - 50) / 50);
}

/** Speaks `text`, applying the same rate/pitch/voice prefs Voice Over uses so Read Aloud
 *  and Voice Over sound consistent. Calls `onEnd` once speech finishes or errors (but not
 *  when it was cancelled by another speak()/stopSpeaking() call) — callers use this to
 *  keep a "Stop"/"Read Aloud" toggle button in sync with actual playback state instead of
 *  just the click that started it.
 *
 *  Follows the same cancel-discipline as voice-over.ts's speakNow(): only calls cancel()
 *  when something is actually speaking/pending (calling it on an idle engine wedges
 *  Chrome), and never calls speak() in the same tick as a cancel() (Chrome silently drops
 *  that speak()) — the real speak() is deferred a tick when an interrupt was needed. */
export function speak(text: string, settings?: SpeakSettings, onEnd?: () => void): void {
  if (!isSpeechSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;

  const u = new SpeechSynthesisUtterance(text);
  if (settings?.rateLevel != null) u.rate = levelToFactor(settings.rateLevel);
  if (settings?.pitchLevel != null) {
    u.pitch = Math.max(0, Math.min(2, levelToFactor(settings.pitchLevel)));
  }
  if (settings?.voiceURI) {
    const match = synth.getVoices().find((v) => v.voiceURI === settings.voiceURI);
    if (match) u.voice = match;
  }

  const finish = (): void => {
    onEnd?.();
  };
  u.onend = finish;
  u.onerror = (e) => {
    // 'interrupted'/'canceled' are our own cancel()s (or a caller's stopSpeaking()) —
    // ignore, the caller already knows it stopped speech itself.
    if (e.error !== 'interrupted' && e.error !== 'canceled') finish();
  };

  synth.resume();
  if (synth.speaking || synth.pending) {
    synth.cancel();
    window.setTimeout(() => synth.speak(u), 120);
  } else {
    synth.speak(u);
  }
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
