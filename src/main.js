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
 * R resets the car to the track spawn during a race, and restarts the race from
 * the countdown once finished.
 *
 * Runs in the browser only. Bare specifiers ("three", "cannon-es") resolve via
 * the importmap in index.html, so this file cannot be imported by Node.
 */
import * as THREE from "three";
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

function boot() {
  const canvas = document.getElementById("game");
  const loadingOverlay = document.getElementById("loading");
  const hudEl = document.getElementById("hud");

  const engine = new RenderEngine(canvas);
  engine.attachResize();

  const chaseCamera = new ChaseCamera(engine.camera);
  const input = new InputManager(window);
  input.attach();

  buildLighting(engine.scene);

  // Physics world + designed track (road, barriers, checkpoints) + player car.
  const physics = new PhysicsWorld();
  const track = new Track(engine.scene, physics);
  const car = new Car(engine.scene, physics, track.spawn);
  spawnOnTrack(car, chaseCamera, track);

  // Race director owns lap state, ordered checkpoints, timing and the finish.
  const race = new RaceDirector(track.checkpointCount, track.gates);
  const hud = new Hud(document);
  race.seedPosition(car.position);

  let firstFrameShown = false;

  const loop = new GameLoop({
    step: CONFIG.physics.timestep,
    maxSubSteps: CONFIG.physics.maxSubSteps,
    onUpdate: (dt) => {
      const state = input.getState();

      if (state.reset) {
        if (race.phase === RacePhase.FINISHED) {
          spawnOnTrack(car, chaseCamera, track);
          race.restart();
          race.seedPosition(car.position);
        } else {
          spawnOnTrack(car, chaseCamera, track);
          race.seedPosition(car.position);
        }
      }

      // Controls are locked during LOADING/COUNTDOWN/FINISHED: feed a neutral
      // input so the car holds still until GO.
      const controls = race.controlsLocked ? NEUTRAL_INPUT : state;

      car.update(dt, controls);
      physics.step(dt);
      car.sync();

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
  // Build a yaw-only quaternion (about +Y) matching the spawn heading, then use
  // the vehicle's documented reset(position, quaternion) to teleport cleanly.
  const half = track.spawnHeading / 2;
  const quaternion = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
  car.vehicle.reset(track.spawn, quaternion);
  car._steer = 0;
  car.sync();
  chaseCamera.snap(car.position, track.spawnHeading);
}

function buildLighting(scene) {
  // Ambient fill so shadowed faces are not pure black.
  const ambient = new THREE.HemisphereLight(0xbfd8ff, 0x3a4a2f, 0.7);
  scene.add(ambient);

  // Key directional light with shadow.
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(80, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.near = 1;
  cam.far = 500;
  cam.left = -180;
  cam.right = 180;
  cam.top = 180;
  cam.bottom = -180;
  scene.add(sun);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
