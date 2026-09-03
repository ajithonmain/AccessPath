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
  /** A11yPrefs.voiceURI, or omitted/null for "let this module pick a sensible default". */
  voiceURI?: string | null;
}

/** 0-100 level -> a 0.5x..2x multiplier centred on 1x at level 50 — mirrors
 *  levelToFactor() in voice-over.ts (kept duplicated: tts.ts stays a standalone
 *  Web Speech wrapper with no dependency on the voice-over module). */
function levelToFactor(level: number): number {
  return 2 ** ((level - 50) / 50);
}

/** Picks a voice to set explicitly on the utterance. On macOS, Chrome frequently
 *  produces NO audio when `utterance.voice` is left unset — it needs a concrete voice
 *  object even to use "the default". So Read Aloud / Voice Over always set one:
 *  the caller's chosen voiceURI if it matches, else the engine default, else the first
 *  voice matching the page/browser language, else just the first available voice. */
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
    // Prefer the page's language over the OS default voice — reading English text with
    // a French default voice sounds broken. Within the language, honour .default.
    sameLang.find((v) => v.default) ??
    sameLang.find((v) => v.lang.toLowerCase() === lang) ??
    sameLang[0] ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

/** Run `fn` once voices are available — immediately if they already are, otherwise
 *  after the first `voiceschanged` (which some engines, notably Chrome, fire async on
 *  first use), with a short timeout fallback so it still runs even if that never fires. */
function whenVoicesReady(fn: () => void): void {
  if (!isSpeechSupported()) return;
  if (window.speechSynthesis.getVoices().length) {
    fn();
    return;
  }
  let done = false;
  const go = (): void => {
    if (done) return;
    done = true;
    window.speechSynthesis.removeEventListener('voiceschanged', go);
    fn();
  };
  window.speechSynthesis.addEventListener('voiceschanged', go);
  window.setTimeout(go, 250);
}

/** Split into chunks no single utterance runs long enough to hit Chrome's ~15s
 *  single-utterance cutoff (past which it silently stops mid-read). */
function chunkText(text: string, max = 220): string[] {
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

/** Speaks `text`, applying the same rate/pitch/voice prefs Voice Over uses so Read Aloud
 *  and Voice Over sound consistent. Long text is sentence-chunked and queued.
 *
 *  `onEnd` fires once the whole thing finishes or errors (not on a deliberate
 *  stopSpeaking()/re-speak). `onFail` fires if the browser refused to speak at all —
 *  no `start` event within a beat AND the engine reports nothing playing, or an
 *  outright synthesis error — so the caller can tell the user (common with Brave, or
 *  a machine with no installed voice).
 *
 *  Cancel discipline: only cancel() when something is actually speaking/pending (calling
 *  it on an idle engine wedges Chrome), and never speak() in the same tick as cancel()
 *  (Chrome silently drops that speak()). */
export function speak(
  text: string,
  settings?: SpeakSettings,
  onEnd?: () => void,
  onFail?: () => void
): void {
  if (!isSpeechSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;

  const startSpeaking = (): void => {
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
        // interrupted/canceled = our own stopSpeaking()/re-speak; the caller knows.
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        if (!started) onFail?.();
        done();
      };
      synth.speak(u);
    };

    synth.resume();
    if (synth.speaking || synth.pending) {
      synth.cancel();
      window.setTimeout(speakChunk, 120);
    } else {
      speakChunk();
    }

    // If nothing has started speaking shortly after we asked, the browser blocked it.
    window.setTimeout(() => {
      if (!started && !finished && !synth.speaking && !synth.pending) {
        onFail?.();
        done();
      }
    }, 1200);
  };

  whenVoicesReady(startSpeaking);
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
