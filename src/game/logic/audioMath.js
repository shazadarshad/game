/**
 * audioMath.js
 *
 * PURE math mapping game state (speed, throttle, drift) to audio parameters
 * (oscillator frequency/volume). Imports nothing from the Web Audio API or any
 * browser global, so it is unit-testable offline. The impure AudioSystem
 * (game/audioSystem.js) reads CONFIG.audio and calls these each frame, then
 * applies the numbers to real AudioNode parameters.
 */

/**
 * Map unsigned speed (km/h) to an engine oscillator frequency (Hz), a simple
 * linear ramp from idle to a capped maximum.
 *
 * @param {number} speedKmh unsigned speed in km/h
 * @param {object} cfg CONFIG.audio.engine (idleHz, hzPerKmh, maxHz)
 * @returns {number} frequency in Hz
 */
export function engineFrequency(speedKmh, cfg) {
  const idle = cfg.idleHz ?? 55;
  const perKmh = cfg.hzPerKmh ?? 2.6;
  const max = cfg.maxHz ?? 260;
  const v = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  const hz = idle + v * perKmh;
  return hz > max ? max : hz;
}

/**
 * Map throttle input (0..1) to an engine gain/volume level, blending between
 * an idle volume and a max volume under load.
 *
 * @param {number} throttle 0..1 (values outside are clamped)
 * @param {object} cfg CONFIG.audio.engine (volumeIdle, volumeMax)
 * @returns {number} gain in [volumeIdle, volumeMax]
 */
export function engineVolume(throttle, cfg) {
  const idle = cfg.volumeIdle ?? 0.05;
  const max = cfg.volumeMax ?? 0.32;
  const t = Number.isFinite(throttle) ? Math.min(1, Math.max(0, throttle)) : 0;
  return idle + (max - idle) * t;
}

/**
 * Ease a current gain value toward a target at an asymmetric rate (faster
 * attack, slower release feels more natural for tire screech), independent of
 * frame rate.
 *
 * @param {number} current current gain
 * @param {number} target target gain
 * @param {boolean} rising whether we should use the attack rate (target > current)
 * @param {object} cfg object with attackRate/releaseRate (per second)
 * @param {number} dt seconds
 * @returns {number}
 */
export function easeVolume(current, target, rising, cfg, dt) {
  const rate = rising ? cfg.attackRate ?? 10 : cfg.releaseRate ?? 6;
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(dt) || dt <= 0) {
    return current;
  }
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}

/**
 * Tire-screech target volume from the current drift intensity.
 * @param {number} intensity 0..1 drift intensity (from logic/drift.js)
 * @param {object} cfg CONFIG.audio.tireScreech (volumeMax)
 * @returns {number} target gain
 */
export function screechTargetVolume(intensity, cfg) {
  const max = cfg.volumeMax ?? 0.28;
  const i = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  return max * i;
}

export default { engineFrequency, engineVolume, easeVolume, screechTargetVolume };
