// The 10-band equaliser, built on Web Audio.
//
// For each deck: element → pre-amp → ten peaking filters → (limiter) → speakers.
//
// Two constraints shape this:
// - createMediaElementSource can only be called once per element and can't be
//   undone, so the graph is built the first time the equaliser is switched on
//   and kept. "Off" sets every stage to unity.
// - Boosting bands can push peaks past full scale, which clips audibly. A fast
//   limiter catches that while the equaliser is on, and is taken out of the
//   path entirely when it's off: a compressor at 0 dB still pulls loud masters
//   down on every peak, which sounds like the music breathing.

import { EQ_BAND_COUNT, EQ_FREQUENCIES } from "@/lib/settingsSchema";

export interface EqualizerState {
  enabled: boolean;
  preampDb: number;
  gains: number[]; // one per band, dB
}

// Bandwidth of each peaking filter: wide enough that neighbouring bands blend.
const BAND_Q = 1.1;
// Each dB of the biggest boost is offset by this much overall cut, leaving
// the limiter only transients to catch.
const HEADROOM_PER_DB = 0.7;

interface Chain {
  input: GainNode; // the pre-amp
  bands: BiquadFilterNode[];
  limiter: DynamicsCompressorNode;
  limited: boolean;
}

const dbToGain = (db: number) => 10 ** (db / 20);
const sane = (db: number) => (Number.isFinite(db) ? Math.max(-12, Math.min(12, db)) : 0);

type AudioContextCtor = typeof AudioContext;

function audioContextClass(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  );
}

export function equalizerSupported(): boolean {
  return audioContextClass() !== undefined;
}

export class Equalizer {
  private ctx: AudioContext | null = null;
  private chains: Chain[] = [];
  private state: EqualizerState = { enabled: false, preampDb: 0, gains: [] };

  get built(): boolean {
    return this.ctx !== null;
  }

  // Create the context and wire each element through a chain. Returns false
  // when Web Audio isn't available.
  build(elements: HTMLMediaElement[]): boolean {
    if (this.ctx) return true;
    const Ctx = audioContextClass();
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
    } catch (err) {
      console.warn("Equalizer: no AudioContext", err);
      return false;
    }
    for (const el of elements) {
      try {
        this.chains.push(this.chainFor(el));
      } catch (err) {
        console.warn("Equalizer: could not attach to an audio element", err);
      }
    }
    this.apply();
    return true;
  }

  private chainFor(el: HTMLMediaElement): Chain {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const bands = EQ_FREQUENCIES.map((frequency) => {
      const band = ctx.createBiquadFilter();
      band.type = "peaking";
      band.frequency.value = frequency;
      band.Q.value = BAND_Q;
      return band;
    });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    ctx.createMediaElementSource(el).connect(input);
    let tail: AudioNode = input;
    for (const band of bands) tail = tail.connect(band);
    tail.connect(ctx.destination);
    return { input, bands, limiter, limited: false };
  }

  set(next: EqualizerState): void {
    this.state = {
      enabled: next.enabled,
      preampDb: sane(next.preampDb),
      gains: Array.from({ length: EQ_BAND_COUNT }, (_, i) => sane(next.gains[i] ?? 0)),
    };
    this.apply();
  }

  // Browsers start a context suspended until the user interacts.
  wake(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  private apply(): void {
    const on = this.state.enabled && this.built;
    const biggestBoost = on ? Math.max(0, this.state.preampDb, ...this.state.gains) : 0;
    const inputGain = on ? dbToGain(this.state.preampDb - biggestBoost * HEADROOM_PER_DB) : 1;
    for (const chain of this.chains) {
      chain.input.gain.value = inputGain;
      chain.bands.forEach((band, i) => (band.gain.value = on ? (this.state.gains[i] ?? 0) : 0));
      this.limit(chain, on);
    }
  }

  // Put the limiter between the last band and the speakers, or take it out.
  private limit(chain: Chain, on: boolean): void {
    if (chain.limited === on || !this.ctx) return;
    const last = chain.bands.at(-1)!;
    const out = this.ctx.destination;
    try {
      if (on) {
        last.disconnect(out);
        last.connect(chain.limiter).connect(out);
      } else {
        last.disconnect(chain.limiter);
        chain.limiter.disconnect(out);
        last.connect(out);
      }
      chain.limited = on;
    } catch (err) {
      console.warn("Equalizer: could not switch the limiter", err);
    }
  }
}
