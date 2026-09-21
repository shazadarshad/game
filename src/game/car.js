/**
 * car.js
 *
 * The player Car: owns a Three.js visual model built from primitives (body,
 * cabin, wheels, bumpers, spoiler, emissive headlights) and a physics vehicle
 * from ../physics/vehicle.js. Each fixed step, update(dt, input) turns the
 * input state into engine force and a smoothed steering angle, applies the
 * handbrake / drift grip from CONFIG.handling, then syncs the visual group and
 * the four wheel meshes to the physics transforms.
 *
 * Runs in the browser only ("three" resolves via the importmap).
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";
import { Vehicle } from "../physics/vehicle.js";
import { steerTowards, kmhFromMs } from "./logic/handling.js";
import { lateralSlip, isDrifting, driftIntensity } from "./logic/drift.js";
import { SkidMarks } from "./skidmarks.js";
import { Sparks } from "./sparks.js";

// ---- Procedural car model builders (module-local) --------------------------
//
// Everything below builds Three.js geometry from primitives/extruded shapes at
// runtime; no external model file is loaded. `he` is always the chassis
// half-extents object (x = half-width, y = half-height, z = half-length) from
// CONFIG.vehicle.chassisHalfExtents, so the visual model always matches the
// physics collision box's footprint.

/**
 * Build the main body shell as a single extruded shape: a side-profile curve
 * (front bumper -> hood -> windshield rake -> roof -> rear-window rake -> rear
 * deck -> rear bumper) extruded across the car's width and centred. This
 * replaces the flat box body with a silhouette that actually reads as a car.
 *
 * @param {{x:number,y:number,z:number}} he chassis half-extents (metres)
 * @returns {THREE.BufferGeometry}
 */
