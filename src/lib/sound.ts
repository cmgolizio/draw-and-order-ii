"use client";

/**
 * Optional sound (Phase 7): pencil scratch while drawing, stamp thud on the
 * score reveal. Muted by default; the preference lives in localStorage.
 * Everything is synthesized with WebAudio — no audio assets to load.
 *
 * The AudioContext is created lazily inside user gestures (browser autoplay
 * policy); every play call is a no-op while sound is off.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dao:sound";

let listeners: Array<() => void> = [];

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Preference simply won't persist.
  }
  if (enabled) ensureContext()?.resume().catch(() => {});
  listeners.forEach((fn) => fn());
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners = listeners.filter((fn) => fn !== listener);
    window.removeEventListener("storage", listener);
  };
}

/** Reactive sound preference; false during SSR. */
export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, readEnabled, () => false);
}

export function soundEnabled(): boolean {
  return typeof window !== "undefined" && readEnabled();
}

let audioContext: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

let noiseBuffer: AudioBuffer | null = null;

function ensureNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Rubber stamp hitting the desk: a low pitch-dropping knock + noise slap. */
export function playStampThud(): void {
  if (!soundEnabled()) return;
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);

  const slap = ctx.createBufferSource();
  slap.buffer = ensureNoise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const slapGain = ctx.createGain();
  slapGain.gain.setValueAtTime(0.25, now);
  slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  slap.connect(filter).connect(slapGain).connect(ctx.destination);
  slap.start(now);
  slap.stop(now + 0.1);
}

export type ScratchHandle = {
  /** Feed pointer speed (logical px/ms); modulates the scratch loudness. */
  move(speed: number): void;
  stop(): void;
};

/**
 * Graphite on paper: looped noise through a bandpass, gain driven by stroke
 * speed. Returns null when sound is off (callers can skip bookkeeping).
 */
export function startPencilScratch(): ScratchHandle | null {
  if (!soundEnabled()) return null;
  const ctx = ensureContext();
  if (!ctx) return null;

  const source = ctx.createBufferSource();
  source.buffer = ensureNoise(ctx);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();

  let stopped = false;
  return {
    move(speed: number) {
      if (stopped) return;
      // ~0 when hovering in place, saturating around brisk stroke speed.
      const target = Math.min(0.12, Math.max(0, speed * 0.045));
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      source.stop(ctx.currentTime + 0.1);
    },
  };
}