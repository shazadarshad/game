/**
 * drift.js
 *
 * PURE drift/skid math. Imports nothing from Three or Cannon so it can be unit
 * tested offline with the plain Node test runner. It answers two questions the
 * car uses each fixed step:
 *
 *   1. How much is the car sliding sideways right now (lateral slip speed in
 *      m/s), given its world velocity and its forward heading?
 *   2. Given that slip plus the current speed and inputs, should we be emitting
 *      skid feedback (tire marks / puff / body lean)?
 *
 * All thresholds are passed in from CONFIG.handling so tuning stays in one
 * place. Positions and velocities here are plain {x, z} ground-plane values;
 * the y axis is irrelevant for slip.
 */

/**
 * Lateral (sideways) component of the velocity relative to the car's heading.
 *
 * The heading is a yaw angle in radians where forward is
 * (sin(heading), cos(heading)) on the XZ plane, matching how the game derives
 * spawn/car headings elsewhere. The lateral axis is forward rotated by ninety
 * degrees: (cos(heading), -sin(heading)).
 *
 * @param {{x:number,z:number}} velocity ground velocity in m/s
 * @param {number} heading yaw in radians
 * @returns {number} unsigned sideways speed in m/s (0 for non-finite input)
 */
export function lateralSlip(velocity, heading) {
  if (
    !velocity ||
    !Number.isFinite(velocity.x) ||
    !Number.isFinite(velocity.z) ||
    !Number.isFinite(heading)
  ) {
    return 0;
  }
  const sideX = Math.cos(heading);
  const sideZ = -Math.sin(heading);
  return Math.abs(velocity.x * sideX + velocity.z * sideZ);
}

/**
 * Decide whether the car is drifting hard enough to leave skid feedback.
 *
 * A drift is registered when EITHER:
 *   - the handbrake is held while the car is moving faster than the drift
 *     engage speed, OR
 *   - the car is above the drift engage speed AND its sideways slip exceeds
 *     `slipThreshold` metres per second (a genuine slide, not just steering).
 *
 * @param {object} params
 * @param {number} params.speedKmh unsigned speed in km/h
 * @param {number} params.slip lateral slip in m/s (from lateralSlip)
 * @param {boolean} params.handbrake whether the handbrake is held
 * @param {object} handling CONFIG.handling (driftEngageSpeed, skidSlipThreshold)
 * @returns {boolean}
 */
export function isDrifting({ speedKmh, slip, handbrake }, handling) {
  const engage = handling.driftEngageSpeed ?? 35;
  const slipThreshold = handling.skidSlipThreshold ?? 3.2;
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) return false;
  if (handbrake && speedKmh > engage * 0.5) return true;
  return speedKmh > engage && slip > slipThreshold;
}

/**
 * Map a slip value to a normalised drift intensity in [0, 1], used to scale the
 * body lean angle and skid-mark opacity. Slip at or below `slipThreshold` maps
 * to 0; slip at or above `slipMax` maps to 1.
 *
 * @param {number} slip lateral slip in m/s
 * @param {object} handling CONFIG.handling (skidSlipThreshold, skidSlipMax)
 * @returns {number} clamped intensity in [0, 1]
 */
export function driftIntensity(slip, handling) {
  if (!Number.isFinite(slip) || slip <= 0) return 0;
  const lo = handling.skidSlipThreshold ?? 3.2;
  const hi = handling.skidSlipMax ?? 10;
  if (hi <= lo) return slip > lo ? 1 : 0;
  const t = (slip - lo) / (hi - lo);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export default { lateralSlip, isDrifting, driftIntensity };
