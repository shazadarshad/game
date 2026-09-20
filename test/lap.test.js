/**
 * lap.test.js
 *
 * Offline unit tests for the pure lap/checkpoint state machine and the gate
 * crossing geometry helper (no Three/Cannon needed). Run with:
 *   node --test test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createRaceState,
  registerCheckpoint,
  crossedGate,
} from "../src/game/logic/lap.js";

// A 4-gate circuit (0 = start/finish, then 1, 2, 3), single lap unless noted.
function fresh(numCheckpoints = 4, laps = 1) {
  return createRaceState(numCheckpoints, laps);
}

test("in-order checkpoint sequence completes a lap and increments lap count", () => {
  const s = fresh(4, 3);
  // Cross start/finish to begin timing (does not complete a lap).
  let r = registerCheckpoint(s, 0, 0);
  assert.equal(r.type, "start");
  assert.equal(s.lap, 0);
  assert.equal(s.nextCheckpoint, 1);

  // Hit gates 1, 2, 3 in order.
  r = registerCheckpoint(s, 1, 1000);
  assert.equal(r.type, "checkpoint");
  r = registerCheckpoint(s, 2, 2000);
  assert.equal(r.type, "checkpoint");
  r = registerCheckpoint(s, 3, 3000);
  assert.equal(r.type, "checkpoint");
  assert.equal(s.nextCheckpoint, 0, "after last gate we expect start/finish");

  // Cross start/finish to complete the lap.
  r = registerCheckpoint(s, 0, 4000);
  assert.equal(r.type, "lap");
  assert.equal(r.lapTimeMs, 4000);
  assert.equal(s.lap, 1, "lap count incremented");
  assert.equal(s.nextCheckpoint, 1, "next lap expects gate 1 again");
});

test("out-of-order / skipped checkpoint is ignored", () => {
  const s = fresh(4, 1);
  registerCheckpoint(s, 0, 0); // start timing
  assert.equal(s.nextCheckpoint, 1);

  // Skip gate 1 and try gate 2: must be ignored.
  let r = registerCheckpoint(s, 2, 500);
  assert.equal(r.accepted, false);
  assert.equal(r.type, "ignored");
  assert.equal(s.nextCheckpoint, 1, "expected gate unchanged");

  // Crossing start/finish without clearing intermediate gates does not count.
  r = registerCheckpoint(s, 0, 800);
  assert.equal(r.accepted, false);
  assert.equal(s.lap, 0, "no lap credited for a shortcut");

  // Proper order still works afterward.
  registerCheckpoint(s, 1, 1000);
  registerCheckpoint(s, 2, 1500);
  registerCheckpoint(s, 3, 2000);
  r = registerCheckpoint(s, 0, 2500);
  assert.equal(r.type, "finish");
  assert.equal(s.lap, 1);
});

test("re-touching an already-passed gate is ignored", () => {
  const s = fresh(4, 1);
  registerCheckpoint(s, 0, 0);
  registerCheckpoint(s, 1, 100);
  // Touch gate 1 again: it is no longer the expected next gate.
  const r = registerCheckpoint(s, 1, 150);
  assert.equal(r.accepted, false);
  assert.equal(s.nextCheckpoint, 2);
});

test("crossedGate returns true when the segment crosses within width", () => {
  // Gate at origin, facing +Z (forward = {0,1}), width 10 (half-width 5).
  const gate = { position: { x: 0, z: 0 }, forward: { x: 0, z: 1 }, width: 10 };
  // Move from z=-1 to z=+1 straight through the middle.
  assert.equal(
    crossedGate({ x: 0, z: -1 }, { x: 0, z: 1 }, gate),
    true,
  );
  // Cross near the edge but still within half-width.
  assert.equal(
    crossedGate({ x: 4.5, z: -1 }, { x: 4.5, z: 1 }, gate),
    true,
  );
});

test("crossedGate returns false outside width, when not crossing, or when reversing", () => {
  const gate = { position: { x: 0, z: 0 }, forward: { x: 0, z: 1 }, width: 10 };
  // Crosses the plane but beyond the half-width (|x| > 5).
  assert.equal(
    crossedGate({ x: 8, z: -1 }, { x: 8, z: 1 }, gate),
    false,
  );
  // Never reaches the plane (stays on the near side).
  assert.equal(
    crossedGate({ x: 0, z: -3 }, { x: 0, z: -1 }, gate),
    false,
  );
  // Moving in reverse (from the far side back to the near side) does not count.
  assert.equal(
    crossedGate({ x: 0, z: 1 }, { x: 0, z: -1 }, gate),
    false,
  );
});

test("crossedGate handles a diagonally oriented gate", () => {
  // Gate facing +X, so its plane is the z axis line through origin.
  const gate = { position: { x: 0, z: 0 }, forward: { x: 1, z: 0 }, width: 6 };
  assert.equal(crossedGate({ x: -1, z: 0 }, { x: 1, z: 0 }, gate), true);
  // Lateral (z) offset beyond half-width 3.
  assert.equal(crossedGate({ x: -1, z: 5 }, { x: 1, z: 5 }, gate), false);
});

test("best lap updates only when a faster lap is recorded", () => {
  const s = fresh(2, 3); // 2 gates: 0 = start/finish, 1 = one checkpoint.
  const doLap = (startMs, durationMs) => {
    registerCheckpoint(s, 1, startMs + durationMs / 2);
    return registerCheckpoint(s, 0, startMs + durationMs);
  };

  // Start timing.
  registerCheckpoint(s, 0, 0);

  // Lap 1: 5000 ms -> best = 5000.
  let r = doLap(0, 5000);
  assert.equal(r.type, "lap");
  assert.equal(s.bestLapMs, 5000);
  assert.equal(r.bestLapMs, 5000);

  // Lap 2: slower (6000 ms) -> best stays 5000.
  r = doLap(5000, 6000);
  assert.equal(s.lastLapMs, 6000);
  assert.equal(s.bestLapMs, 5000, "best not worsened by a slower lap");

  // Lap 3: faster (4000 ms) -> best improves to 4000, and this is the finish.
  r = doLap(11000, 4000);
  assert.equal(r.type, "finish");
  assert.equal(s.bestLapMs, 4000);
  assert.equal(s.finished, true);
  assert.equal(s.lap, 3);
});

test("createRaceState clamps degenerate inputs", () => {
  const s = createRaceState(1, 0);
  assert.equal(s.numCheckpoints, 2);
  assert.equal(s.totalLaps, 1);
});
