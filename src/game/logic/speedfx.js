/**
 * speedfx.js
 *
 * PURE math mapping speed to the speed-line overlay's opacity. Imports
 * nothing from the DOM so it can be unit tested offline; the impure HUD
 * (game/hud.js) calls this each frame and writes the result onto a CSS
 * opacity style.
 */

/**
 * Map unsigned speed (km/h) to the speed-line overlay opacity: 0 below
 * `startKmh`, ramping linearly to `maxOpacity` at `maxKmh`, clamped beyond.
 *
 * @param {number} speedKmh unsigned speed in km/h
 * @param {object} cfg CONFIG.fx.speedLines (startKmh, maxKmh, maxOpacity)
 * @returns {number} opacity in [0, maxOpacity]
 */
export function speedLineOpacity(speedKmh, cfg) {
  const start = cfg.startKmh ?? 90;
  const max = cfg.maxKmh ?? 220;
  const maxOpacity = cfg.maxOpacity ?? 0.55;
  const v = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  if (v <= start) return 0;
  if (max <= start) return maxOpacity;
  const t = Math.min(1, (v - start) / (max - start));
  return t * maxOpacity;
}

export default { speedLineOpacity };
