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
import { placeTrees, placeGrandstands } from "./logic/scenery.js";

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
    this._buildCenterLine();
    this._buildCurbs();
    this._buildBarriers();
    this._buildStartFinish();
    this._buildCheckpoints();
    this._computeSpawn();
    this._buildScenery();
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
    const uvs = [];
    const indices = [];

    // Cumulative distance along the centerline, used as the V texture
    // coordinate so the asphalt tiles evenly along the road's length rather
    // than stretching.
    const tileLength = 6; // metres of road per texture repeat, lengthwise
    const tileWidth = hw * 2; // one texture repeat spans the full road width
    let dist = 0;

    // Two vertices per centerline sample: left and right road edge.
    for (let i = 0; i < n; i++) {
      const { left, right } = edgePoints(pts, i, hw);
      positions.push(left.x, 0.01, left.z);
      positions.push(right.x, 0.01, right.z);
      const v = dist / tileLength;
      uvs.push(0, v);
      uvs.push(tileWidth / tileLength, v);
      const next = pts[(i + 1) % n];
      dist += Math.hypot(next.x - pts[i].x, next.z - pts[i].z);
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
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const asphalt = makeAsphaltTexture(this.cfg.roadColor);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    if (asphalt) {
      mat.map = asphalt;
    } else {
      mat.color = new THREE.Color(this.cfg.roadColor);
    }
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    this.scene.add(road);
    this.objects.push(road);

    // Painted edge lines: thin ribbons hugging each side of the road.
    this._buildEdgeLine(hw - 0.35, 0.25);
    this._buildEdgeLine(-(hw - 0.35), 0.25);
  }

  /**
   * Dashed lane marking down the centre of the road: short rectangular
   * segments with gaps, matching the classic dashed-line look. Purely visual.
   */
  _buildCenterLine() {
    const pts = this.centerline;
    const n = pts.length;
    const dashLen = 2.2;
    const gapLen = 2.6;
    const width = 0.22;

    const mat = new THREE.MeshStandardMaterial({
      color: this.cfg.startLineColor,
      roughness: 0.55,
      metalness: 0.0,
    });

    const group = new THREE.Group();
    group.name = "center-line";

    let dist = 0;
    let dashing = true;
    let dashRemaining = dashLen;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      let segLen = Math.hypot(b.x - a.x, b.z - a.z);
      let segStart = 0;
      while (segLen - segStart > 1e-6) {
        const remain = segLen - segStart;
        const take = Math.min(remain, dashRemaining);
        if (dashing && take > 0.05) {
          const t0 = segStart / (segLen || 1);
          const t1 = (segStart + take) / (segLen || 1);
          const x0 = a.x + (b.x - a.x) * t0;
          const z0 = a.z + (b.z - a.z) * t0;
          const x1 = a.x + (b.x - a.x) * t1;
          const z1 = a.z + (b.z - a.z) * t1;
          const cx = (x0 + x1) / 2;
          const cz = (z0 + z1) / 2;
          const len = Math.hypot(x1 - x0, z1 - z0);
          const yaw = Math.atan2(x1 - x0, z1 - z0);
          const dashMesh = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.03, len),
            mat,
          );
          dashMesh.position.set(cx, 0.03, cz);
          dashMesh.rotation.y = yaw;
          group.add(dashMesh);
        }
        segStart += take;
        dashRemaining -= take;
        dist += take;
        void dist;
        if (dashRemaining <= 1e-6) {
          dashing = !dashing;
          dashRemaining = dashing ? dashLen : gapLen;
        }
      }
    }

    this.scene.add(group);
    this.objects.push(group);
  }

  /**
   * Alternating red/white curb blocks hugging both road edges, distinct from
   * the plain edge line: raised slightly and coloured in blocks so the track
   * boundary reads clearly at speed.
   */
  _buildCurbs() {
    const hw = this.cfg.roadHalfWidth;
    this._buildCurbLine(hw - 0.12);
    this._buildCurbLine(-(hw - 0.12));
  }

  _buildCurbLine(offset) {
    const pts = this.centerline;
    const n = pts.length;
    const blockLen = 3.2;
    const width = 0.5;
    const height = 0.06;

    const matA = new THREE.MeshStandardMaterial({
      color: 0xc23a2f,
      roughness: 0.6,
      metalness: 0.0,
    });
    const matB = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      roughness: 0.6,
      metalness: 0.0,
    });

    const group = new THREE.Group();
    group.name = "curb";

    let dist = 0;
    let blockIndex = 0;
    let blockRemaining = blockLen;
    for (let i = 0; i < n; i++) {
      const a = offsetPoint(pts, i, offset);
      const b = offsetPoint(pts, (i + 1) % n, offset);
      let segLen = Math.hypot(b.x - a.x, b.z - a.z);
      let segStart = 0;
      while (segLen - segStart > 1e-6) {
        const remain = segLen - segStart;
        const take = Math.min(remain, blockRemaining);
        const t0 = segStart / (segLen || 1);
        const t1 = (segStart + take) / (segLen || 1);
        const x0 = a.x + (b.x - a.x) * t0;
        const z0 = a.z + (b.z - a.z) * t0;
        const x1 = a.x + (b.x - a.x) * t1;
        const z1 = a.z + (b.z - a.z) * t1;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const len = Math.hypot(x1 - x0, z1 - z0) + 0.05;
        const yaw = Math.atan2(x1 - x0, z1 - z0);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, len),
          blockIndex % 2 === 0 ? matA : matB,
        );
        mesh.position.set(cx, height / 2, cz);
        mesh.rotation.y = yaw;
        mesh.receiveShadow = true;
        group.add(mesh);

        segStart += take;
        blockRemaining -= take;
        dist += take;
        void dist;
        if (blockRemaining <= 1e-6) {
          blockIndex += 1;
          blockRemaining = blockLen;
        }
      }
    }

    this.scene.add(group);
    this.objects.push(group);
  }

  /**
   * Roadside scenery (trees + grandstands), placed procedurally by the pure
   * placement helpers in logic/scenery.js. Purely visual: no physics bodies
   * are added, so barrier collision geometry is unaffected.
   */
  _buildScenery() {
    const cfg = CONFIG.scenery;
    if (!cfg || !cfg.enabled) return;
    const hw = this.cfg.roadHalfWidth;

    const trees = placeTrees(this.centerline, hw, cfg.tree, cfg.clearance, 1337);
    if (trees.length) {
      this._buildTrees(trees, cfg.tree);
    }

    const stands = placeGrandstands(this.centerline, hw, cfg.grandstand, cfg.clearance);
    if (stands.length) {
      this._buildGrandstands(stands, cfg.grandstand);
    }
  }

  _buildTrees(trees, treeCfg) {
    const group = new THREE.Group();
    group.name = "scenery-trees";

    const trunkMat = new THREE.MeshStandardMaterial({
      color: treeCfg.trunkColor ?? 0x5b3a29,
      roughness: 0.9,
      metalness: 0.0,
    });
    // One canopy material per configured colour, reused across trees so we do
    // not create hundreds of unique materials.
    const canopyMats = new Map();
    const canopyMat = (color) => {
      if (!canopyMats.has(color)) {
        canopyMats.set(
          color,
          new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 }),
        );
      }
      return canopyMats.get(color);
    };

    // Shared geometries (trunk cylinder + canopy cone), scaled per-instance
    // via mesh.scale rather than building unique geometry for every tree.
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 6);
    const canopyGeo = new THREE.ConeGeometry(1, 1, 8);

    for (const t of trees) {
      const trunkHeight = t.height * 0.35;
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.scale.set(t.radius * 0.3, trunkHeight, t.radius * 0.3);
      trunk.position.set(t.x, trunkHeight / 2, t.z);
      trunk.castShadow = true;
      group.add(trunk);

      const canopyHeight = t.height * 0.75;
      const canopy = new THREE.Mesh(canopyGeo, canopyMat(t.canopyColor));
      canopy.scale.set(t.radius, canopyHeight, t.radius);
      canopy.position.set(t.x, trunkHeight + canopyHeight / 2, t.z);
      canopy.castShadow = true;
      group.add(canopy);
    }

    this.scene.add(group);
    this.objects.push(group);
  }

  _buildGrandstands(stands, standCfg) {
    const group = new THREE.Group();
    group.name = "scenery-grandstands";

    const frameMat = new THREE.MeshStandardMaterial({
      color: standCfg.frameColor ?? 0x545a66,
      roughness: 0.8,
      metalness: 0.2,
    });
    const seatColors = standCfg.seatColors ?? [0x3b6ea5];
    const seatMats = seatColors.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.0 }),
    );

    for (let s = 0; s < stands.length; s++) {
      const st = stands[s];
      const standGroup = new THREE.Group();
      standGroup.position.set(st.x, 0, st.z);
      standGroup.rotation.y = st.heading;

      // Raked frame: a simple ramp box, back edge tall, front edge low, so it
      // reads as tiered seating from a distance.
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(st.width, st.height, st.depth),
        frameMat,
      );
      frame.position.set(0, st.height / 2, 0);
      frame.rotation.x = -0.18;
      frame.castShadow = true;
      frame.receiveShadow = true;
      standGroup.add(frame);

      // A few coloured "seating block" stripes along the front face for
      // visual interest, alternating the configured seat colours.
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(st.width * 0.96, st.height / rows * 0.7, st.depth * 0.9),
          seatMats[(s + r) % seatMats.length],
        );
        const t = (r + 0.5) / rows;
        stripe.position.set(0, t * st.height * 0.9, st.depth * 0.05);
        stripe.rotation.x = -0.18;
        standGroup.add(stripe);
      }

      group.add(standGroup);
    }

    this.scene.add(group);
    this.objects.push(group);
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

