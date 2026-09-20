/**
 * lap.js
 *
 * PURE checkpoint / lap state machine and geometry helpers. This module imports
 * nothing from Three or Cannon so it can be unit tested offline with the plain
 * Node test runner. All positions are plain {x, z} points on the ground plane
 * (the y axis is irrelevant for lap detection).
 *
 * The model:
 *   - A circuit has `numCheckpoints` gates, indexed 0 .. numCheckpoints-1.
 *   - Gate 0 is the start/finish line.
 *   - To count a lap, the car must cross the gates strictly in order
 *     1, 2, ... numCheckpoints-1 and then cross gate 0 again. Crossing a gate
 *     out of order (skipping ahead, or re-touching a gate already passed) is
 *     ignored, which prevents shortcut cheating.
 *   - Lap time is measured from the moment gate 0 is crossed to start the lap
 *     until it is crossed again to complete it.
 */

/**
 * Create the mutable race/lap state.
 *
 * @param {number} numCheckpoints total gates including start/finish (>= 2)
 * @param {number} totalLaps number of laps required to finish (>= 1)
 * @returns {object} the state object mutated by registerCheckpoint()
 */
export function createRaceState(numCheckpoints, totalLaps) {
  const n = Math.max(2, Math.floor(numCheckpoints));
  const laps = Math.max(1, Math.floor(totalLaps));
  return {
    numCheckpoints: n,
    totalLaps: laps,
    // Laps fully completed so far.
    lap: 0,
    // Index of the next gate we expect to cross. We always expect gate 1 first
    // (gate 0 crossing at lap start is handled by lapStartTimeMs below).
    nextCheckpoint: 1,
    // Timestamp (ms) the current lap started, or null before the first start.
    lapStartTimeMs: null,
    // Most recently completed lap time (ms) or null.
    lastLapMs: null,
    // Best (fastest) completed lap time (ms) or null.
    bestLapMs: null,
    // All completed lap times in order.
    lapTimes: [],
    // True once totalLaps have been completed.
    finished: false,
  };
}

/**
 * Register that the car has crossed gate `index` at time `timeMs`. Returns a
 * result describing what happened so callers can fire events.
 *
 * @param {object} state a state from createRaceState (mutated in place)
 * @param {number} index the gate index that was crossed
 * @param {number} timeMs current race clock in milliseconds
 * @returns {{accepted:boolean, type:('start'|'checkpoint'|'lap'|'finish'|'ignored'), lapTimeMs?:number, bestLapMs?:number, lap?:number}}
 */
export function registerCheckpoint(state, index, timeMs) {
  if (state.finished) {
    return { accepted: false, type: "ignored" };
  }

  // Crossing the start/finish gate (index 0).
  if (index === 0) {
    // Very first crossing of gate 0 begins lap timing but does not complete a
    // lap. We only accept it when we have not started timing yet.
    if (state.lapStartTimeMs === null) {
      state.lapStartTimeMs = timeMs;
      state.nextCheckpoint = state.numCheckpoints > 1 ? 1 : 0;
      return { accepted: true, type: "start" };
    }

    // Otherwise, gate 0 completes a lap only if every intermediate checkpoint
    // has been cleared, i.e. nextCheckpoint has wrapped back to 0.
    if (state.nextCheckpoint !== 0) {
      return { accepted: false, type: "ignored" };
    }

    const lapTimeMs = timeMs - state.lapStartTimeMs;
    state.lastLapMs = lapTimeMs;
    state.lapTimes.push(lapTimeMs);
    const improved = state.bestLapMs === null || lapTimeMs < state.bestLapMs;
    if (improved) state.bestLapMs = lapTimeMs;
    state.lap += 1;

    if (state.lap >= state.totalLaps) {
      state.finished = true;
      state.nextCheckpoint = -1;
      return {
        accepted: true,
        type: "finish",
        lapTimeMs,
        bestLapMs: state.bestLapMs,
        lap: state.lap,
      };
    }

    // Begin the next lap.
    state.lapStartTimeMs = timeMs;
    state.nextCheckpoint = state.numCheckpoints > 1 ? 1 : 0;
    return {
      accepted: true,
      type: "lap",
      lapTimeMs,
      bestLapMs: state.bestLapMs,
      lap: state.lap,
    };
  }

  // Intermediate checkpoint. Only accepted if timing has started and this is
  // exactly the next expected gate; anything else (skipped/out of order) is
  // ignored.
  if (state.lapStartTimeMs === null) {
    return { accepted: false, type: "ignored" };
  }
  if (index !== state.nextCheckpoint) {
    return { accepted: false, type: "ignored" };
  }

  // Advance to the next gate; after the last intermediate gate we wrap to 0 so
  // the next accepted crossing is the start/finish line completing the lap.
  const advanced = index + 1;
  state.nextCheckpoint = advanced >= state.numCheckpoints ? 0 : advanced;
  return { accepted: true, type: "checkpoint", lap: state.lap };
}

/**
 * Segment / gate-plane intersection test. A gate is a line segment centred at
 * `gate.position` (a {x, z} point), spanning `gate.width` metres total,
 * oriented perpendicular to `gate.forward` (a {x, z} unit vector pointing in
 * the racing direction). The car crosses the gate when the movement segment
 * prevPos -> currPos passes through the gate plane in the forward direction and
 * the crossing point lies within the gate's half-width of the gate centre.
 *
 * Only forward crossings count (dot of movement with forward must be positive),
 * so reversing back through a gate does not register.
 *
 * @param {{x:number,z:number}} prevPos previous car position
 * @param {{x:number,z:number}} currPos current car position
 * @param {{position:{x:number,z:number}, forward:{x:number,z:number}, width:number}} gate
 * @returns {boolean} true if the segment crossed the gate this step
 */
export function crossedGate(prevPos, currPos, gate) {
  const fwd = gate.forward;
  const gp = gate.position;

  // Signed distance of each endpoint from the gate plane along the forward
  // normal. The plane passes through gp with normal fwd.
  const dPrev = (prevPos.x - gp.x) * fwd.x + (prevPos.z - gp.z) * fwd.z;
  const dCurr = (currPos.x - gp.x) * fwd.x + (currPos.z - gp.z) * fwd.z;

  // Must move from the "before" side (negative) to the "on/after" side
  // (>= 0) this step. This inherently requires forward motion through the gate.
  if (dPrev >= 0 || dCurr < 0) return false;

  // Degenerate: no movement across the plane.
  const denom = dCurr - dPrev;
  if (denom === 0) return false;

  // Parametric crossing point along the movement segment.
  const t = -dPrev / denom;
  const hitX = prevPos.x + (currPos.x - prevPos.x) * t;
  const hitZ = prevPos.z + (currPos.z - prevPos.z) * t;

  // Lateral offset of the hit point from the gate centre, measured along the
  // gate line (perpendicular to forward). The gate line direction is the
  // forward vector rotated 90 degrees: (-fwd.z, fwd.x).
  const sideX = -fwd.z;
  const sideZ = fwd.x;
  const lateral = (hitX - gp.x) * sideX + (hitZ - gp.z) * sideZ;

  return Math.abs(lateral) <= gate.width / 2;
}

export default { createRaceState, registerCheckpoint, crossedGate };
