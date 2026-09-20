/**
 * format.js
 *
 * Pure formatting helpers for the HUD. No Three/Cannon imports so they can be
 * unit tested offline.
 */

/**
 * Format a duration in milliseconds as 'M:SS.mmm'.
 * Examples: 61234 -> '1:01.234', 0 -> '0:00.000', 754 -> '0:00.754'.
 *
 * @param {number} ms milliseconds (negative or non-finite values clamp to 0)
 * @returns {string}
 */
export function formatLapTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalMs = Math.floor(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(millis).padStart(3, "0");
  return `${minutes}:${ss}.${mmm}`;
}

/**
 * Convert a metres-per-second speed to a rounded km/h integer for the
 * speedometer readout.
 * @param {number} metersPerSecond
 * @returns {number}
 */
export function toKmh(metersPerSecond) {
  if (!Number.isFinite(metersPerSecond)) return 0;
  return Math.max(0, Math.round(Math.abs(metersPerSecond) * 3.6));
}

export default { formatLapTime, toKmh };
