/**
 * sparks.js
 *
 * A fixed-size POOL of bright particle "sparks" spawned in a short burst at a
 * wall-collision impact point, mirroring the pooling approach already used by
 * skidmarks.js (pre-allocate CONFIG.fx.sparks.pool particles, reuse the oldest
 * whenever a new burst needs more than are currently free). Each particle is a
 * small additive sprite that flies outward from the impact point under a
 * simple constant "gravity" and fades out over its lifetime.
 *
 * Runs in the browser only ("three" resolves via the importmap).
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";

export class Sparks {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.cfg = CONFIG.fx.sparks;
    this.capacity = Math.max(8, this.cfg.pool ?? 120);
    this.lifetime = this.cfg.lifetime ?? 0.5;
    this.speed = this.cfg.speed ?? 6;

    this.group = new THREE.Group();
    this.group.name = "sparks";
    scene.add(this.group);

    const texture = makeSparkTexture();
    const color = new THREE.Color(this.cfg.color ?? 0xffcf7a);

    /** @type {{sprite:THREE.Sprite, vel:{x:number,y:number,z:number}, age:number, alive:boolean}[]} */
    this._pool = [];
    for (let i = 0; i < this.capacity; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.22, 0.22, 0.22);
      sprite.visible = false;
      this.group.add(sprite);
      this._pool.push({ sprite, vel: { x: 0, y: 0, z: 0 }, age: 0, alive: false });
    }
    this._cursor = 0;
  }

  /**
   * Spawn a burst of sparks at a world position, flying outward in random
   * directions biased slightly upward.
   * @param {{x:number,y:number,z:number}} position impact point
   * @param {number} [count] particles to spawn (defaults to config)
   */
  burst(position, count) {
    const n = count ?? this.cfg.particlesPerHit ?? 14;
    for (let i = 0; i < n; i++) {
      const slot = this._pool[this._cursor];
      this._cursor = (this._cursor + 1) % this.capacity;

      const theta = Math.random() * Math.PI * 2;
      const upBias = 0.3 + Math.random() * 0.5;
      const spd = this.speed * (0.5 + Math.random() * 0.7);
      slot.vel.x = Math.cos(theta) * spd * (1 - upBias);
      slot.vel.z = Math.sin(theta) * spd * (1 - upBias);
      slot.vel.y = spd * upBias;

      slot.sprite.position.set(position.x, position.y, position.z);
      slot.sprite.material.opacity = 1;
      slot.sprite.visible = true;
      slot.age = 0;
      slot.alive = true;
    }
  }

  /**
   * Advance all live sparks: integrate a simple ballistic motion (gravity
   * pulling them down) and fade out over the configured lifetime.
   * @param {number} dt seconds
   */
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const gravity = 14;
    for (const slot of this._pool) {
      if (!slot.alive) continue;
      slot.age += dt;
      const t = slot.age / this.lifetime;
      if (t >= 1) {
        slot.alive = false;
        slot.sprite.visible = false;
        slot.sprite.material.opacity = 0;
        continue;
      }
      slot.vel.y -= gravity * dt;
      const p = slot.sprite.position;
      p.x += slot.vel.x * dt;
      p.y += slot.vel.y * dt;
      p.z += slot.vel.z * dt;
      slot.sprite.material.opacity = 1 - t;
    }
  }

  /** Hide and free every spark (used on reset/respawn). */
  clear() {
    for (const slot of this._pool) {
      slot.alive = false;
      slot.age = 0;
      slot.sprite.visible = false;
      slot.sprite.material.opacity = 0;
    }
  }
}

/**
 * Build a small radial-gradient sprite texture for a spark particle. Returns
 * null in non-browser contexts (no 2D canvas).
 * @returns {THREE.CanvasTexture|null}
 */
function makeSparkTexture() {
  if (typeof document === "undefined" || !document.createElement) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,220,150,0.9)");
  grad.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default Sparks;
