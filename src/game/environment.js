/**
 * environment.js
 *
 * Builds the lit outdoor environment for the race scene: a procedural gradient
 * sky dome (generated on an offscreen canvas so it needs NO network asset), a
 * directional "sun" whose shadow camera is framed around the whole track, a
 * hemisphere fill light, and a low ambient floor. Fog is matched to the sky
 * horizon colour so the world fades cleanly into the background.
 *
 * All tunables come from CONFIG.render and CONFIG.environment. The car and the
 * barriers already opt into casting/receiving shadows in their own modules;
 * this module only sets up the lights and the shadow camera that make those
 * shadows appear.
 *
 * Runs in the browser only ("three" resolves via the importmap).
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";

/**
 * Assemble the environment into a scene and return the light handles so callers
 * can tweak or dispose them later.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Fog} [fog] optional existing fog to recolour to the sky horizon
 * @returns {{sun:THREE.DirectionalLight, hemisphere:THREE.HemisphereLight, ambient:THREE.AmbientLight, sky:THREE.Mesh}}
 */
export function buildEnvironment(scene, fog) {
  const env = CONFIG.environment;

  // ---- Procedural gradient sky dome ----------------------------------------
  const sky = buildSkyDome();
  scene.add(sky);

  // Match the fog + scene background tint to the sky horizon so distant geometry
  // dissolves into the sky rather than a flat clear colour.
  const horizon = new THREE.Color(env.skyHorizonColor);
  if (fog) fog.color.copy(horizon);

  // ---- Sun (key directional light with framed shadow camera) ---------------
  const sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity);
  sun.position.set(env.sunPosition.x, env.sunPosition.y, env.sunPosition.z);
  sun.castShadow = CONFIG.render.shadows;
  sun.shadow.mapSize.set(env.shadowMapSize, env.shadowMapSize);
  const size = env.shadowCameraSize;
  const cam = sun.shadow.camera;
  cam.near = 1;
  cam.far = 700;
  cam.left = -size;
  cam.right = size;
  cam.top = size;
  cam.bottom = -size;
  cam.updateProjectionMatrix();
  sun.shadow.bias = env.shadowBias;
  // Aim the sun at the middle of the track so the framed shadow box is centred.
  sun.target.position.set(60, 0, 60);
  scene.add(sun);
  scene.add(sun.target);

  // ---- Hemisphere fill + ambient floor -------------------------------------
  const hemisphere = new THREE.HemisphereLight(
    env.skyFillColor,
    env.groundFillColor,
    env.hemisphereIntensity,
  );
  hemisphere.position.set(0, 60, 0);
  scene.add(hemisphere);

  const ambient = new THREE.AmbientLight(env.ambientColor, env.ambientIntensity);
  scene.add(ambient);

  return { sun, hemisphere, ambient, sky };
}

/**
 * Build a large inward-facing sphere whose material samples a top -> horizon
 * gradient texture painted on a 2D canvas. No image is fetched from the network;
 * the texture is generated at runtime. Falls back to a vertex-coloured dome if
 * a 2D canvas context is unavailable.
 *
 * @returns {THREE.Mesh}
 */
export function buildSkyDome() {
  const env = CONFIG.environment;
  const geo = new THREE.SphereGeometry(env.skyRadius, 32, 16);

  const texture = makeGradientTexture(
    env.skyTopColor,
    env.skyHorizonColor,
  );

  const mat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  if (texture) {
    mat.map = texture;
  } else {
    // Fallback: solid horizon colour if we could not build a canvas texture.
    mat.color = new THREE.Color(env.skyHorizonColor);
  }

  const sky = new THREE.Mesh(geo, mat);
  sky.name = "sky-dome";
  // The sky should never be culled or cast/receive shadows.
  sky.frustumCulled = false;
  sky.castShadow = false;
  sky.receiveShadow = false;
  return sky;
}

/**
 * Paint a vertical top -> bottom gradient onto a canvas and wrap it as a Three
 * texture. Returns null if no 2D canvas is available (e.g. non-browser).
 *
 * @param {number} topColor hex colour at the top of the sky
 * @param {number} bottomColor hex colour at the horizon
 * @returns {THREE.CanvasTexture|null}
 */
export function makeGradientTexture(topColor, bottomColor) {
  if (typeof document === "undefined" || !document.createElement) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return null;

  const top = "#" + new THREE.Color(topColor).getHexString();
  const bottom = "#" + new THREE.Color(bottomColor).getHexString();
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export default buildEnvironment;
