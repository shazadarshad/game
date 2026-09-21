/**
 * dust.js
 *
 * PURE math deciding when the car should kick up a dust puff from wheelspin
 * on hard acceleration from near-standstill (the "off-road/launch dust"
 * effect described in CONFIG.fx.dust). Imports nothing from Three or the DOM
 * so it can be unit tested offline; the impure Car (game/car.js) calls this
 * each fixed step and fades a pooled sprite toward the returned intensity,
 * the same pattern already used for the tire-smoke puff in _updateDrift.
 *
 * Wheelspin dust is intentionally a DIFFERENT trigger than drift dust/smoke:
 * it fires on hard throttle at low speed (a launch/spin-up), independent of
 * lateral slip, and fades out once the car is rolling at a normal pace.
 */

/**
 * Map (speed, throttle) to a 0..1 wheelspin/dust intensity.
 *
 * Dust ramps in once throttle is above `minThrottle` AND speed is below
 * `cutoffKmh` (a launch or low-speed floor-it moment), scaling to full
 * intensity at throttle 1 and fading to 0 linearly as speed approaches the
 * cutoff (so it does not just snap off).
 *
 * @param {{speedKmh:number, throttle:number}} params
 * @param {object} cfg CONFIG.fx.dust (minThrottle, cutoffKmh)
 * @returns {number} clamped intensity in [0, 1]
 */
export function wheelspinIntensity({ speedKmh, throttle }, cfg) {
  const minThrottle = cfg.minThrottle ?? 0.6;
  const cutoff = cfg.cutoffKmh ?? 45;
  const v = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  const t = Number.isFinite(throttle) ? Math.max(0, Math.min(1, throttle)) : 0;

  if (t < minThrottle || v >= cutoff || cutoff <= 0) return 0;

  const throttleFactor = (t - minThrottle) / Math.max(1e-6, 1 - minThrottle);
  const speedFade = 1 - v / cutoff; // 1 at standstill, 0 at the cutoff speed
  const intensity = throttleFactor * speedFade;
  return intensity <= 0 ? 0 : intensity >= 1 ? 1 : intensity;
}

export default { wheelspinIntensity };
