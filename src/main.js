/**
 * main.js
 *
 * Engine + game bootstrap. Builds a lit, shadowed scene with a flat ground,
 * creates the physics world and a real drivable Car, then wires the fixed-step
 * loop so input drives the car, the physics world advances, and the chase
 * camera follows the car each render. The real track arrives in FEAT-003.
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

const SPAWN = { x: 0, y: 1.5, z: 0 };

function boot() {
  const canvas = document.getElementById("game");
  const loadingOverlay = document.getElementById("loading");
  const hud = document.getElementById("hud");

  const engine = new RenderEngine(canvas);
  engine.attachResize();

  const chaseCamera = new ChaseCamera(engine.camera);
  const input = new InputManager(window);
  input.attach();

  buildEnvironment(engine.scene);

  // Physics world + player car (replaces the FEAT-001 placeholder box).
  const physics = new PhysicsWorld();
  const car = new Car(engine.scene, physics, SPAWN);

  let firstFrameShown = false;

  const loop = new GameLoop({
    step: CONFIG.physics.timestep,
    maxSubSteps: CONFIG.physics.maxSubSteps,
    onUpdate: (dt) => {
      const state = input.getState();

      if (state.reset) {
        car.reset(SPAWN);
        chaseCamera.snap(car.position, car.heading);
      }

      // Set vehicle controls, then advance the simulation for this fixed step.
      car.update(dt, state);
      physics.step(dt);
      // Re-sync visuals to the freshly solved transforms.
      car.sync();

      chaseCamera.update(car.position, car.heading, car.speedKmh / 3.6, dt);
    },
    onRender: () => {
      engine.render();
      if (!firstFrameShown) {
        firstFrameShown = true;
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
        if (hud) hud.classList.remove("hidden");
      }
    },
  });

  chaseCamera.snap(car.position, car.heading);
  loop.start();
}

function buildEnvironment(scene) {
  // Ground plane (visual). The physics ground is an infinite plane in
  // PhysicsWorld; this mesh is just what the player sees.
  const groundGeo = new THREE.PlaneGeometry(
    CONFIG.world.groundSize,
    CONFIG.world.groundSize,
  );
  const groundMat = new THREE.MeshStandardMaterial({
    color: CONFIG.world.groundColor,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Ambient fill so shadowed faces are not pure black.
  const ambient = new THREE.HemisphereLight(0xbfd8ff, 0x3a4a2f, 0.7);
  scene.add(ambient);

  // Key directional light with shadow.
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(60, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.near = 1;
  cam.far = 400;
  cam.left = -120;
  cam.right = 120;
  cam.top = 120;
  cam.bottom = -120;
  scene.add(sun);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