function buildBodySilhouette(he) {
  const halfLen = he.z * 0.98;
  const lowY = -he.y * 0.7; // rocker/sill height
  const hoodY = he.y * 0.15; // hood/deck height
  const roofY = he.y * 1.55; // roof height

  // Side-profile shape drawn in the X/Y-like plane that ExtrudeGeometry treats
  // as (x, y) before extruding along +Z; we build it in (z, y) order instead
  // so the extrusion depth becomes the car's width, then rotate/translate the
  // resulting geometry into the car's actual X (width) / Y (height) / Z
  // (length) axes below.
  const shape = new THREE.Shape();
  shape.moveTo(-halfLen, lowY);
  shape.lineTo(-halfLen, hoodY * 0.4); // rear bumper face
  shape.lineTo(-halfLen * 0.72, hoodY); // rear deck
  shape.lineTo(-halfLen * 0.42, roofY * 0.98); // rear-window rake up to roof
  shape.lineTo(halfLen * 0.12, roofY); // roof (slightly forward-biased cabin)
  shape.lineTo(halfLen * 0.5, hoodY * 1.1); // windshield rake down to hood
  shape.lineTo(halfLen * 0.86, hoodY * 0.5); // hood slope
  shape.lineTo(halfLen, hoodY * 0.1); // front bumper top
  shape.lineTo(halfLen, lowY); // front bumper face
  shape.lineTo(-halfLen, lowY); // sill back to start

  const width = he.x * 2 * 0.94;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 1,
  });
  // ExtrudeGeometry extrudes along +Z from the shape's local (x, y); our shape
  // used (z, y) as (x, y), so after extrusion the geometry's local axes are
  // (length, height, width). Rotate so the extrusion axis becomes the car's
  // actual width axis (+X) and centre it left/right.
  geo.rotateY(Math.PI / 2);
  geo.translate(-width / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build the windshield and rear-window glass panes as simple angled planes
 * sized to roughly fill the openings implied by the body silhouette above.
 * Returned as plain descriptors (geometry + local position/rotation) so the
 * caller can create the meshes with the shared glass material.
 *
 * @param {{x:number,y:number,z:number}} he chassis half-extents (metres)
 * @returns {{geometry:THREE.BufferGeometry, position:THREE.Vector3, rotation:THREE.Euler}[]}
 */
function buildGlassPanes(he) {
  const halfLen = he.z * 0.98;
  const hoodY = he.y * 0.15;
  const roofY = he.y * 1.55;
  const width = he.x * 2 * 0.82;

  const windshieldHeight = Math.hypot(halfLen * 0.5 - halfLen * 0.12, roofY - hoodY * 1.1);
  const windshieldGeo = new THREE.PlaneGeometry(width, windshieldHeight);
  const windshieldAngle = Math.atan2(
    halfLen * 0.5 - halfLen * 0.12,
    roofY - hoodY * 1.1,
  );

  const rearHeight = Math.hypot(halfLen * 0.42 - halfLen * 0.72, roofY * 0.98 - hoodY);
  const rearGeo = new THREE.PlaneGeometry(width, rearHeight);
  const rearAngle = Math.atan2(halfLen * 0.42 - halfLen * 0.72, roofY * 0.98 - hoodY);

  return [
    {
      geometry: windshieldGeo,
      position: new THREE.Vector3(0, (roofY + hoodY * 1.1) / 2 + 0.01, (halfLen * 0.5 + halfLen * 0.12) / 2),
      rotation: new THREE.Euler(Math.PI / 2 - windshieldAngle, 0, 0),
    },
    {
      geometry: rearGeo,
      position: new THREE.Vector3(0, (roofY * 0.98 + hoodY) / 2 + 0.01, -(halfLen * 0.42 + halfLen * 0.72) / 2),
      rotation: new THREE.Euler(-(Math.PI / 2 - rearAngle), 0, 0),
    },
  ];
}

/**
 * Build one wheel assembly: a dark tire torus-ish cylinder, a lighter metal
 * rim disc, four thin spokes and a small hub cap. Returned as a single Group
 * so Car.sync() can position/orient it exactly as it did the old flat wheel
 * mesh (same local origin at the wheel centre, axle along local X).
 *
 * @param {object} w CONFIG.vehicle.wheel
 * @returns {THREE.Group}
 */
function buildWheelAssembly(w) {
  const group = new THREE.Group();
  const radius = w.radius;
  const width = 0.34;

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x141416,
    roughness: 0.85,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xc9ccd2,
    roughness: 0.35,
    metalness: 0.75,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x2a2c31,
    roughness: 0.4,
    metalness: 0.6,
  });

  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 20);
  tireGeo.rotateZ(Math.PI / 2); // spin about local X (the axle)
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  tire.receiveShadow = true;
  group.add(tire);

  // Rim: a slightly narrower, slightly smaller-radius disc sitting flush with
  // the outer face of the tire on each side, so it reads as a wheel rim.
  const rimRadius = radius * 0.68;
  const rimGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.92, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  group.add(rim);

  // Spokes: four thin boxes radiating from the hub across the wheel face.
  // A box's long axis (rimRadius * 1.7) already runs along local Y, so
  // rotating each mesh around the axle (local X) by 45/135/225/315 degrees
  // fans them evenly across the wheel without needing to pre-rotate the
  // shared geometry.
  const spokeGeo = new THREE.BoxGeometry(width * 0.9, rimRadius * 1.7, 0.05);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(spokeGeo, hubMat);
    spoke.rotation.x = Math.PI / 4 + (i * Math.PI) / 2;
    group.add(spoke);
  }

  // Hub cap.
  const hubGeo = new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, width * 0.96, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, hubMat);
  group.add(hub);

  return group;
}

