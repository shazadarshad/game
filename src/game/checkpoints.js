/**
 * checkpoints.js
 *
 * Bridges the track's gate definitions and the pure lap.js state machine to the
 * running game. Each fixed step it receives the car's previous and current
 * ground position and tests only the next expected gate (and the start/finish
 * gate) for a crossing using the pure crossedGate() helper. On a valid crossing
 * it advances the race via registerCheckpoint() and fires callbacks.
 *
 * This module deliberately imports only the pure lap.js logic (no Three/Cannon)
 * so the crossing/registration flow is exercised by the same code path the
 * tests cover.
 *
 * Callbacks:
 *   onCheckpoint(index, state)         a mid-lap checkpoint was cleared
 *   onLapComplete(lapTimeMs, bestLapMs, lap, state)
 *   onFinish(lapTimeMs, bestLapMs, state)
 */
import { crossedGate, registerCheckpoint } from "./logic/lap.js";

export class CheckpointTracker {
  /**
   * @param {{index:number, position:{x:number,z:number}, forward:{x:number,z:number}, width:number}[]} gates
   * @param {object} raceState state object from lap.createRaceState()
   * @param {{onCheckpoint?:Function, onLapComplete?:Function, onFinish?:Function}} [callbacks]
   */
  constructor(gates, raceState, callbacks = {}) {
    this.gates = gates;
    this.state = raceState;
    this.callbacks = callbacks;
    // Previous ground position; null until the first update seeds it.
    this._prev = null;
  }

  /** Reset the previous-position tracking (e.g. after a teleport/reset). */
  seed(position) {
    this._prev = { x: position.x, z: position.z };
  }

  /**
   * Advance one fixed step. Tests the gates the car could legally cross next
   * against the movement segment prev -> current.
   *
   * @param {{x:number,z:number}} position current car ground position
   * @param {number} timeMs current race clock in milliseconds
   */
  update(position, timeMs) {
    const curr = { x: position.x, z: position.z };
    if (this._prev === null) {
      this._prev = curr;
      return;
    }

    // Candidate gates: the next expected checkpoint, plus the start/finish gate
    // (index 0) so a lap can complete or timing can start. Testing a small set
    // avoids a same-step false positive from an unrelated far gate.
    const candidates = new Set();
    if (this.state.nextCheckpoint >= 0) {
      candidates.add(this.state.nextCheckpoint);
    }
    candidates.add(0);

    for (const idx of candidates) {
      const gate = this.gates[idx];
      if (!gate) continue;
      if (crossedGate(this._prev, curr, gate)) {
        const result = registerCheckpoint(this.state, idx, timeMs);
        if (result.accepted) this._emit(result);
      }
    }

    this._prev = curr;
  }

  _emit(result) {
    const cb = this.callbacks;
    if (result.type === "checkpoint" && cb.onCheckpoint) {
      cb.onCheckpoint(this.state.nextCheckpoint, this.state);
    } else if (result.type === "lap" && cb.onLapComplete) {
      cb.onLapComplete(
        result.lapTimeMs,
        result.bestLapMs,
        result.lap,
        this.state,
      );
    } else if (result.type === "finish" && cb.onFinish) {
      cb.onFinish(result.lapTimeMs, result.bestLapMs, this.state);
    }
  }
}

export default CheckpointTracker;
