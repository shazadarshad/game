/**
 * track.js
 *
 * Builds the designed closed circuit: a road ribbon mesh generated from the
 * CONFIG.track centerline, painted edge lines, inner and outer barrier walls
 * (both as Three meshes AND matching static CANNON bodies so the car collides
 * with them), a start/finish line marker, and a large context ground plane.
 *
 * It also derives the data the rest of the game needs: the resampled
 * centerline, the spawn point + spawn heading, and an ordered list of
 * checkpoint gate definitions (position + forward normal + width) placed evenly
 * along the centerline. The start/finish line is checkpoint 0.
 *
 * Runs in the browser only ("three" and "cannon-es" resolve via the importmap).
 */
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CONFIG } from "../config.js";

export class Track {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   */
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.cfg = CONFIG.track;

    /** @type {CANNON.Body[]} barrier bodies added to the physics world */
    this.barrierBodies = [];
    /** @type {THREE.Object3D[]} everything we added to the scene, for disposal */
    this.objects = [];

    // Resample the raw centerline into a smooth, evenly spaced closed loop.
    this.centerline = resampleClosedLoop(this.cfg.centerline, 4);

    this._buildGround();
    this._buildRoad();
    this._buildBarriers();
    this._buildStartFinish();
    this._buildCheckpoints();
    this._computeSpawn();
  }

  // ---- Geometry construction -------------------------------------------------

  _buildGround() {
    const geo = new THREE.PlaneGeometry(
      CONFIG.world.groundSize,
      CONFIG.world.groundSize,
    );
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.world.groundColor,
      roughness: 0.98,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.objects.push(ground);
  }

  _buildRoad() {
    const pts = this.centerline;
    const hw = this.cfg.roadHalfWidth;
    const n = pts.length;

    const positions = [];
    const indices = [];

    // Two vertices per centerline sample: left and right road edge.
    for (let i = 0; i < n; i++) {
      const { left, right } = edgePoints(pts, i, hw);
      positions.push(left.x, 0.01, left.z);
      positions.push(right.x, 0.01, right.z);
    }
    // Triangulate the closed ribbon, wrapping the last pair back to the first.
    for (let i = 0; i < n; i++) {
      const a = (i * 2) % (n * 2);
      const b = (i * 2 + 1) % (n * 2);
      const c = ((i + 1) * 2) % (n * 2);
      const d = ((i + 1) * 2 + 1) % (n * 2);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: this.cfg.roadColor,
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    this.scene.add(road);
    this.objects.push(road);

    // Painted edge lines: thin ribbons hugging each side of the road.
    this._buildEdgeLine(hw - 0.35, 0.25);
    this._buildEdgeLine(-(hw - 0.35), 0.25);
  }

  _buildEdgeLine(offset, width) {
    const pts = this.centerline;
    const n = pts.length;
    const positions = [];
    const indices = [];

    for (let i = 0; i < n; i++) {
      const c = offsetPoint(pts, i, offset);
      const inner = offsetPoint(pts, i, offset - width / 2);
      const outer = offsetPoint(pts, i, offset + width / 2);
      // Reuse c to keep it referenced without a linter complaint.
      void c;
      positions.push(inner.x, 0.02, inner.z);
      positions.push(outer.x, 0.02, outer.z);
    }
    for (let i = 0; i < n; i++) {
      const a = (i * 2) % (n * 2);
      const b = (i * 2 + 1) % (n * 2);
      const cc = ((i + 1) * 2) % (n * 2);
      const d = ((i + 1) * 2 + 1) % (n * 2);
      indices.push(a, cc, b);
      indices.push(b, cc, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: this.cfg.roadEdgeColor,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const line = new THREE.Mesh(geo, mat);
    line.receiveShadow = true;
    this.scene.add(line);
    this.objects.push(line);
  }

  _buildBarriers() {
    const hw = this.cfg.roadHalfWidth;
    const wall = this.cfg.barrierThickness;
    // Inner and outer barriers sit just outside the road edges.
    this._buildBarrierWall(hw + wall / 2, "outer-left");
    this._buildBarrierWall(-(hw + wall / 2), "outer-right");
  }

  /**
   * Build one continuous barrier wall offset laterally from the centerline. The
   * wall is made of short box segments between successive centerline samples;
   * each segment is a Three mesh with a matching static CANNON box body.
   *
   * @param {number} offset lateral offset from the centerline (metres)
   * @param {string} tag label for debugging
   */
  _buildBarrierWall(offset, tag) {
    const pts = this.centerline;
    const n = pts.length;
    const height = this.cfg.barrierHeight;
    const thickness = this.cfg.barrierThickness;

    const group = new THREE.Group();
    group.name = `barrier-${tag}`;

    const matA = new THREE.MeshStandardMaterial({
      color: this.cfg.barrierColor,
      roughness: 0.7,
      metalness: 0.1,
    });
    const matB = new THREE.MeshStandardMaterial({
      color: this.cfg.barrierAccentColor,
      roughness: 0.7,
      metalness: 0.1,
    });

    for (let i = 0; i < n; i++) {
      const a = offsetPoint(pts, i, offset);
      const b = offsetPoint(pts, (i + 1) % n, offset);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const yaw = Math.atan2(dx, dz);

      // Visual segment. Length is padded slightly so neighbours overlap and
      // leave no gaps on the outside of curves.
      const geo = new THREE.BoxGeometry(thickness, height, len + 0.4);
      const mesh = new THREE.Mesh(geo, i % 2 === 0 ? matA : matB);
      mesh.position.set(cx, height / 2, cz);
      mesh.rotation.y = yaw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // Matching static physics body.
      const shape = new CANNON.Box(
        new CANNON.Vec3(thickness / 2, height / 2, (len + 0.4) / 2),
      );
      const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.STATIC,
        material: this.physicsWorld.defaultMaterial,
      });
      body.addShape(shape);
      body.position.set(cx, height / 2, cz);
      body.quaternion.setFromEuler(0, yaw, 0);
      this.physicsWorld.addBody(body);
      this.barrierBodies.push(body);
    }

    this.scene.add(group);
    this.objects.push(group);
  }

  _buildStartFinish() {
    const pts = this.centerline;
    const hw = this.cfg.roadHalfWidth;
    const { left, right } = edgePoints(pts, 0, hw);
    const dx = right.x - left.x;
    const dz = right.z - left.z;
    const len = Math.hypot(dx, dz);
    const cx = (left.x + right.x) / 2;
    const cz = (left.z + right.z) / 2;
    const yaw = Math.atan2(dx, dz);

    // A checkered-ish start/finish stripe across the road.
    const geo = new THREE.BoxGeometry(len, 0.06, 1.6);
    const mat = new THREE.MeshStandardMaterial({
      color: this.cfg.startLineColor,
      roughness: 0.5,
      metalness: 0.0,
    });
    const stripe = new THREE.Mesh(geo, mat);
    stripe.position.set(cx, 0.05, cz);
    stripe.rotation.y = yaw + Math.PI / 2;
    stripe.receiveShadow = true;
    this.scene.add(stripe);
    this.objects.push(stripe);
    this.startFinish = stripe;
  }

  _buildCheckpoints() {
    const pts = this.centerline;
    const n = pts.length;
    const count = Math.max(2, this.cfg.checkpointCount);
    const width = this.cfg.checkpointHalfWidth * 2;

    /** @type {{index:number, position:{x:number,z:number}, forward:{x:number,z:number}, width:number}[]} */
    this.gates = [];
    for (let g = 0; g < count; g++) {
      // Map gate g to a centerline sample (gate 0 -> sample 0 = start/finish).
      const sampleIndex = Math.round((g * n) / count) % n;
      const position = { x: pts[sampleIndex].x, z: pts[sampleIndex].z };
      const forward = tangentAt(pts, sampleIndex);
      this.gates.push({ index: g, position, forward, width });
    }
  }

  _computeSpawn() {
    const pts = this.centerline;
    // Spawn just behind the start/finish line, facing along the track forward.
    const forward = tangentAt(pts, 0);
    const heading = Math.atan2(forward.x, forward.z);
    // Nudge the spawn a little back from the line so the car crosses gate 0
    // shortly after the countdown, starting the lap cleanly.
    const back = this.cfg.spawnBackOffset;
    const backX = pts[0].x - forward.x * back;
    const backZ = pts[0].z - forward.z * back;
    this.spawn = { x: backX, y: this.cfg.spawnHeight, z: backZ };
    this.spawnHeading = heading;
  }

  /** Number of checkpoint gates (including start/finish at index 0). */
  get checkpointCount() {
    return this.gates.length;
  }

  /** Remove all barrier bodies and scene objects (for teardown/hot reload). */
  dispose() {
    for (const body of this.barrierBodies) {
      this.physicsWorld.removeBody(body);
    }
    this.barrierBodies.length = 0;
    for (const obj of this.objects) {
      this.scene.remove(obj);
    }
    this.objects.length = 0;
  }
}

