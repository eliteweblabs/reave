/**
 * Soft completion chimes for the admin agent (chat turn done, deploy live).
 * Web Audio — no asset files. Resume the context on a user gesture so browsers allow playback.
 */

const DEPLOY_TONE_AT_KEY = 'reave:deploy-tone-at';
const DEPLOY_TONE_DEBOUNCE_MS = 8_000;

type Note = { freq: number; start: number; dur: number };

let ctx: AudioContext | null = null;
let gestureBound = false;

function audioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null;
}

function audioContext(): AudioContext | null {
  const AC = audioCtor();
  if (!AC) return null;
  if (!ctx || ctx.state === 'closed') ctx = new AC();
  return ctx;
}

/** Unlock AudioContext after the first pointer/key — required for later background-tab chimes. */
export function armAgentTones(): void {
  if (typeof window === 'undefined' || gestureBound) return;
  gestureBound = true;
  const resume = () => {
    void resumeAgentTones();
  };
  window.addEventListener('pointerdown', resume, { passive: true });
  window.addEventListener('keydown', resume);
}

export function resumeAgentTones(): void {
  const c = audioContext();
  if (c?.state === 'suspended') void c.resume().catch(() => undefined);
}

function playNotes(notes: Note[], peak = 0.07): void {
  const c = audioContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  const now = c.currentTime;
  const master = c.createGain();
  master.gain.value = 1;
  master.connect(c.destination);

  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    const t0 = now + n.start;
    const t1 = t0 + n.dur;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}

/** Two-note chime when an agent turn finishes (not on user cancel). */
export function playChatDoneTone(): void {
  playNotes([
    { freq: 523.25, start: 0, dur: 0.14 },
    { freq: 659.25, start: 0.11, dur: 0.22 },
  ]);
}

/**
 * Rising triad when a Railway deploy goes live.
 * Debounced across the header bulb and the chat lock so both can call it.
 */
export function playDeployDoneTone(): void {
  const now = Date.now();
  try {
    const prev = Number(sessionStorage.getItem(DEPLOY_TONE_AT_KEY) || 0);
    if (now - prev < DEPLOY_TONE_DEBOUNCE_MS) return;
    sessionStorage.setItem(DEPLOY_TONE_AT_KEY, String(now));
  } catch {
    /* private mode — still play */
  }
  playNotes(
    [
      { freq: 523.25, start: 0, dur: 0.12 },
      { freq: 659.25, start: 0.1, dur: 0.12 },
      { freq: 783.99, start: 0.2, dur: 0.28 },
    ],
    0.075,
  );
}