export class Car {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   * @param {{x:number,y:number,z:number}} [spawn]
   */
  constructor(scene, physicsWorld, spawn = { x: 0, y: 1.5, z: 0 }) {
    this.scene = scene;
    this.cfg = CONFIG.vehicle;
    this.handling = CONFIG.handling;
    this._spawn = { ...spawn };

    this.vehicle = new Vehicle(physicsWorld, spawn);

    // Smoothed steering angle (radians) carried across frames.
    this._steer = 0;

    // Drift feedback state.
    this._bodyLean = 0; // current visual roll offset (radians)
    this._drifting = false;
    this._distanceSinceMark = 0;
    this._lastMarkPos = { x: spawn.x, z: spawn.z };

    this._buildModel();
    scene.add(this.group);
    scene.add(this.wheelGroup);

    // Pooled skid decals dropped under the rear wheels while sliding.
    this.skidMarks = new SkidMarks(scene);
    // Pooled spark burst spawned on hard wall collisions.
    this.sparks = new Sparks(scene);
    // Impact recorded this step (consumed by main.js to drive camera shake),
    // cleared at the start of each update().
    this._lastImpact = { speed: 0, position: null };
  }

  _buildModel() {
    const he = this.cfg.chassisHalfExtents;
    this.group = new THREE.Group();
    // Inner group holding the visual body shell. It is rolled slightly during a
    // drift for arcade lean without affecting the physics-driven `group` pose.
    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xd23f3f,
      roughness: 0.32,
      metalness: 0.55,
      envMapIntensity: CONFIG.environment.envMapIntensity ?? 1,
    });
    this._bodyMat = bodyMat;
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1f,
      roughness: 0.5,
      metalness: 0.3,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1c2636,
      roughness: 0.08,
      metalness: 0.75,
      envMapIntensity: CONFIG.environment.envMapIntensity ?? 1,
    });
    this._glassMat = glassMat;

    // Sculpted body shell: an extruded silhouette (bumper -> hood -> windshield
    // -> roof -> rear deck -> bumper) swept across the car's width, instead of
    // a single box. This is the main visual upgrade over the placeholder box.
    const body = new THREE.Mesh(buildBodySilhouette(he), bodyMat);
    this._shadow(body);
    this.bodyGroup.add(body);

    // Angled glass panes set into the silhouette's windshield/rear-window
    // openings, following the same profile curve, for a believable greenhouse
    // rather than a floating box.
    for (const pane of buildGlassPanes(he)) {
      const mesh = new THREE.Mesh(pane.geometry, glassMat);
      mesh.position.copy(pane.position);
      mesh.rotation.copy(pane.rotation);
      this.bodyGroup.add(mesh);
    }

    // Front and rear bumpers (separate trim pieces sit slightly outside the
    // body shell for a panel-gap look).
    const bumperGeo = new THREE.BoxGeometry(he.x * 2 * 0.98, 0.22, 0.32);
    const frontBumper = new THREE.Mesh(bumperGeo, trimMat);
    frontBumper.position.set(0, -he.y * 0.55, he.z - 0.08);
    this._shadow(frontBumper);
    this.bodyGroup.add(frontBumper);

    const rearBumper = new THREE.Mesh(bumperGeo, trimMat);
    rearBumper.position.set(0, -he.y * 0.55, -he.z + 0.08);
    this._shadow(rearBumper);
    this.bodyGroup.add(rearBumper);

    // Side mirrors: a small box "head" on a thin stalk, mounted near the
    // A-pillar on each side.
    const mirrorStalkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.22);
    const mirrorHeadGeo = new THREE.BoxGeometry(0.16, 0.11, 0.24);
    for (const sx of [-1, 1]) {
      const stalk = new THREE.Mesh(mirrorStalkGeo, trimMat);
      stalk.position.set(sx * (he.x + 0.08), he.y * 0.55, he.z * 0.32);
      stalk.rotation.y = sx * 0.3;
      this._shadow(stalk);
      this.bodyGroup.add(stalk);

      const head = new THREE.Mesh(mirrorHeadGeo, bodyMat);
      head.position.set(sx * (he.x + 0.22), he.y * 0.58, he.z * 0.32);
      head.rotation.y = sx * 0.3;
      this._shadow(head);
      this.bodyGroup.add(head);
    }

    // Rear spoiler: a thin blade on two small uprights.
    const spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(he.x * 2 * 0.9, 0.08, 0.4),
      trimMat,
    );
    spoiler.position.set(0, he.y + 0.35, -he.z + 0.15);
    this._shadow(spoiler);
    this.bodyGroup.add(spoiler);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.28, 0.1),
        trimMat,
      );
      strut.position.set(sx * he.x * 0.55, he.y + 0.2, -he.z + 0.15);
      this._shadow(strut);
      this.bodyGroup.add(strut);
    }

    // Headlight/taillight clusters: a recessed dark housing with an emissive
    // lens sitting slightly forward of it, so each reads as a light fixture
    // rather than a flat glowing rectangle.
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff6d0,
      emissive: 0xfff2c0,
      emissiveIntensity: 1.6,
      roughness: 0.25,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xaa1414,
      emissive: 0xff2a2a,
      emissiveIntensity: 1.3,
      roughness: 0.25,
    });
    const housingGeo = new THREE.BoxGeometry(0.32, 0.2, 0.1);
    const lensGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.06, 12);
    lensGeo.rotateX(Math.PI / 2);
    for (const sx of [-1, 1]) {
      const headHousing = new THREE.Mesh(housingGeo, trimMat);
      headHousing.position.set(sx * he.x * 0.6, 0.0, he.z - 0.05);
      this.bodyGroup.add(headHousing);
      const headLens = new THREE.Mesh(lensGeo, headMat);
      headLens.position.set(sx * he.x * 0.6, 0.0, he.z + 0.01);
      this.bodyGroup.add(headLens);

      const tailHousing = new THREE.Mesh(housingGeo, trimMat);
      tailHousing.position.set(sx * he.x * 0.6, 0.05, -he.z + 0.05);
      this.bodyGroup.add(tailHousing);
      const tailLens = new THREE.Mesh(lensGeo, tailMat);
      tailLens.position.set(sx * he.x * 0.6, 0.05, -he.z - 0.01);
      this.bodyGroup.add(tailLens);
    }

    // A light tire-smoke puff shown near the rear while drifting hard. A soft
    // sprite driven by a canvas radial-gradient texture (no network asset).
    this.puff = this._buildPuff();
    if (this.puff) this.bodyGroup.add(this.puff);

    // Wheels live in their own group because the raycast vehicle reports each
    // wheel's world transform independently of the chassis. Each wheel is now
    // a small assembly: a dark tire, a lighter metal rim disc, thin spokes and
    // a hub cap, instead of a single flat cylinder.
    this.wheelGroup = new THREE.Group();
    this.wheelMeshes = [];
    const w = this.cfg.wheel;
    for (let i = 0; i < 4; i++) {
      const mesh = buildWheelAssembly(w);
      this.wheelMeshes.push(mesh);
      this.wheelGroup.add(mesh);
    }
  }

  _shadow(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  /**
   * Build a soft additive sprite used as the tire-smoke puff. Returns null in
   * non-browser contexts (no 2D canvas), in which case drift still works and
   * only the puff visual is skipped.
   * @returns {THREE.Sprite|null}
   */
  _buildPuff() {
    if (typeof document === "undefined" || !document.createElement) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(230,230,235,0.9)");
    grad.addColorStop(1, "rgba(230,230,235,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 1.6, 1.6);
    // Sit just behind and above the rear axle.
    sprite.position.set(0, 0.1, -this.cfg.chassisHalfExtents.z);
    sprite.visible = false;
    return sprite;
  }

  /**
   * Advance the car for one fixed step. This only sets the vehicle controls
   * (steering, throttle/brake, drift grip) and updates the drift feedback; it
   * does NOT step the physics world and does NOT copy transforms to the
   * visuals. The caller must, in order: call update(dt, input), then step the
   * physics world, then call sync() to copy the solved transforms onto the
   * visuals. Keeping sync() out of update() avoids copying stale, pre-step
   * transforms.
   *
   * @param {number} dt fixed step seconds
   * @param {{throttle:number, brake:number, steer:number, handbrake:boolean}} input
   */
  update(dt, input) {
    // Poll the physics vehicle for the strongest collision impact recorded
    // since the last step. A hard enough hit spawns a spark burst at the
    // impact point and is exposed via `lastImpact` for main.js to forward to
    // the chase camera's screen-shake.
    const impact = this.vehicle.consumeImpact();
    this._lastImpact = impact;
    const fxCfg = CONFIG.fx?.sparks;
    if (
      fxCfg?.enabled &&
      impact.speed >= (fxCfg.minImpactSpeed ?? 2.5) &&
      impact.position
    ) {
      this.sparks.burst(impact.position, fxCfg.particlesPerHit);
    }
    this.sparks.update(dt);

    const speedKmh = Math.abs(this.vehicle.speedKmh);

    // Smooth the steering angle toward the requested direction so quick taps
    // do not snap the wheels. maxSteer scales down a little at speed for
    // stability.
    const speedFactor = 1 - Math.min(speedKmh / 260, 0.55);
    const targetSteer = input.steer * this.cfg.maxSteer * speedFactor;
    const maxDelta = this.cfg.steerSpeed * dt;
    this._steer = steerTowards(this._steer, targetSteer, maxDelta);
    this.vehicle.setSteer(this._steer);

    // Throttle / brake / reverse. Braking while moving forward slows the car;
    // holding brake at a standstill drives it in reverse.
    const forwardSpeed = this.vehicle.speed; // signed m/s
    let engineForce = 0;
    let brakeForce = 0;

    if (input.throttle > 0) {
      engineForce = -this.cfg.engineForce * input.throttle;
    } else if (input.brake > 0) {
      if (forwardSpeed > 0.5) {
        brakeForce = this.cfg.brakeForce * input.brake;
      } else {
        engineForce = this.cfg.reverseForce * input.brake;
      }
    } else {
      // Gentle engine braking / rolling resistance when coasting.
      brakeForce = this.handling.coastBrakeForce;
    }

    this.vehicle.setThrottle(engineForce);
    this.vehicle.setBrake(brakeForce);

    // Handbrake and speed-based drift assist scale rear grip for slides.
    if (input.handbrake) {
      this.vehicle.setRearGrip(this.handling.handbrakeFrictionRear);
    } else if (
      Math.abs(input.steer) > 0.1 &&
      speedKmh > this.handling.driftEngageSpeed
    ) {
      this.vehicle.setRearGrip(this.handling.driftFrictionMultiplier);
    } else {
      this.vehicle.setRearGrip(1);
    }

    this._updateDrift(dt, input, speedKmh);
  }

  /**
   * Detect lateral slip and emit drift feedback: pooled skid marks under the
   * rear wheels, a tire-smoke puff, and a slight body lean. Thresholds all come
   * from CONFIG.handling via the pure drift helpers.
   * @param {number} dt fixed step seconds
   * @param {{steer:number, handbrake:boolean}} input
   * @param {number} speedKmh unsigned speed in km/h
   */
  _updateDrift(dt, input, speedKmh) {
    const v = this.vehicle.chassisBody.velocity;
    const heading = this.heading;
    const slip = lateralSlip({ x: v.x, z: v.z }, heading);
    const drifting = isDrifting(
      { speedKmh, slip, handbrake: !!input.handbrake },
      this.handling,
    );
    this._drifting = drifting;
    const intensity = drifting ? driftIntensity(slip, this.handling) : 0;

    // Body lean: roll away from the steering direction for an arcade feel. Ease
    // the current lean toward the target so it does not snap.
    const maxLean = this.handling.maxBodyLean ?? 0.12;
    const targetLean = drifting
      ? -input.steer * maxLean * (0.4 + 0.6 * intensity)
      : 0;
    const leanRate = (this.handling.bodyLeanStiffness ?? 8) * dt;
    this._bodyLean += (targetLean - this._bodyLean) * Math.min(1, leanRate);
    if (this.bodyGroup) this.bodyGroup.rotation.z = this._bodyLean;

    // Puff: fade the sprite in with intensity while drifting, out otherwise.
    if (this.puff) {
      const target = drifting ? 0.15 + 0.55 * intensity : 0;
      const cur = this.puff.material.opacity;
      this.puff.material.opacity = cur + (target - cur) * Math.min(1, 6 * dt);
      this.puff.visible = this.puff.material.opacity > 0.01;
    }

    // Skid marks: drop a pair of quads under the rear wheels once the car has
    // travelled far enough since the last drop, so the pool lasts through a
    // whole corner instead of being spent in a few frames.
    const p = this.group.position;
    const moved = Math.hypot(p.x - this._lastMarkPos.x, p.z - this._lastMarkPos.z);
    this._distanceSinceMark += moved;
    this._lastMarkPos.x = p.x;
    this._lastMarkPos.z = p.z;

    const spacing = this.handling.skidMarkSpacing ?? 0.6;
    if (drifting && this._distanceSinceMark >= spacing) {
      this._distanceSinceMark = 0;
      const transforms = this.vehicle.getWheelTransforms();
      for (const i of [2, 3]) {
        const t = transforms[i];
        if (t) this.skidMarks.drop(t.position, heading, intensity);
      }
    }

    this.skidMarks.update(dt);
  }

  /** @returns {boolean} whether the car is currently drifting/sliding. */
  get drifting() {
    return this._drifting;
  }

  /**
   * @returns {{speed:number, position:{x:number,y:number,z:number}|null}}
   *   the strongest collision impact recorded during the most recent
   *   update() call (speed 0/position null if none).
   */
  get lastImpact() {
    return this._lastImpact;
  }

  /**
   * Copy the solved physics transforms onto the visual group and wheels.
   * Safe to call any time after a physics step.
   */
  sync() {
    const p = this.vehicle.position;
    const q = this.vehicle.quaternion;
    this.group.position.set(p.x, p.y, p.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);

    const transforms = this.vehicle.getWheelTransforms();
    for (let i = 0; i < this.wheelMeshes.length; i++) {
      const t = transforms[i];
      const mesh = this.wheelMeshes[i];
      mesh.position.set(t.position.x, t.position.y, t.position.z);
      mesh.quaternion.set(
        t.quaternion.x,
        t.quaternion.y,
        t.quaternion.z,
        t.quaternion.w,
      );
    }
  }

  /**
   * Return the car to a spawn pose (defaults to the original spawn) and reset
   * smoothed steering.
   * @param {{x:number,y:number,z:number}} [spawn]
   */
  reset(spawn) {
    const target = spawn ?? this._spawn;
    this.vehicle.reset(target);
    this._steer = 0;
    this._resetDriftFeedback(target);
    this.sync();
  }

  /** Clear all drift feedback (lean, puff, pooled marks) after a teleport. */
  _resetDriftFeedback(pose) {
    this._bodyLean = 0;
    this._drifting = false;
    this._distanceSinceMark = 0;
    if (pose) {
      this._lastMarkPos.x = pose.x;
      this._lastMarkPos.z = pose.z;
    }
    if (this.bodyGroup) this.bodyGroup.rotation.z = 0;
    if (this.puff) {
      this.puff.material.opacity = 0;
      this.puff.visible = false;
    }
    if (this.skidMarks) this.skidMarks.clear();
    if (this.sparks) this.sparks.clear();
    this._lastImpact = { speed: 0, position: null };
  }

  /** @returns {number} unsigned speed in km/h for the HUD */
  get speedKmh() {
    return Math.abs(kmhFromMs(this.vehicle.speed));
  }

  /** @returns {boolean} true when the car's signed speed is meaningfully negative (reversing), for the HUD gear indicator */
  get reversing() {
    return this.vehicle.speed < -0.5;
  }

  /** @returns {THREE.Vector3} world position of the car body */
  get position() {
    return this.group.position;
  }

  /** @returns {number} yaw (heading) in radians derived from the body quaternion */
  get heading() {
    const q = this.group.quaternion;
    // Yaw about Y from a quaternion.
    const siny = 2 * (q.w * q.y + q.z * q.x);
    const cosy = 1 - 2 * (q.y * q.y + q.x * q.x);
    return Math.atan2(siny, cosy);
  }
}

export default Car;
