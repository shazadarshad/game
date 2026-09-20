/**
 * vehicle.js
 *
 * CANNON.RaycastVehicle wrapper. Builds a box chassis body and four wheels with
 * tuned suspension from CONFIG.vehicle, then exposes a small imperative API the
 * Car class drives each fixed step: setThrottle/setBrake/setSteer/setHandbrake,
 * reset(), and getters for speed and per-wheel render transforms.
 *
 * The raycast vehicle simulates wheels as rays instead of rigid bodies, which
 * gives stable, arcade-friendly handling. applyEngineForce drives the rear
 * wheels, setSteeringValue turns the front wheels.
 *
 * Runs in the browser only ("cannon-es" resolves via the importmap).
 */
import * as CANNON from "cannon-es";
import { CONFIG } from "../config.js";

// Wheel index layout: 0 front-left, 1 front-right, 2 rear-left, 3 rear-right.
const FRONT_WHEELS = [0, 1];
const REAR_WHEELS = [2, 3];

export class Vehicle {
  /**
   * @param {import('./world.js').PhysicsWorld} physicsWorld
   * @param {{x:number,y:number,z:number}} [spawn]
   */
  constructor(physicsWorld, spawn = { x: 0, y: 1.5, z: 0 }) {
    this.physicsWorld = physicsWorld;
    this.cfg = CONFIG.vehicle;
    this._spawn = new CANNON.Vec3(spawn.x, spawn.y, spawn.z);
    this._spawnQuat = new CANNON.Quaternion();

    this._buildChassis();
    this._buildVehicle();
    this._addWheels();

    this.vehicle.addToWorld(physicsWorld.world);

    // Scratch objects reused by the per-wheel transform getters.
    this._wheelTransforms = this.vehicle.wheelInfos.map(() => ({
      position: new CANNON.Vec3(),
      quaternion: new CANNON.Quaternion(),
    }));
  }

  _buildChassis() {
    const he = this.cfg.chassisHalfExtents;
    const shape = new CANNON.Box(new CANNON.Vec3(he.x, he.y, he.z));
    const body = new CANNON.Body({
      mass: this.cfg.mass,
      material: this.physicsWorld.defaultMaterial,
    });
    // Offset the collision shape so the centre of mass sits low, which keeps
    // the car planted and resistant to rolling in hard corners.
    body.addShape(shape, new CANNON.Vec3(0, this.cfg.chassisMassOffsetY, 0));
    body.position.copy(this._spawn);
    body.angularDamping = 0.4;
    this.chassisBody = body;
  }

  _buildVehicle() {
    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      // Cannon axis indices: x=0, y=1, z=2.
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });
  }

  _addWheels() {
    const s = this.cfg.suspension;
    const w = this.cfg.wheel;

    const base = {
      radius: w.radius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: s.stiffness,
      suspensionRestLength: s.restLength,
      maxSuspensionTravel: s.maxTravel,
      maxSuspensionForce: s.maxForce,
      dampingRelaxation: s.dampingRelaxation,
      dampingCompression: s.dampingCompression,
      frictionSlip: w.frictionSlip,
      rollInfluence: w.rollInfluence,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      useCustomSlidingRotationalSpeed: true,
      customSlidingRotationalSpeed: -30,
    };

    const y = w.connectionHeight;

    // Four wheels added explicitly: front-left, front-right, rear-left,
    // rear-right. Each gets a fresh options object so the connection point is
    // not shared by reference.
    this.vehicle.addWheel({
      ...base,
      chassisConnectionPointLocal: new CANNON.Vec3(w.halfTrack, y, w.frontOffsetZ),
    });
    this.vehicle.addWheel({
      ...base,
      chassisConnectionPointLocal: new CANNON.Vec3(-w.halfTrack, y, w.frontOffsetZ),
    });
    this.vehicle.addWheel({
      ...base,
      chassisConnectionPointLocal: new CANNON.Vec3(w.halfTrack, y, w.rearOffsetZ),
    });
    this.vehicle.addWheel({
      ...base,
      chassisConnectionPointLocal: new CANNON.Vec3(-w.halfTrack, y, w.rearOffsetZ),
    });

    // Baseline grip so drift can scale it back down at runtime.
    this._baseFrictionSlip = w.frictionSlip;
  }

  /**
   * Drive force applied to the rear wheels. Positive = forward, negative =
   * reverse.
   * @param {number} force newtons
   */
  setThrottle(force) {
    for (const i of REAR_WHEELS) this.vehicle.applyEngineForce(force, i);
  }

  /**
   * Brake force applied to every wheel.
   * @param {number} force
   */
  setBrake(force) {
    for (let i = 0; i < 4; i++) this.vehicle.setBrake(force, i);
  }

  /**
   * Steering angle applied to the front wheels.
   * @param {number} angle radians
   */
  setSteer(angle) {
    for (const i of FRONT_WHEELS) this.vehicle.setSteeringValue(angle, i);
  }

  /**
   * Handbrake: locks the rear wheels loose by scaling their grip. Pass a grip
   * multiplier in [0,1]; 1 restores full grip.
   * @param {boolean} on
   * @param {number} [frictionMultiplier]
   */
  setHandbrake(on, frictionMultiplier = 1) {
    const slip = on
      ? this._baseFrictionSlip * frictionMultiplier
      : this._baseFrictionSlip;
    for (const i of REAR_WHEELS) {
      this.vehicle.wheelInfos[i].frictionSlip = slip;
    }
  }

  /**
   * Directly scale rear-wheel grip (used by the drift assist while cornering
   * fast). 1 restores the configured baseline.
   * @param {number} multiplier
   */
  setRearGrip(multiplier) {
    const slip = this._baseFrictionSlip * multiplier;
    for (const i of REAR_WHEELS) {
      this.vehicle.wheelInfos[i].frictionSlip = slip;
    }
  }

  /**
   * Teleport the chassis back to a spawn pose and kill all velocity.
   * @param {{x:number,y:number,z:number}} [position]
   * @param {{x:number,y:number,z:number,w:number}} [quaternion]
   */
  reset(position, quaternion) {
    const body = this.chassisBody;
    if (position) this._spawn.set(position.x, position.y, position.z);
    body.position.copy(this._spawn);

    if (quaternion) {
      this._spawnQuat.set(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w,
      );
    }
    body.quaternion.copy(this._spawnQuat);

    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.force.setZero();
    body.torque.setZero();

    this.setThrottle(0);
    this.setBrake(0);
    this.setSteer(0);
    this.setHandbrake(false);
    body.wakeUp();
  }

  /** @returns {number} signed forward speed in m/s */
  get speed() {
    // getCurrentSpeedKmHour is signed (negative in reverse); convert back.
    return this.vehicle.currentVehicleSpeedKmHour / 3.6;
  }

  /** @returns {number} speed in km/h (signed) */
  get speedKmh() {
    return this.vehicle.currentVehicleSpeedKmHour;
  }

  /** @returns {CANNON.Vec3} chassis world position */
  get position() {
    return this.chassisBody.position;
  }

  /** @returns {CANNON.Quaternion} chassis world orientation */
  get quaternion() {
    return this.chassisBody.quaternion;
  }

  /**
   * Refresh and return the world transform of each wheel for rendering.
   * Call once per frame after the physics step.
   * @returns {{position:CANNON.Vec3, quaternion:CANNON.Quaternion}[]}
   */
  getWheelTransforms() {
    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform;
      this._wheelTransforms[i].position.copy(t.position);
      this._wheelTransforms[i].quaternion.copy(t.quaternion);
    }
    return this._wheelTransforms;
  }
}

export default Vehicle;
