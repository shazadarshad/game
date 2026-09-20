/**
 * handling.js
 *
 * Pure handling helpers for the vehicle. These import nothing from Three or
 * Cannon so they can be unit tested offline with the plain Node test runner.
 */

/**
 * Move `current` toward `target` by at most `maxDelta`, so a steering angle
 * eases toward its goal at a bounded rate instead of snapping instantly.
 *
 * @param {number} current current value
 * @param {number} target desired value
 * @param {number} maxDelta maximum absolute change this call (non-negative)
 * @returns {number}
 */
export function steerTowards(current, target, maxDelta) {
  if (!Number.isFinite(maxDelta) || maxDelta <= 0) return current;
  const delta = target - current;
  if (delta > maxDelta) return current + maxDelta;
  if (delta < -maxDelta) return current - maxDelta;
  return target;
}

/**
 * Convert a metres-per-second speed to km/h.
 * kmhFromMs(10) is approximately 36.
 *
 * @param {number} metersPerSecond
 * @returns {number} km/h (0 for non-finite input)
 */
export function kmhFromMs(metersPerSecond) {
  if (!Number.isFinite(metersPerSecond)) return 0;
  return metersPerSecond * 3.6;
}

export default { steerTowards, kmhFromMs };
