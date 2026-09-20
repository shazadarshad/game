/**
 * systems.test.js
 *
 * Unit tests for the GameLoop systems registry (the extension seam used by
 * future OpponentAI / Audio / Minimap systems). Driven deterministically via
 * the loop's injectable time source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GameLoop } from "../src/engine/loop.js";

function fixedLoop(extra = {}) {
  return new GameLoop({
    step: 1 / 60,
    now: () => 0,
    raf: () => 0,
    cancel: () => {},
    ...extra,
  });
}

test("registered systems update after the core update, with the shared ctx", () => {
  const order = [];
  const ctx = { tag: "shared" };
  let seenCtx = null;
  const loop = fixedLoop({
    context: ctx,
    onUpdate: () => order.push("core"),
  });
  loop.addSystem({
    update: (dt, c) => {
      order.push("system");
      seenCtx = c;
    },
  });
  loop._lastTime = 0;
  loop.advance(1000 / 60 + 0.5); // exactly one fixed step
  assert.deepEqual(order, ["core", "system"]);
  assert.equal(seenCtx, ctx);
});

test("system render runs once per frame after core render", () => {
  let coreRenders = 0;
  let sysRenders = 0;
  const loop = fixedLoop({ onRender: () => coreRenders++ });
  loop.addSystem({ render: () => sysRenders++ });
  loop._lastTime = 0;
  loop.advance(50); // several updates, one render pass
  assert.equal(coreRenders, 1);
  assert.equal(sysRenders, 1);
});

test("addSystem ignores duplicates and removeSystem detaches", () => {
  const loop = fixedLoop();
  let ticks = 0;
  const sys = { update: () => ticks++ };
  loop.addSystem(sys);
  loop.addSystem(sys); // duplicate ignored
  assert.equal(loop.systems.length, 1);

  loop._lastTime = 0;
  loop.advance(1000 / 60 + 0.5);
  assert.equal(ticks, 1);

  assert.equal(loop.removeSystem(sys), true);
  assert.equal(loop.removeSystem(sys), false);
  loop.advance(2000 / 60);
  assert.equal(ticks, 1); // no further ticks after removal
});

test("systems accepts an initial array via options", () => {
  let ticks = 0;
  const loop = fixedLoop({ systems: [{ update: () => ticks++ }] });
  loop._lastTime = 0;
  loop.advance(1000 / 60 + 0.5);
  assert.equal(ticks, 1);
});

test("a system missing update or render is safely skipped", () => {
  const loop = fixedLoop();
  loop.addSystem({}); // no methods
  loop._lastTime = 0;
  assert.doesNotThrow(() => loop.advance(50));
});
