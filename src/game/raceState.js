/**
 * raceState.js
 *
 * The race director: a small game-state machine driving the flow
 *   LOADING -> COUNTDOWN (3..2..1..GO) -> RACING -> FINISHED
 * and owning the presentation-facing race data (current lap, total laps, the
 * current lap's elapsed time, last lap, best lap).
 *
 * During COUNTDOWN the car controls are locked (controlsLocked === true). On GO
 * they unlock, RACING begins, and lap timing starts. When the underlying lap
 * state machine reports the final lap complete, the director transitions to
 * FINISHED.
 *
 * This module owns the lap.js pure state and the CheckpointTracker so main.js
 * only has to feed it car positions each step and read fields each frame. It
 * imports no Three/Cannon.
 */
import { CONFIG } from "../config.js";
import { createRaceState } from "./logic/lap.js";
import { CheckpointTracker } from "./checkpoints.js";

export const RacePhase = Object.freeze({
  LOADING: "LOADING",
  COUNTDOWN: "COUNTDOWN",
  RACING: "RACING",
  FINISHED: "FINISHED",
});

export class RaceDirector {
  /**
   * @param {number} numCheckpoints total gates including start/finish
   * @param {{index:number, position:object, forward:object, width:number}[]} gates
   */
  constructor(numCheckpoints, gates) {
    this.totalLaps = CONFIG.race.totalLaps;
    this.gates = gates;
    this.numCheckpoints = numCheckpoints;

    this.phase = RacePhase.LOADING;
    this.controlsLocked = true;

    // Wall-clock accumulator (ms) driven by the fixed loop.
    this._clockMs = 0;
    // When the countdown started (ms on the internal clock).
    this._countdownStartMs = 0;
    // Total race time from GO until finish (ms).
    this.raceTimeMs = 0;
    this._raceStartMs = 0;

    // Countdown display value: 3, 2, 1, then "GO!" then "".
    this.countdownText = String(CONFIG.race.countdownSeconds);

    this._buildLapState();
  }

  _buildLapState() {
    this.lapState = createRaceState(this.numCheckpoints, this.totalLaps);
    this.tracker = new CheckpointTracker(this.gates, this.lapState, {
      onCheckpoint: (index) => {
        if (this._onCheckpoint) this._onCheckpoint(index);
      },
      onLapComplete: (lapTimeMs, bestLapMs, lap) => {
        if (this._onLapComplete) this._onLapComplete(lapTimeMs, bestLapMs, lap);
      },
      onFinish: (lapTimeMs, bestLapMs) => {
        this._finish(lapTimeMs, bestLapMs);
      },
    });
  }

  /** Register external event listeners (optional). */
  on(events) {
    this._onCheckpoint = events.onCheckpoint;
    this._onLapComplete = events.onLapComplete;
    this._onFinish = events.onFinish;
    this._onGo = events.onGo;
    this._onCountdownTick = events.onCountdownTick;
  }

  /** Begin the pre-race countdown. Called once assets/first frame are ready. */
  beginCountdown() {
    if (this.phase !== RacePhase.LOADING) return;
    this.phase = RacePhase.COUNTDOWN;
    this.controlsLocked = true;
    this._countdownStartMs = this._clockMs;
    this.countdownText = String(CONFIG.race.countdownSeconds);
    if (this._onCountdownTick) this._onCountdownTick(this.countdownText);
  }

  /**
   * Advance the race clock and state machine by one fixed step.
   * @param {number} dt seconds
   * @param {{x:number,z:number}} carPosition current car ground position
   */
  update(dt, carPosition) {
    this._clockMs += dt * 1000;

    if (this.phase === RacePhase.COUNTDOWN) {
      this._updateCountdown();
    }

    // Once controls are unlocked (from the "GO!" beat onward) and the race is
    // not finished, advance the race clock and ordered checkpoint detection.
    // This covers both the brief "GO!" hold (still COUNTDOWN) and RACING.
    if (!this.controlsLocked && this.phase !== RacePhase.FINISHED) {
      this.raceTimeMs = this._clockMs - this._raceStartMs;
      this.tracker.update(carPosition, this.raceTimeMs);
    }
  }

