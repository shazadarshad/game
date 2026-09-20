/**
 * input.js
 *
 * Keyboard input manager. Tracks driving controls and exposes a normalised
 * state object each frame. Reset is edge-detected so a single R press triggers
 * exactly one reset even if the loop polls it repeatedly.
 *
 * Controls:
 *   W / Up ....... throttle
 *   S / Down ..... brake / reverse
 *   A / Left ..... steer left
 *   D / Right .... steer right
 *   Space ........ handbrake
 *   R ............ reset to last checkpoint
 *   P / Esc ...... pause (optional; consumers may ignore)
 */
export class InputManager {
  constructor(target) {
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    this.target = target ?? (typeof window !== "undefined" ? window : g);
    this.keys = Object.create(null);
    this._resetLatched = false;
    this._pauseLatched = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._attached = false;
  }

  attach() {
    if (this._attached || !this.target || !this.target.addEventListener) return;
    this.target.addEventListener("keydown", this._onKeyDown);
    this.target.addEventListener("keyup", this._onKeyUp);
    this._attached = true;
  }

  detach() {
    if (!this._attached) return;
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    this._attached = false;
  }

  _onKeyDown(event) {
    const code = event.code;
    // Prevent arrow keys and space from scrolling the page.
    if (SCROLL_KEYS.has(code)) {
      if (event.preventDefault) event.preventDefault();
    }
    this.keys[code] = true;
  }

  _onKeyUp(event) {
    this.keys[event.code] = false;
  }

  _down(...codes) {
    return codes.some((c) => this.keys[c]);
  }

  /**
   * @returns {{throttle:number, brake:number, steer:number, handbrake:boolean, reset:boolean, pause:boolean}}
   *   steer is in [-1, 1]; reset/pause are true only on the frame of the press.
   */
  getState() {
    const throttle = this._down("KeyW", "ArrowUp") ? 1 : 0;
    const brake = this._down("KeyS", "ArrowDown") ? 1 : 0;
    const left = this._down("KeyA", "ArrowLeft") ? 1 : 0;
    const right = this._down("KeyD", "ArrowRight") ? 1 : 0;
    const handbrake = this._down("Space");

    // Edge-detect reset (R) and pause (P/Esc): fire once per key press.
    const resetHeld = this._down("KeyR");
    const reset = resetHeld && !this._resetLatched;
    this._resetLatched = resetHeld;

    const pauseHeld = this._down("KeyP", "Escape");
    const pause = pauseHeld && !this._pauseLatched;
    this._pauseLatched = pauseHeld;

    return {
      throttle,
      brake,
      steer: right - left,
      handbrake,
      reset,
      pause,
    };
  }
}

const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

export default InputManager;
