/**
 * renderer.js
 *
 * Thin wrapper around THREE.WebGLRenderer + Scene + PerspectiveCamera. Handles
 * pixel-ratio capping, soft shadows, fog, window resizing, and an optional
 * postprocessing chain (EffectComposer + UnrealBloomPass + OutputPass, loaded
 * from the same three/addons/ CDN prefix already used for other addons).
 *
 * Postprocessing is best-effort: if CONFIG.render.postprocessing.enabled is
 * false, or the addon modules fail to load (e.g. offline sandbox with no
 * browser), render() falls back to a direct renderer.render(scene, camera)
 * call so the game is never blocked on the composer.
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";

export class RenderEngine {
  /**
   * @param {HTMLCanvasElement} canvas render target
   */
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, CONFIG.render.pixelRatioCap),
    );
    this.renderer.setClearColor(CONFIG.render.clearColor);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic tone mapping for a more natural highlight rolloff outdoors.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.render.toneMappingExposure ?? 1;

    if (CONFIG.render.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.render.clearColor);
    this.scene.fog = new THREE.Fog(
      CONFIG.render.fogColor,
      CONFIG.render.fogNear,
      CONFIG.render.fogFar,
    );

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.render.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    this.camera.position.set(0, 6, 12);
    this.camera.lookAt(0, 0, 0);

    // Postprocessing composer, built lazily/async (see initPostprocessing) so
    // construction of RenderEngine itself never depends on the addon CDN
    // resolving. `render()` uses it once ready; until then it falls back to a
    // direct render call.
    this._composer = null;

    this._onResize = this._onResize.bind(this);
    this._resize();
  }

  /**
   * Attempt to build the bloom postprocessing chain. Safe to call once; no-op
   * if disabled in config or if the addon imports fail (offline/CDN
   * unreachable), in which case render() keeps using the direct render path.
   * Returns a promise so callers may await it, but it is not required to.
   */
  async initPostprocessing() {
    if (!CONFIG.render.postprocessing?.enabled) return;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] =
        await Promise.all([
          import("three/addons/postprocessing/EffectComposer.js"),
          import("three/addons/postprocessing/RenderPass.js"),
          import("three/addons/postprocessing/UnrealBloomPass.js"),
          import("three/addons/postprocessing/OutputPass.js"),
        ]);

      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));

      const bloomCfg = CONFIG.render.postprocessing;
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        bloomCfg.bloomStrength ?? 0.55,
        bloomCfg.bloomRadius ?? 0.45,
        bloomCfg.bloomThreshold ?? 0.82,
      );
      composer.addPass(bloom);
      this._bloomPass = bloom;

      // OutputPass applies the renderer's configured tone mapping/colour
      // space as the final pass, so the composer output matches what a plain
      // renderer.render() call would have produced tonally.
      composer.addPass(new OutputPass());

      composer.setSize(window.innerWidth, window.innerHeight);
      this._composer = composer;
    } catch (err) {
      // CDN unreachable, addon path mismatch, or non-browser context: keep
      // rendering directly without bloom rather than breaking the game.
      if (typeof console !== "undefined" && console.warn) {
        console.warn("Bloom postprocessing unavailable, rendering without it:", err);
      }
      this._composer = null;
    }
  }

  /** Register the window resize handler. */
  attachResize() {
    window.addEventListener("resize", this._onResize);
  }

  detachResize() {
    window.removeEventListener("resize", this._onResize);
  }

  _onResize() {
    this._resize();
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this._composer) this._composer.setSize(w, h);
    if (this._bloomPass) this._bloomPass.setSize(w, h);
  }

  render() {
    if (this._composer) {
      this._composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

export default RenderEngine;
