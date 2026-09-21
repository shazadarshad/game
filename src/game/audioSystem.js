/**
 * audioSystem.js
 *
 * AudioSystem: a systems-registry system (see src/engine/loop.js and
 * src/systems/README.md) that synthesizes engine sound and tire-screech
 * audio purely with the Web Audio API. No audio files are downloaded or
 * bundled: the engine tone is a sawtooth oscillator (bright, "buzzy" and
 * cheap to run) whose frequency/gain are driven by the car's speed/throttle
 * each fixed step, and the tire screech is filtered white noise whose gain
 * ramps with drift intensity. All the frequency/gain MATH is pure and lives
 * in src/game/logic/audioMath.js (unit tested); this module only owns real
 * AudioContext/AudioNode objects and applies those numbers to them.
 *
 * Browser autoplay policy: an AudioContext starts in the "suspended" state
 * until resumed from within a user-gesture handler. This system exposes
 * start(), which callers must invoke from a click/keydown handler (main.js
 * wires it to the same gesture that begins the race), and is otherwise a
 * silent no-op until that happens, so boot never throws on autoplay
 * restrictions.
 *
 * Shaped as { update(dt, ctx) } per the systems contract in loop.js, reading
 * ctx.car each step; add via loop.addSystem(new AudioSystem()).
 */
import { CONFIG } from "../config.js";
import {
  engineFrequency,
  engineVolume,
  easeVolume,
  screechTargetVolume,
} from "./logic/audioMath.js";

export class AudioSystem {
  constructor() {
    this.cfg = CONFIG.audio;
    this.enabled = this.cfg.enabled !== false;
    this._ctx = null;
    this._started = false;

    // Smoothed screech gain, eased toward its target each step (asymmetric
    // attack/release) so it does not snap on/off.
    this._screechGain = 0;
  }

  /** @returns {boolean} whether the AudioContext has been started (post user-gesture). */
  get started() {
    return this._started;
  }

  /**
   * Create (or resume) the AudioContext and build the synthesis graph. MUST
   * be called from within a user-gesture handler (click/keydown) to satisfy
   * browser autoplay policy; safe to call multiple times (a no-op after the
   * first successful start). Silently does nothing if disabled in config or
   * if the Web Audio API is unavailable (non-browser context).
   */
  start() {
    if (!this.enabled || this._started) return;
    const AudioCtx =
      (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) ||
      (typeof globalThis !== "undefined" && globalThis.AudioContext);
    if (!AudioCtx) return; // No Web Audio API available (non-browser context).

    try {
      const ctx = new AudioCtx();
      this._ctx = ctx;
      this._buildGraph(ctx);
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume().catch(() => {});
      }
      this._started = true;
    } catch (err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("AudioSystem: Web Audio unavailable, running without sound:", err);
      }
      this._ctx = null;
      this._started = false;
    }
  }

  _buildGraph(ctx) {
    const master = ctx.createGain();
    master.gain.value = this.cfg.masterVolume ?? 0.55;
    master.connect(ctx.destination);
    this._master = master;

    // ---- Engine tone: a sawtooth oscillator (bright/buzzy, reads as an
    // engine at a fraction of the synthesis cost of layered noise) through a
    // low-pass filter that also brightens with speed for a simple "load"
    // feel, into its own gain node.
    const engineOsc = ctx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = this.cfg.engine.idleHz ?? 55;

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 900;
    engineFilter.Q.value = 0.7;

    const engineGain = ctx.createGain();
    engineGain.gain.value = this.cfg.engine.volumeIdle ?? 0.05;

    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();

    this._engineOsc = engineOsc;
    this._engineFilter = engineFilter;
    this._engineGain = engineGain;

    // ---- Tire screech: filtered white noise looped from a short buffer,
    // band-passed to sit in a "tire squeal" register, gated by a gain node
    // the update loop eases toward the drift-intensity target.
    const noiseBuffer = buildNoiseBuffer(ctx, 1.0);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = "bandpass";
    screechFilter.frequency.value = 1800;
    screechFilter.Q.value = 3.5;

    const screechGain = ctx.createGain();
    screechGain.gain.value = 0;

    noise.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(master);
    noise.start();

    this._noise = noise;
    this._screechFilter = screechFilter;
    this._screechGainNode = screechGain;
  }

  /**
   * Per fixed-step update, called by the game loop's systems fan-out with the
   * shared context (see src/systems/README.md). Reads ctx.car for speed,
   * throttle and drift intensity; no-op until start() has run.
   * @param {number} dt fixed step seconds
   * @param {{car?: import('./car.js').Car}} ctx shared loop context
   */
  update(dt, ctx) {
    if (!this._started || !this._ctx || !ctx || !ctx.car) return;
    const car = ctx.car;
    const engineCfg = this.cfg.engine;
    const screechCfg = this.cfg.tireScreech;

    const freq = engineFrequency(car.speedKmh, engineCfg);
    const vol = engineVolume(car.throttle ?? 0, engineCfg);
    this._setParam(this._engineOsc.frequency, freq);
    this._setParam(this._engineGain.gain, vol);
    // Brighten the filter a little with speed so higher revs sound less
    // muffled, purely a cosmetic touch (not unit-tested; simple linear map).
    const brightness = 700 + Math.min(1, car.speedKmh / (engineCfg.maxHz ? 200 : 200)) * 2200;
    this._setParam(this._engineFilter.frequency, brightness);

    const target = screechTargetVolume(car.driftIntensity ?? 0, screechCfg);
    const rising = target > this._screechGain;
    this._screechGain = easeVolume(this._screechGain, target, rising, screechCfg, dt);
    this._setParam(this._screechGainNode.gain, this._screechGain);
  }

  /** Set an AudioParam smoothly (tiny ramp avoids audible clicks on jumps). */
  _setParam(param, value) {
    if (!param || !Number.isFinite(value)) return;
    const now = this._ctx.currentTime;
    param.setTargetAtTime(value, now, 0.015);
  }

  /** Stop and release all audio nodes (e.g. on teardown). */
  dispose() {
    if (this._noise) {
      try {
        this._noise.stop();
      } catch {
        // Already stopped; ignore.
      }
    }
    if (this._engineOsc) {
      try {
        this._engineOsc.stop();
      } catch {
        // Already stopped; ignore.
      }
    }
    if (this._ctx && typeof this._ctx.close === "function") {
      this._ctx.close().catch(() => {});
    }
    this._started = false;
  }
}

/**
 * Build a short buffer of white noise for the tire-screech source.
 * @param {AudioContext} ctx
 * @param {number} seconds buffer length
 * @returns {AudioBuffer}
 */
function buildNoiseBuffer(ctx, seconds) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export default AudioSystem;
