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
import { needleAngle, isRedline, describeArc, redlineStartAngle } from "./logic/dial.js";
import { speedLineOpacity } from "./logic/speedfx.js";
import { CONFIG } from "../config.js";

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
    this.finishLapList = this.doc.getElementById("finish-lap-list");

    // Dial speedometer.
    this.dialNeedle = this.doc.getElementById("dial-needle");
    this.dialTrack = this.doc.getElementById("dial-track");
    this.dialRedline = this.doc.getElementById("dial-redline");
    this.gearIndicator = this.doc.getElementById("gear-indicator");
    this.driftCallout = this.doc.getElementById("drift-callout");
    this.speedLines = this.doc.getElementById("speed-lines");

    this._drawDialArcs();
  }

  /** Paint the static track + redline arcs once (they never move). */
  _drawDialArcs() {
    const cfg = CONFIG.hud;
    const cx = 100;
    const cy = 100;
    const radius = 78;
    if (this.dialTrack) {
      this.dialTrack.setAttribute(
        "d",
        describeArc(cx, cy, radius, cfg.speedoStartAngle, cfg.speedoEndAngle),
      );
    }
    if (this.dialRedline) {
      this.dialRedline.setAttribute(
        "d",
        describeArc(cx, cy, radius, redlineStartAngle(cfg), cfg.speedoEndAngle),
      );
    }
  }

  /**
   * Update every HUD element from the current car + race state.
   * @param {{speedKmh:number, drifting?:boolean}} car
   * @param {import('./raceState.js').RaceDirector} race
   */
  update(car, race) {
    if (!this.doc) return;

    const speedKmh = car.speedKmh;
    const redline = isRedline(speedKmh, CONFIG.hud);

    if (this.speedometer) {
      this.speedometer.textContent = String(Math.round(speedKmh));
      this.speedometer.classList.toggle("redline", redline);
    }

    if (this.dialNeedle) {
      const angle = needleAngle(speedKmh, CONFIG.hud);
      this.dialNeedle.style.transform = `rotate(${angle}deg)`;
      this.dialNeedle.classList.toggle("redline", redline);
    }

    if (this.gearIndicator) {
      // Simple arcade gear readout: R while reversing (negative signed
      // speed), otherwise D. The car only exposes unsigned speedKmh, so this
      // reads the sign hint from the car if available and falls back to D.
      const reversing = !!car.reversing;
      this.gearIndicator.textContent = reversing ? "R" : "D";
      this.gearIndicator.classList.toggle("reverse", reversing);
    }

    if (this.driftCallout) {
      this.driftCallout.classList.toggle("show", !!car.drifting);
    }

    if (this.speedLines) {
      const opacity = speedLineOpacity(speedKmh, CONFIG.fx.speedLines);
      this.speedLines.style.opacity = String(opacity);
      this.speedLines.classList.toggle("hidden", opacity <= 0);
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
    if (this.countdownText && showing && this.countdownText.textContent !== race.countdownText) {
      this.countdownText.textContent = race.countdownText;
      // Re-trigger the CSS "pop" animation for each new number/GO! by forcing
      // a reflow between removing and re-adding the animation.
      this.countdownText.style.animation = "none";
      // eslint-disable-next-line no-unused-expressions
      this.countdownText.offsetHeight;
      this.countdownText.style.animation = "";
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
    this._renderLapList(race);
  }

  /** Render a per-lap time list on the finish panel, best lap highlighted. */
  _renderLapList(race) {
    if (!this.finishLapList) return;
    const lapTimes = race.lapState?.lapTimes ?? [];
    if (this._renderedLapCount === lapTimes.length) return; // avoid re-render churn
    this._renderedLapCount = lapTimes.length;

    this.finishLapList.textContent = "";
    const bestMs = race.bestLapMs;
    lapTimes.forEach((ms, i) => {
      const row = this.doc.createElement("div");
      row.className = "lap-row" + (ms === bestMs ? " best" : "");
      const label = this.doc.createElement("span");
      label.textContent = `Lap ${i + 1}`;
      const value = this.doc.createElement("span");
      value.textContent = formatLapTime(ms);
      row.appendChild(label);
      row.appendChild(value);
      this.finishLapList.appendChild(row);
    });
  }
}

export default Hud;