// ---- Pure geometry helpers (module-local) -----------------------------------

/**
 * Resample a closed polyline into an evenly spaced loop with roughly
 * `spacing`-metre steps, using Catmull-Rom style linear interpolation between
 * the original control points for a smoother ribbon.
 *
 * @param {{x:number,z:number}[]} raw control points (open list; loop is implied)
 * @param {number} spacing target spacing in metres
 * @returns {{x:number,z:number}[]}
 */
function resampleClosedLoop(raw, spacing) {
  const out = [];
  const n = raw.length;
  for (let i = 0; i < n; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % n];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(segLen / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

/**
 * Unit tangent (forward direction) at centerline sample `i`, using the vector
 * from the previous sample to the next for a smooth normal.
 *
 * @param {{x:number,z:number}[]} pts closed centerline
 * @param {number} i sample index
 * @returns {{x:number,z:number}} unit forward vector
 */
function tangentAt(pts, i) {
  const n = pts.length;
  const prev = pts[(i - 1 + n) % n];
  const next = pts[(i + 1) % n];
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/**
 * Left/right road-edge points at sample `i`, offset perpendicular to the local
 * tangent by `halfWidth`.
 */
function edgePoints(pts, i, halfWidth) {
  const t = tangentAt(pts, i);
  // Left = tangent rotated +90 degrees, right = -90 degrees (XZ plane).
  const nx = -t.z;
  const nz = t.x;
  const p = pts[i];
  return {
    left: { x: p.x + nx * halfWidth, z: p.z + nz * halfWidth },
    right: { x: p.x - nx * halfWidth, z: p.z - nz * halfWidth },
  };
}

/**
 * A point offset from centerline sample `i` by `offset` metres to the left
 * (positive) or right (negative) of the track direction.
 */
function offsetPoint(pts, i, offset) {
  const t = tangentAt(pts, i);
  const nx = -t.z;
  const nz = t.x;
  const p = pts[i];
  return { x: p.x + nx * offset, z: p.z + nz * offset };
}

export default Track;
