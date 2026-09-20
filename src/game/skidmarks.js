/**
 * skidmarks.js
 *
 * A fixed-size POOL of tire-skid decals laid on the road while the car drifts,
 * plus a light tire-smoke puff. The pool is allocated once (CONFIG.handling
 * .skidMarkPool quads) and reused round-robin: when every quad is alive the
 * oldest is recycled, so the object count is bounded and nothing leaks.
 *
 * Each drop places one small dark quad flat on the road under a rear wheel.
 * Marks fade from their spawn opacity to zero over CONFIG.handling
 * .skidMarkLifetime seconds and are then available for reuse. The whole system
 * is a single THREE.Group added to the scene once.
 *
 * Runs in the browser only ("three" resolves via the importmap).
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";

export class SkidMarks {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.cfg = CONFIG.handling;
    this.capacity = Math.max(8, this.cfg.skidMarkPool ?? 240);
    this.lifetime = this.cfg.skidMarkLifetime ?? 6;

    this.group = new THREE.Group();
    this.group.name = "skid-marks";
    scene.add(this.group);

    // A single shared geometry/material template. Each quad clones the material
    // so it can fade independently; geometry is shared to keep memory low.
    this._geo = new THREE.PlaneGeometry(0.34, 1.0);
    this._geo.rotateX(-Math.PI / 2); // lie flat on the ground (XZ plane)

    /** @type {{mesh:THREE.Mesh, age:number, alive:boolean, baseOpacity:number}[]} */
    this._pool = [];
    for (let i = 0; i < this.capacity; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x101012,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(this._geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this._pool.push({ mesh, age: 0, alive: false, baseOpacity: 0 });
    }
    this._cursor = 0;
  }

  /**
   * Drop one skid quad at a ground position, oriented along a heading.
   *
   * @param {{x:number,y:number,z:number}} position world position of the wheel
   * @param {number} heading yaw in radians (mark aligns with travel direction)
   * @param {number} [intensity] 0..1 drift intensity, scales opacity
   */
  drop(position, heading, intensity = 1) {
    const slot = this._pool[this._cursor];
    this._cursor = (this._cursor + 1) % this.capacity;

    const mesh = slot.mesh;
    mesh.position.set(position.x, 0.03, position.z);
    mesh.rotation.set(0, heading, 0);
    const baseOpacity = 0.35 + 0.4 * clamp01(intensity);
    slot.baseOpacity = baseOpacity;
    slot.age = 0;
    slot.alive = true;
    mesh.visible = true;
    mesh.material.opacity = baseOpacity;
  }

  /**
   * Age all live marks and fade them out; recycle any that expire.
   * @param {number} dt seconds
   */
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const slot of this._pool) {
      if (!slot.alive) continue;
      slot.age += dt;
      const t = slot.age / this.lifetime;
      if (t >= 1) {
        slot.alive = false;
        slot.mesh.visible = false;
        slot.mesh.material.opacity = 0;
      } else {
        slot.mesh.material.opacity = slot.baseOpacity * (1 - t);
      }
    }
  }

  /** Hide and free every mark (used on reset/respawn). */
  clear() {
    for (const slot of this._pool) {
      slot.alive = false;
      slot.age = 0;
      slot.mesh.visible = false;
      slot.mesh.material.opacity = 0;
    }
  }

  /** Number of currently live marks (for tests/debug). */
  get aliveCount() {
    let n = 0;
    for (const slot of this._pool) if (slot.alive) n += 1;
    return n;
  }
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export default SkidMarks;
