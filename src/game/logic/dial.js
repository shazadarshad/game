/**
 * dial.js
 *
 * PURE math for the dial-style speedometer HUD. Imports nothing from Three or
 * Cannon (and nothing from the DOM) so it can be unit tested offline. The HUD
 * (game/hud.js) draws an SVG needle by asking this module for the needle's
 * rotation angle and the redline arc geometry; this module only computes
 * numbers/strings, never touches document/window.
 */

/**
 * Map a speed to a needle rotation angle (degrees), clamped to the dial's
 * configured sweep.
 *
 * @param {number} speedKmh unsigned speed in km/h (non-finite treated as 0)
 * @param {object} cfg CONFIG.hud (speedoMaxKmh, speedoStartAngle, speedoEndAngle)
 * @returns {number} degrees, within [startAngle, endAngle]
 */
export function needleAngle(speedKmh, cfg) {
  const max = cfg.speedoMaxKmh ?? 240;
  const start = cfg.speedoStartAngle ?? -130;
  const end = cfg.speedoEndAngle ?? 130;
  const v = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  const t = max > 0 ? Math.min(1, v / max) : 0;
  return start + (end - start) * t;
}

/**
 * Fraction of the dial sweep (0..1) at which the redline zone begins.
 * @param {object} cfg CONFIG.hud (redlineFraction)
 * @returns {number} 0..1
 */
export function redlineStartFraction(cfg) {
  const f = cfg.redlineFraction ?? 0.82;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/**
 * Angle (degrees) at which the redline zone begins on the dial sweep.
 * @param {object} cfg CONFIG.hud
 * @returns {number} degrees
 */
export function redlineStartAngle(cfg) {
  const start = cfg.speedoStartAngle ?? -130;
  const end = cfg.speedoEndAngle ?? 130;
  return start + (end - start) * redlineStartFraction(cfg);
}

/**
 * Whether a given speed is within the dial's redline zone.
 * @param {number} speedKmh
 * @param {object} cfg CONFIG.hud
 * @returns {boolean}
 */
export function isRedline(speedKmh, cfg) {
  const max = cfg.speedoMaxKmh ?? 240;
  const v = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  return v / max >= redlineStartFraction(cfg);
}

/**
 * Convert a polar (angle-in-degrees, radius) pair centred at (cx, cy) into
 * cartesian SVG coordinates. Angle 0 points straight up; positive angles go
 * clockwise, matching how a car dial is normally drawn.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} angleDeg
 * @returns {{x:number, y:number}}
 */
export function polarToCartesian(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

/**
 * Build an SVG arc "d" path attribute string sweeping clockwise from
 * startAngle to endAngle (degrees, 0 = up) at the given radius around (cx,cy).
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} startAngle degrees
 * @param {number} endAngle degrees
 * @returns {string}
 */
export function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export default {
  needleAngle,
  redlineStartFraction,
  redlineStartAngle,
  isRedline,
  polarToCartesian,
  describeArc,
};
