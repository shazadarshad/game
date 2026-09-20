/**
 * main.js
 *
 * Minimal engine bootstrap for FEAT-001. Builds a lit, shadowed scene with a
 * ground plane and a placeholder box, wires the chase camera to the box, and
 * spins the box inside the fixed-timestep loop. Later features replace the
 * placeholder with the real car and track.
 *
 * Runs in the browser only. Bare specifiers ("three") resolve via the
 * importmap in index.html, so this file cannot be imported by Node.
 */
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { RenderEngine } from "./engine/renderer.js";
import { ChaseCamera } from "./engine/camera.js";
import { InputManager } from "./engine/input.js";
import { GameLoop } from "./engine/loop.js";

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

  const box = buildPlaceholderCar();
  engine.scene.add(box);

  // Placeholder motion state driven by the loop.
  let heading = 0;
  let firstFrameShown = false;

  const loop = new GameLoop({
    step: CONFIG.physics.timestep,
    maxSubSteps: CONFIG.physics.maxSubSteps,
    onUpdate: (dt) => {
      const state = input.getState();

      // Simple placeholder kinematics so the camera has something to chase:
      // steer rotates the box, throttle drives it forward along its heading.
      heading += state.steer * 1.4 * dt;
      const speed = (state.throttle - state.brake) * 12; // m/s
      box.position.x += Math.sin(heading) * speed * dt;
      box.position.z += Math.cos(heading) * speed * dt;
      box.rotation.y = heading;
      box.rotation.x = 0;

      if (state.reset) {
        box.position.set(0, 0.6, 0);
        heading = 0;
        chaseCamera.snap(box.position, heading);
      }

      chaseCamera.update(box.position, heading, speed, dt);
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

  chaseCamera.snap(box.position, heading);
  loop.start();
}

function buildEnvironment(scene) {
  // Ground plane.
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

function buildPlaceholderCar() {
  const geo = new THREE.BoxGeometry(1.9, 0.9, 4.0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd23f3f,
    roughness: 0.4,
    metalness: 0.3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0.6, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
