/**
 * loop.js
 *
 * Fixed-timestep game loop using the accumulator pattern. Update runs at a
 * fixed dt (deterministic physics/logic); render receives an interpolation
 * alpha for smooth visuals between simulation steps.
 *
 * Framework-agnostic on purpose: no Three imports, so the timing logic is
 * unit-testable. requestAnimationFrame/performance.now are injectable for the
 * same reason.
 *
 * EXTENSION SEAM (systems registry)
 * ---------------------------------
 * Beyond the core onUpdate/onRender callbacks, the loop keeps an ordered list
 * of "systems". A system is any object shaped like:
 *
 *   { update(dt, ctx) {}, render(alpha, ctx) {} }   // both methods optional
 *
 * Register one with loop.addSystem(system); systems run every fixed step
 * (update) and every frame (render), in registration order, AFTER the core
 * onUpdate/onRender so they see the freshly stepped world. `ctx` is a shared
 * object supplied via options.context (e.g. { car, race, scene, camera, input })
 * so later phases can layer on without touching the core wiring:
 *
 *   loop.addSystem(new OpponentAISystem(track, cars));  // steers AI cars
 *   loop.addSystem(new AudioSystem(car));               // engine/skid audio
 *   loop.addSystem(new MinimapSystem(track, cars));      // 2D overlay
 *
 * See src/systems/README.md for the full contract. Removing a system is
 * loop.removeSystem(system). This is intentionally tiny: no priorities, no
 * dependency graph, just deterministic ordered fan-out.
 */
export class GameLoop {
  /**
   * @param {object} [options]
   * @param {number} [options.step] fixed update step in seconds
   * @param {number} [options.maxSubSteps] cap on updates per frame (spiral-of-death guard)
   * @param {(dt:number, elapsed:number)=>void} [options.onUpdate]
   * @param {(alpha:number, elapsed:number)=>void} [options.onRender]
   * @param {object} [options.context] shared ctx passed to every system's update/render
   * @param {Array<{update?:Function, render?:Function}>} [options.systems] initial systems
   * @param {() => number} [options.now] time source in ms
   * @param {(cb:(t:number)=>void)=>number} [options.raf] frame scheduler
   * @param {(id:number)=>void} [options.cancel] frame canceller
   */
  constructor(options = {}) {
    this.step = options.step ?? 1 / 60;
    this.maxSubSteps = options.maxSubSteps ?? 5;
    this.onUpdate = options.onUpdate ?? (() => {});
    this.onRender = options.onRender ?? (() => {});

    // Extension seam: ordered list of pluggable systems and a shared context.
    this.context = options.context ?? {};
    this.systems = Array.isArray(options.systems) ? [...options.systems] : [];

    const g = typeof globalThis !== "undefined" ? globalThis : {};
    this._now =
      options.now ??
      (g.performance && typeof g.performance.now === "function"
        ? () => g.performance.now()
        : () => Date.now());
    this._raf =
      options.raf ??
      (typeof g.requestAnimationFrame === "function"
        ? g.requestAnimationFrame.bind(g)
        : (cb) => setTimeout(() => cb(this._now()), this.step * 1000));
    this._cancel =
      options.cancel ??
      (typeof g.cancelAnimationFrame === "function"
        ? g.cancelAnimationFrame.bind(g)
        : (id) => clearTimeout(id));

    this.running = false;
    this.elapsed = 0; // total simulated seconds
    this._accumulator = 0;
    this._lastTime = 0;
    this._frameId = null;
    this._tick = this._tick.bind(this);
  }

  /**
   * Register a system. Returns the system so callers can hold a handle.
   * @param {{update?:Function, render?:Function}} system
   * @returns {{update?:Function, render?:Function}}
   */
  addSystem(system) {
    if (system && !this.systems.includes(system)) this.systems.push(system);
    return system;
  }

  /**
   * Remove a previously registered system.
   * @param {{update?:Function, render?:Function}} system
   * @returns {boolean} true if it was registered and removed
   */
  removeSystem(system) {
    const i = this.systems.indexOf(system);
    if (i === -1) return false;
    this.systems.splice(i, 1);
    return true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = this._now();
    this._accumulator = 0;
    this._frameId = this._raf(this._tick);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this._frameId != null) this._cancel(this._frameId);
    this._frameId = null;
  }

  /**
   * Advance one animation frame worth of time. Public so tests can drive it
   * deterministically without a real RAF clock.
   * @param {number} time current time in ms
   */
  advance(time) {
    let frameTime = (time - this._lastTime) / 1000;
    this._lastTime = time;

    // Clamp huge gaps (tab was backgrounded) to avoid a burst of catch-up.
    const maxFrame = this.step * this.maxSubSteps;
    if (frameTime > maxFrame) frameTime = maxFrame;
    if (frameTime < 0) frameTime = 0;

    this._accumulator += frameTime;

    let steps = 0;
    while (this._accumulator >= this.step && steps < this.maxSubSteps) {
      this.onUpdate(this.step, this.elapsed);
      // Registered systems advance after the core update so they observe the
      // freshly stepped world state.
      for (const sys of this.systems) {
        if (typeof sys.update === "function") sys.update(this.step, this.context);
      }
      this.elapsed += this.step;
      this._accumulator -= this.step;
      steps += 1;
    }

    const alpha = this._accumulator / this.step;
    this.onRender(alpha, this.elapsed);
    for (const sys of this.systems) {
      if (typeof sys.render === "function") sys.render(alpha, this.context);
    }
  }

  _tick(time) {
    if (!this.running) return;
    this.advance(time);
    this._frameId = this._raf(this._tick);
  }
}

export default GameLoop;