/**
 * Paint a tileable procedural asphalt texture on an offscreen canvas: a base
 * grey fill, a scatter of small darker/lighter speckle dots for aggregate
 * grain, and a few faint diagonal streaks for tire-wear variation. Returns
 * null in non-browser contexts (no 2D canvas), matching the fallback pattern
 * used by environment.js's sky gradient.
 *
 * @param {number} baseColor hex colour used as the asphalt base tone
 * @returns {THREE.CanvasTexture|null}
 */
function makeAsphaltTexture(baseColor) {
  if (typeof document === "undefined" || !document.createElement) return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return null;

  const base = new THREE.Color(baseColor);
  ctx.fillStyle = "#" + base.getHexString();
  ctx.fillRect(0, 0, size, size);

  // Deterministic speckle so repeated builds look the same. A tiny local
  // PRNG avoids depending on Math.random() seeding.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >>> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    return (seed >>> 0) / 4294967295;
  };

  const speckleCount = 2200;
  for (let i = 0; i < speckleCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.4 + rand() * 1.1;
    const light = rand() > 0.5;
    const shade = light ? 255 : 0;
    const alpha = 0.05 + rand() * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha.toFixed(3)})`;
    ctx.fill();
  }

  // A few faint long streaks for subtle tire-wear variation.
  ctx.strokeStyle = "rgba(0,0,0,0.05)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const x0 = rand() * size;
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + (rand() - 0.5) * 40, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
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
