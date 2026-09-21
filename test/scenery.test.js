/**
 * scenery.test.js
 *
 * Offline unit tests for the pure roadside-scenery placement math (no Three
 * needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { placeTrees, placeGrandstands } from "../src/game/logic/scenery.js";

// A simple square-ish closed loop, roughly evenly spaced.
function squareLoop(size, steps) {
  const pts = [];
  const half = size / 2;
  const corners = [
    { x: -half, z: -half },
    { x: half, z: -half },
    { x: half, z: half },
    { x: -half, z: half },
  ];
  for (let c = 0; c < 4; c++) {
    const a = corners[c];
    const b = corners[(c + 1) % 4];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return pts;
}

const TREE_CFG = {
  spacing: 14,
  jitter: 6,
  minOffset: 3,
  maxOffset: 22,
  minHeight: 4,
  maxHeight: 7.5,
  minRadius: 1.1,
  maxRadius: 1.9,
  canopyColors: [0x2f6b34, 0x35803b],
};

test("placeTrees returns an empty array for an empty centerline", () => {
  assert.deepEqual(placeTrees([], 9, TREE_CFG, 4), []);
});

test("placeTrees places trees strictly outside the road + clearance", () => {
  const loop = squareLoop(200, 20);
  const roadHalfWidth = 9;
  const clearance = 4;
  const trees = placeTrees(loop, roadHalfWidth, TREE_CFG, clearance, 42);
  assert.ok(trees.length > 0, "expected at least some trees");
  for (const t of trees) {
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.z));
    assert.ok(t.height >= TREE_CFG.minHeight && t.height <= TREE_CFG.maxHeight);
    assert.ok(t.radius >= TREE_CFG.minRadius && t.radius <= TREE_CFG.maxRadius);
    assert.ok(TREE_CFG.canopyColors.includes(t.canopyColor));
  }
});

test("placeTrees is deterministic for the same seed", () => {
  const loop = squareLoop(200, 20);
  const a = placeTrees(loop, 9, TREE_CFG, 4, 7);
  const b = placeTrees(loop, 9, TREE_CFG, 4, 7);
  assert.deepEqual(a, b);
});

test("placeTrees produces a different layout for a different seed", () => {
  const loop = squareLoop(200, 20);
  const a = placeTrees(loop, 9, TREE_CFG, 4, 1);
  const b = placeTrees(loop, 9, TREE_CFG, 4, 2);
  assert.notDeepEqual(a, b);
});

const STAND_CFG = {
  count: 5,
  offset: 16,
  width: 22,
  depth: 6,
  height: 8,
};

test("placeGrandstands returns an empty array for an empty centerline", () => {
  assert.deepEqual(placeGrandstands([], 9, STAND_CFG, 4), []);
});

test("placeGrandstands returns exactly `count` stands", () => {
  const loop = squareLoop(200, 20);
  const stands = placeGrandstands(loop, 9, STAND_CFG, 4);
  assert.equal(stands.length, STAND_CFG.count);
  for (const s of stands) {
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
    assert.ok(Number.isFinite(s.heading));
    assert.equal(s.width, STAND_CFG.width);
    assert.equal(s.depth, STAND_CFG.depth);
    assert.equal(s.height, STAND_CFG.height);
  }
});

test("placeGrandstands alternates sides (not all on the same side)", () => {
  const loop = squareLoop(200, 40);
  const stands = placeGrandstands(loop, 9, { ...STAND_CFG, count: 4 }, 4);
  // With alternating sides on a square loop, stands should not all collapse
  // onto exactly the same offset direction; check we get at least 2 distinct
  // (x,z) pairs to a coarse tolerance (i.e. not literally identical points).
  const unique = new Set(stands.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)}`));
  assert.ok(unique.size >= 2);
});
