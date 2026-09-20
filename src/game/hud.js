/**
 * hud.js
 *
 * Reads the race director state each render frame and updates the DOM HUD
 * elements defined in index.html: the speedometer, current lap timer, lap
 * counter, best-lap display, the countdown overlay text, and a finish panel.
 *
 * This module performs only DOM reads/writes; it imports nothing from Three or
 * Cannon. It is validated by node --check syntax + structural assertions rather
 * than headless render.
 */
import { formatLapTime } from "./logic/format.js";
import { RacePhase } from "./raceState.js";

export class Hud {
  /**
   * @param {Document} [doc] defaults to the global document
   */
  constructor(doc) {
    this.doc =
      doc ?? (typeof document !== "undefined" ? document : undefined);
    if (!this.doc) return;

    this.speedometer = this.doc.getElementById("speedometer");
    this.lapTimer = this.doc.getElementById("lap-timer");
    this.lapCounter = this.doc.getElementById("lap-counter");
    this.bestLap = this.doc.getElementById("best-lap");
    this.countdown = this.doc.getElementById("countdown");
    this.countdownText = this.doc.getElementById("countdown-text");
    this.finishPanel = this.doc.getElementById("finish-panel");
    this.finishTime = this.doc.getElementById("finish-time");
    this.finishBest = this.doc.getElementById("finish-best");
  }

  /**
   * Update every HUD element from the current car + race state.
   * @param {{speedKmh:number}} car
   * @param {import('./raceState.js').RaceDirector} race
   */
  update(car, race) {
    if (!this.doc) return;

    if (this.speedometer) {
      this.speedometer.textContent = String(Math.round(car.speedKmh));
    }

    if (this.lapCounter) {
      this.lapCounter.textContent = `${race.currentLap} / ${race.totalLaps}`;
    }

    if (this.lapTimer) {
      this.lapTimer.textContent = formatLapTime(race.currentLapTimeMs);
    }

    if (this.bestLap) {
      this.bestLap.textContent =
        race.bestLapMs === null || race.bestLapMs === undefined
          ? "--:--.---"
          : formatLapTime(race.bestLapMs);
    }

    this._updateCountdown(race);
    this._updateFinish(race);
  }

  _updateCountdown(race) {
    if (!this.countdown) return;
    const showing =
      race.phase === RacePhase.COUNTDOWN && race.countdownText !== "";
    if (this.countdownText && showing) {
      this.countdownText.textContent = race.countdownText;
    }
    this.countdown.classList.toggle("hidden", !showing);
  }

  _updateFinish(race) {
    if (!this.finishPanel) return;
    const finished = race.phase === RacePhase.FINISHED;
    this.finishPanel.classList.toggle("hidden", !finished);
    if (!finished) return;
    if (this.finishTime) {
      this.finishTime.textContent = formatLapTime(
        race.finalTimeMs ?? race.raceTimeMs,
      );
    }
    if (this.finishBest) {
      this.finishBest.textContent =
        race.bestLapMs === null || race.bestLapMs === undefined
          ? "--:--.---"
          : formatLapTime(race.bestLapMs);
    }
  }
}

export default Hud;
