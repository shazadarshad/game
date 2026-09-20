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
      roughness: 0.35,
      metalness: 0.35,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1f,
      roughness: 0.55,
      metalness: 0.2,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x223044,
      roughness: 0.1,
      metalness: 0.6,
    });

    // Main body: slightly narrower/lower than the collision box for a beveled
    // silhouette. Lifted so the chassis collision offset lines up visually.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(he.x * 2 * 0.92, he.y * 2 * 0.85, he.z * 2 * 0.96),
      bodyMat,
    );
    body.position.y = 0.02;
    this._shadow(body);
    this.bodyGroup.add(body);

    // Cabin: shorter box set back and up, tinted glass look.
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(he.x * 2 * 0.8, he.y * 2 * 0.7, he.z * 0.95),
      glassMat,
    );
    cabin.position.set(0, he.y + 0.18, -0.1);
    this._shadow(cabin);
    this.bodyGroup.add(cabin);

    // Front and rear bumpers.
    const bumperGeo = new THREE.BoxGeometry(he.x * 2 * 0.98, 0.22, 0.32);
    const frontBumper = new THREE.Mesh(bumperGeo, trimMat);
    frontBumper.position.set(0, -he.y * 0.4, he.z - 0.1);
    this._shadow(frontBumper);
    this.bodyGroup.add(frontBumper);

    const rearBumper = new THREE.Mesh(bumperGeo, trimMat);
    rearBumper.position.set(0, -he.y * 0.4, -he.z + 0.1);
    this._shadow(rearBumper);
    this.bodyGroup.add(rearBumper);

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

    // Emissive headlights so the front reads clearly in low light.
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff6d0,
      emissive: 0xfff2c0,
      emissiveIntensity: 1.4,
      roughness: 0.3,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xaa1414,
      emissive: 0xff2a2a,
      emissiveIntensity: 1.1,
      roughness: 0.3,
    });
    const lightGeo = new THREE.BoxGeometry(0.28, 0.18, 0.08);
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(lightGeo, headMat);
      head.position.set(sx * he.x * 0.6, 0.0, he.z - 0.02);
      this.bodyGroup.add(head);

      const tail = new THREE.Mesh(lightGeo, tailMat);
      tail.position.set(sx * he.x * 0.6, 0.05, -he.z + 0.02);
      this.bodyGroup.add(tail);
    }

    // A light tire-smoke puff shown near the rear while drifting hard. A soft
    // sprite driven by a canvas radial-gradient texture (no network asset).
    this.puff = this._buildPuff();
    if (this.puff) this.bodyGroup.add(this.puff);

    // Wheels live in their own group because the raycast vehicle reports each
    // wheel's world transform independently of the chassis.
    this.wheelGroup = new THREE.Group();
    this.wheelMeshes = [];
    const w = this.cfg.wheel;
    const wheelGeo = new THREE.CylinderGeometry(
      w.radius,
      w.radius,
      0.34,
      20,
    );
    // Cylinder axis is Y by default; rotate so it spins about X (the axle).
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.8,
      metalness: 0.1,
    });
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(wheelGeo, wheelMat);
      this._shadow(mesh);
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
   * Advance the car for one fixed step. The caller is responsible for stepping
   * the physics world itself; this method only sets vehicle controls and then
   * (after the world step) should be followed by sync() via the same call, so
   * we set controls here and sync visuals at the end using the latest solved
   * transforms.
   *
   * @param {number} dt fixed step seconds
   * @param {{throttle:number, brake:number, steer:number, handbrake:boolean}} input
   */
  update(dt, input) {
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
      brakeForce = 2;
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

    this.sync();
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
  }

  /** @returns {number} unsigned speed in km/h for the HUD */
  get speedKmh() {
    return Math.abs(kmhFromMs(this.vehicle.speed));
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
