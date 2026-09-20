/**
 * respawn.test.js
 *
 * Unit tests for the mid-race respawn seam on the RaceDirector: the
 * lastPassedGateIndex and lastCheckpointPose getters that let R return a
 * spun-out car to the checkpoint it most recently cleared. RaceDirector imports
 * only pure modules (config + lap state), so it runs under node --test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RaceDirector } from "../src/game/raceState.js";

// Build simple axis-aligned gates around a square-ish loop. forward vectors use
// the same convention as the game: heading = atan2(forward.x, forward.z).
function gates() {
  return [
    { index: 0, position: { x: 0, z: 0 }, forward: { x: 0, z: 1 }, width: 20 },
    { index: 1, position: { x: 0, z: 50 }, forward: { x: 1, z: 0 }, width: 20 },
    { index: 2, position: { x: 50, z: 50 }, forward: { x: 0, z: -1 }, width: 20 },
    { index: 3, position: { x: 50, z: 0 }, forward: { x: -1, z: 0 }, width: 20 },
  ];
}

function director() {
  const g = gates();
  return new RaceDirector(g.length, g);
}

test("lastPassedGateIndex is -1 before the start line is crossed", () => {
  const race = director();
  assert.equal(race.lastPassedGateIndex, -1);
  assert.equal(race.lastCheckpointPose, null);
});

test("after crossing the start line the last passed gate is 0", () => {
  const race = director();
  race.lapState.lapStartTimeMs = 0; // timing started
  race.lapState.nextCheckpoint = 1; // heading to gate 1 next
  assert.equal(race.lastPassedGateIndex, 0);
  const pose = race.lastCheckpointPose;
  assert.deepEqual(pose.position, { x: 0, z: 0 });
  // forward (0,1) => heading atan2(0,1) = 0.
  assert.ok(Math.abs(pose.heading - 0) < 1e-9);
});

test("mid-lap the last passed gate is one before nextCheckpoint", () => {
  const race = director();
  race.lapState.lapStartTimeMs = 0;
  race.lapState.nextCheckpoint = 3; // gates 1 and 2 cleared
  assert.equal(race.lastPassedGateIndex, 2);
  const pose = race.lastCheckpointPose;
  assert.deepEqual(pose.position, { x: 50, z: 50 });
  // forward (0,-1) => heading atan2(0,-1) = PI.
  assert.ok(Math.abs(Math.abs(pose.heading) - Math.PI) < 1e-9);
});

test("nextCheckpoint 0 (all gates cleared) points back to the final gate", () => {
  const race = director();
  race.lapState.lapStartTimeMs = 0;
  race.lapState.nextCheckpoint = 0; // heading for start/finish to complete lap
  assert.equal(race.lastPassedGateIndex, 3);
  const pose = race.lastCheckpointPose;
  assert.deepEqual(pose.position, { x: 50, z: 0 });
});
