/**
 * cameraMath.js
 *
 * Pure math helpers for smoothing camera motion. These deliberately import
 * nothing from Three or Cannon so they can be unit tested offline with the
 * plain Node test runner.
 */

const TAU = Math.PI * 2;

/**
 * Frame-rate independent exponential damping toward a target.
 *
 * As dt -> infinity the result approaches `target`; as lambda -> 0 the result
 * stays near `current`. Uses 1 - e^(-lambda*dt) so the smoothing is stable and
 * independent of frame rate.
 *
 * @param {number} current current value
 * @param {number} target desired value
 * @param {number} lambda stiffness (per second); higher = faster convergence
 * @param {number} dt elapsed seconds
 * @returns {number}
 */
export function expDamp(current, target, lambda, dt) {
  if (lambda <= 0 || dt <= 0) return current;
  const t = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * t;
}

/**
 * Exponential damping applied component-wise to a {x,y,z} vector.
 * Accepts and returns plain objects so it stays Three-free.
 *
 * @param {{x:number,y:number,z:number}} current
 * @param {{x:number,y:number,z:number}} target
 * @param {number} lambda
 * @param {number} dt
 * @returns {{x:number,y:number,z:number}}
 */
export function dampVec3(current, target, lambda, dt) {
  return {
    x: expDamp(current.x, target.x, lambda, dt),
    y: expDamp(current.y, target.y, lambda, dt),
    z: expDamp(current.z, target.z, lambda, dt),
  };
}

/**
 * Normalise an angle to the range (-PI, PI].
 * @param {number} angle radians
 * @returns {number}
 */
export function wrapAngle(angle) {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}

/**
 * Exponential damping for an angle, taking the shortest path around the circle
 * so it never spins the long way when crossing the -PI/PI seam.
 *
 * @param {number} current radians
 * @param {number} target radians
 * @param {number} lambda
 * @param {number} dt
 * @returns {number}
 */
export function dampAngle(current, target, lambda, dt) {
  const delta = wrapAngle(target - current);
  return wrapAngle(current + expDamp(0, delta, lambda, dt));
}

export default { expDamp, dampVec3, wrapAngle, dampAngle };
