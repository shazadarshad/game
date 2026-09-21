/**
 * shake.js
 *
 * PURE math for camera screen-shake on collisions. Imports nothing from Three
 * or Cannon so it can be unit tested offline. The impure ChaseCamera
 * (engine/camera.js) holds a trauma value (0..1) and asks this module each
 * frame for: how much trauma to add given an impact's speed delta, how trauma
 * decays over time, and the actual positional offset to add on top of the
 * smoothed chase position.
 *
 * The offset uses a deterministic pseudo-random function of (seed, axis) so
 * the same trauma+time always produces the same shake in tests, rather than
 * calling Math.random().
 */

/**
 * Map an impact's speed delta (m/s change in velocity from a collision) to an
 * amount of trauma to add, in [0, 1]. Impacts below `shakeMinImpulse` add
 * nothing; impacts at or above `shakeMaxImpulse` add full trauma.
 *
 * @param {number} impactSpeed magnitude of the sudden velocity change (m/s)
 * @param {object} cfg CONFIG.camera (shakeMinImpulse, shakeMaxImpulse)
 * @returns {number} trauma to add, in [0, 1]
 */
export function traumaFromImpact(impactSpeed, cfg) {
  if (!Number.isFinite(impactSpeed) || impactSpeed <= 0) return 0;
  const lo = cfg.shakeMinImpulse ?? 3;
  const hi = cfg.shakeMaxImpulse ?? 16;
  if (impactSpeed <= lo) return 0;
  if (hi <= lo) return 1;
  const t = (impactSpeed - lo) / (hi - lo);
  return t >= 1 ? 1 : t;
}

/**
 * Exponentially decay a trauma value over `dt` seconds.
 * @param {number} trauma current trauma, in [0, 1]
 * @param {number} decay decay rate per second
 * @param {number} dt seconds
 * @returns {number} decayed trauma, in [0, 1]
 */
export function decayTrauma(trauma, decay, dt) {
  if (!Number.isFinite(trauma) || trauma <= 0) return 0;
  if (!Number.isFinite(decay) || decay <= 0) return trauma;
  const next = trauma * Math.exp(-decay * dt);
  return next < 0.0005 ? 0 : next;
}

/**
 * Deterministic pseudo-random value in [-1, 1] as a function of a seed. Used
 * instead of Math.random() so shake offsets are reproducible in tests.
 * @param {number} seed
 * @returns {number}
 */
function pseudoNoise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Compute a positional shake offset for the current frame. Magnitude scales
 * with trauma squared (small shakes barely noticeable, big ones punchy), and
 * the direction is a deterministic noise function of elapsed time so the
 * shake looks like jitter rather than a smooth oscillation.
 *
 * @param {number} trauma current trauma, in [0, 1]
 * @param {number} elapsed running clock in seconds (drives the noise phase)
 * @param {object} cfg CONFIG.camera (shakeMaxMagnitude)
 * @returns {{x:number, y:number, z:number}} offset in metres
 */
export function shakeOffset(trauma, elapsed, cfg) {
  if (!Number.isFinite(trauma) || trauma <= 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const maxMag = cfg.shakeMaxMagnitude ?? 0.35;
  const magnitude = trauma * trauma * maxMag;
  // Offset each axis with a different noise phase so they are decorrelated.
  const freq = 28; // Hz-ish jitter rate
  const x = pseudoNoise(elapsed * freq) * magnitude;
  const y = pseudoNoise(elapsed * freq + 31.7) * magnitude * 0.6;
  const z = pseudoNoise(elapsed * freq + 67.3) * magnitude;
  return { x, y, z };
}

export default { traumaFromImpact, decayTrauma, shakeOffset };