  _updateCountdown() {
    const interval = CONFIG.race.countdownIntervalMs;
    const total = CONFIG.race.countdownSeconds;
    const elapsed = this._clockMs - this._countdownStartMs;
    const step = Math.floor(elapsed / interval);

    if (step < total) {
      const text = String(total - step);
      if (text !== this.countdownText) {
        this.countdownText = text;
        if (this._onCountdownTick) this._onCountdownTick(text);
      }
      return;
    }

    // The "GO!" beat: display GO! and immediately unlock controls / start
    // timing, but stay in COUNTDOWN briefly so the HUD can render "GO!".
    if (this.countdownText !== "GO!") {
      this.countdownText = "GO!";
      if (this._onCountdownTick) this._onCountdownTick("GO!");
      this._go();
    }

    // After holding "GO!" briefly, leave the countdown phase so the overlay
    // hides and racing continues uninterrupted.
    const goElapsed = elapsed - total * interval;
    if (goElapsed >= CONFIG.race.goHoldMs) {
      this.phase = RacePhase.RACING;
      this.countdownText = "";
      if (this._onCountdownTick) this._onCountdownTick("");
    }
  }

  _go() {
    // Unlock controls and start the race clock now. The phase flips to RACING a
    // short moment later (after the "GO!" text has been shown) in
    // _updateCountdown(); until then controls are already free so the launch
    // feels responsive.
    this.controlsLocked = false;
    this._raceStartMs = this._clockMs;
    this.raceTimeMs = 0;
    if (this._onGo) this._onGo();
  }

  _finish(lapTimeMs, bestLapMs) {
    this.phase = RacePhase.FINISHED;
    this.controlsLocked = true;
    this.finalTimeMs = this.raceTimeMs;
    if (this._onFinish) this._onFinish(this.finalTimeMs, bestLapMs);
  }

  /**
   * Restart the whole race from the countdown. Resets lap state and clocks.
   */
  restart() {
    this._buildLapState();
    this.phase = RacePhase.LOADING;
    this.controlsLocked = true;
    this.raceTimeMs = 0;
    this.finalTimeMs = undefined;
    this.countdownText = String(CONFIG.race.countdownSeconds);
    this.beginCountdown();
  }

  /** Seed the checkpoint tracker's previous position (after a car teleport). */
  seedPosition(position) {
    this.tracker.seed(position);
  }

  /**
   * Index of the last gate the car legally passed this lap, or -1 if none have
   * been passed yet (still on the opening run to the start line). Derived from
   * the lap state's nextCheckpoint: the previous gate in the ordered sequence.
   * @returns {number}
   */
  get lastPassedGateIndex() {
    const s = this.lapState;
    // Before timing starts, nothing has been passed.
    if (s.lapStartTimeMs === null) return -1;
    const next = s.nextCheckpoint;
    // nextCheckpoint === 0 means every intermediate gate is cleared and the car
    // is heading for the start/finish line; the last passed gate is the final
    // intermediate one.
    if (next <= 0) return this.numCheckpoints - 1;
    // next === 1 means only the start line has been crossed this lap.
    return next - 1;
  }

  /**
   * Respawn pose (ground position + heading) at the last passed gate, so a
   * spun-out car can recover mid-race. Returns null when no gate has been
   * passed yet (caller should fall back to the global spawn).
   * @returns {{position:{x:number,z:number}, heading:number}|null}
   */
  get lastCheckpointPose() {
    const idx = this.lastPassedGateIndex;
    if (idx < 0) return null;
    const gate = this.gates[idx];
    if (!gate) return null;
    // Heading matches how spawn headings are derived elsewhere: atan2(fx, fz).
    const heading = Math.atan2(gate.forward.x, gate.forward.z);
    return {
      position: { x: gate.position.x, z: gate.position.z },
      heading,
    };
  }

  // ---- Presentation getters --------------------------------------------------

  /** 1-based current lap for display, clamped to totalLaps. */
  get currentLap() {
    return Math.min(this.lapState.lap + 1, this.totalLaps);
  }

  get lastLapMs() {
    return this.lapState.lastLapMs;
  }

  get bestLapMs() {
    return this.lapState.bestLapMs;
  }

  /** Elapsed time (ms) of the current lap, or 0 outside RACING. */
  get currentLapTimeMs() {
    if (this.phase !== RacePhase.RACING) return 0;
    if (this.lapState.lapStartTimeMs === null) return this.raceTimeMs;
    return this.raceTimeMs - this.lapState.lapStartTimeMs;
  }

  get finished() {
    return this.phase === RacePhase.FINISHED;
  }
}

export default RaceDirector;
