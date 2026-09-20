/**
 * renderer.js
 *
 * Thin wrapper around THREE.WebGLRenderer + Scene + PerspectiveCamera. Handles
 * pixel-ratio capping, soft shadows, fog, and window resizing.
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

    this._onResize = this._onResize.bind(this);
    this._resize();
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
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

export default RenderEngine;
