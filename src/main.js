/**
 * main.js
 *
 * Full game bootstrap. Builds a lit, shadowed scene, the physics world, the
 * designed race track (road + barriers + start/finish), and a drivable Car
 * spawned at the track's start line. It then wires the fixed-step loop so:
 *
 *   fixed update: read input -> (controls gated by the race director) advance
 *     the car + physics -> sync visuals -> feed the car position to the race
 *     director, which drives the countdown, ordered checkpoints, lap timing,
 *     best-lap tracking and the finish transition.
 *   render:       update the chase camera and the DOM HUD.
 *
 * R during a race recovers the car at the last passed checkpoint (position +
 * heading, zeroed velocity) so a spin-out is recoverable; R on the finish
 * screen restarts the race from the countdown.
 *
 * A tiny systems registry on the loop (see loop.js and src/systems/README.md)
 * lets later phases (opponent AI, audio, minimap, extra cars) layer on without
 * touching this bootstrap.
 *
 * Runs in the browser only. Bare specifiers ("three", "cannon-es") resolve via
 * the importmap in index.html, so this file cannot be imported by Node.
 */
import { CONFIG } from "./config.js";
import { RenderEngine } from "./engine/renderer.js";
import { ChaseCamera } from "./engine/camera.js";
import { InputManager } from "./engine/input.js";
import { GameLoop } from "./engine/loop.js";
import { PhysicsWorld } from "./physics/world.js";
import { Car } from "./game/car.js";
import { Track } from "./game/track.js";
import { RaceDirector, RacePhase } from "./game/raceState.js";
import { Hud } from "./game/hud.js";
import { buildEnvironment } from "./game/environment.js";
import { AudioSystem } from "./game/audioSystem.js";

function boot() {
  const canvas = document.getElementById("game");
  const loadingOverlay = document.getElementById("loading");
  const hudEl = document.getElementById("hud");

  const engine = new RenderEngine(canvas);
  engine.attachResize();

  const chaseCamera = new ChaseCamera(engine.camera);
  const input = new InputManager(window);
  input.attach();

  // Lit outdoor environment: procedural gradient sky, framed-shadow sun, a
  // cool rim light, hemisphere + ambient fill, fog matched to the sky
  // horizon, and (if enabled) a procedural PMREM reflection environment map
  // for glossy surfaces like the car body/glass.
  buildEnvironment(engine.scene, engine.scene.fog, engine.renderer);

  // Best-effort bloom postprocessing chain; falls back to a direct render
  // call if the addon CDN import fails, so boot never blocks on it.
  engine.initPostprocessing();

  // Physics world + designed track (road, barriers, checkpoints) + player car.
  const physics = new PhysicsWorld();
  const track = new Track(engine.scene, physics);
  const car = new Car(engine.scene, physics, track.spawn);
  spawnOnTrack(car, chaseCamera, track);

  // Race director owns lap state, ordered checkpoints, timing and the finish.
  const race = new RaceDirector(track.checkpointCount, track.gates);
  const hud = new Hud(document);
  race.seedPosition(car.position);

  // Synthesized engine/tire-screech audio (Web Audio API, no audio files).
  // Registered as a systems-registry system per src/systems/README.md so it
  // layers on without any changes to the core update/render wiring below.
  // Browsers block audio until a user gesture, so the AudioContext itself is
  // only created inside startAudioOnFirstGesture()'s listener.
  const audioSystem = new AudioSystem();
  startAudioOnFirstGesture(window, audioSystem);

  let firstFrameShown = false;

  // Shared context handed to any registered systems (see loop.js extension
  // seam and src/systems/README.md). Future OpponentAI / Minimap systems read
  // the live game objects from here alongside AudioSystem.
  const context = { engine, scene: engine.scene, camera: chaseCamera, car, track, race, input };

  const loop = new GameLoop({
    step: CONFIG.physics.timestep,
    maxSubSteps: CONFIG.physics.maxSubSteps,
    context,
    systems: [audioSystem],
    onUpdate: (dt) => {
      const state = input.getState();

      if (state.reset) {
        if (race.phase === RacePhase.FINISHED) {
          // R on the finish screen restarts the whole race from the countdown.
          spawnOnTrack(car, chaseCamera, track);
          race.restart();
          race.seedPosition(car.position);
        } else {
          // R mid-race recovers a spin-out at the last passed checkpoint
          // (position + heading, zeroed velocity), falling back to the grid
          // spawn if no gate has been passed yet.
          const pose = race.lastCheckpointPose;
          if (pose) {
            respawnAt(car, chaseCamera, pose.position, pose.heading);
          } else {
            spawnOnTrack(car, chaseCamera, track);
          }
          race.seedPosition(car.position);
        }
      }

      // Controls are locked during LOADING/COUNTDOWN/FINISHED: feed a neutral
      // input so the car holds still until GO.
      const controls = race.controlsLocked ? NEUTRAL_INPUT : state;

      car.update(dt, controls);
      physics.step(dt);
      car.sync();

      // A hard enough wall hit feeds the chase camera's screen-shake.
      const impact = car.lastImpact;
      if (impact && impact.speed > 0) chaseCamera.addImpact(impact.speed);

      // Advance the race clock + ordered checkpoint detection.
      race.update(dt, car.position);

      chaseCamera.update(car.position, car.heading, car.speedKmh / 3.6, dt);
    },
    onRender: () => {
      engine.render();
      hud.update(car, race);

      if (!firstFrameShown) {
        firstFrameShown = true;
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
        if (hudEl) hudEl.classList.remove("hidden");
        // Kick off the pre-race countdown once the first frame is on screen.
        race.beginCountdown();
      }
    },
  });

  loop.start();
}

/**
 * Start the (synthesized, no audio files) AudioSystem on the first user
 * gesture, satisfying the browser autoplay policy that blocks AudioContext
 * creation/playback until a click/keydown/touchstart. Listens once and
 * cleans itself up; safe to call even if the AudioSystem is disabled in
 * config (start() itself is then a no-op).
 * @param {Window} target
 * @param {AudioSystem} audioSystem
 */
function startAudioOnFirstGesture(target, audioSystem) {
  if (!target || !target.addEventListener) return;
  const events = ["pointerdown", "keydown", "touchstart"];
  const onGesture = () => {
    audioSystem.start();
    for (const evt of events) target.removeEventListener(evt, onGesture);
  };
  for (const evt of events) target.addEventListener(evt, onGesture, { once: false });
}

const NEUTRAL_INPUT = Object.freeze({
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reset: false,
  pause: false,
});

/** Place the car at the track spawn, facing along the track, and snap camera. */
function spawnOnTrack(car, chaseCamera, track) {
  respawnAt(car, chaseCamera, track.spawn, track.spawnHeading);
}

/**
 * Teleport the car to a ground pose (position + yaw heading) with velocity
 * zeroed, clear drift feedback, and snap the chase camera behind it. `position`
 * may omit y; the configured spawn height is used so the car settles onto its
 * wheels.
 * @param {Car} car
 * @param {ChaseCamera} chaseCamera
 * @param {{x:number,y?:number,z:number}} position
 * @param {number} heading yaw in radians
 */
function respawnAt(car, chaseCamera, position, heading) {
  // Build a yaw-only quaternion (about +Y) matching the heading, then use the
  // vehicle's documented reset(position, quaternion) to teleport cleanly.
  const half = heading / 2;
  const quaternion = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
  const target = {
    x: position.x,
    y: position.y ?? CONFIG.track.spawnHeight,
    z: position.z,
  };
  car.vehicle.reset(target, quaternion);
  car._steer = 0;
  car._resetDriftFeedback(target);
  car.sync();
  chaseCamera.snap(car.position, heading);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
