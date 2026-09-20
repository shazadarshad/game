/**
 * config.js
 *
 * Single source of truth for every tunable constant in the game. Keeping the
 * arcade handling values in one frozen object makes the feel easy to tweak and
 * lets later phases (AI, sound, minimap) read the same numbers.
 *
 * Units: metres, kilograms, seconds, radians unless noted.
 */
export const CONFIG = Object.freeze({
  render: Object.freeze({
    shadows: true,
    fov: 62,
    // Cap devicePixelRatio so high-DPI displays do not tank the frame rate.
    pixelRatioCap: 2,
    clearColor: 0x93c7ff,
    fogColor: 0xaad2ff,
    fogNear: 120,
    fogFar: 620,
  }),

  camera: Object.freeze({
    // Chase camera sits this far behind and above the car.
    distance: 8.5,
    height: 3.4,
    // How far ahead of the car the camera looks.
    lookAhead: 6,
    lookHeight: 1.2,
    // Exponential-damping rates (larger = snappier follow).
    positionStiffness: 6.5,
    headingStiffness: 5.0,
    // Extra pull-back as speed rises, for a sense of velocity.
    speedZoom: 0.0025,
    maxSpeedZoom: 4.5,
  }),

  physics: Object.freeze({
    gravity: -19.6,
    // Fixed simulation timestep (60 Hz) for deterministic handling.
    timestep: 1 / 60,
    // Max substeps the solver may take to catch up after a frame spike.
    maxSubSteps: 4,
  }),

  vehicle: Object.freeze({
    mass: 380,
    engineForce: 2600,
    brakeForce: 42,
    reverseForce: 1200,
    maxSteer: 0.55,
    // Radians per second the steering angle moves toward its target.
    steerSpeed: 3.2,
    // Chassis half-extents (x = width, y = height, z = length).
    chassisHalfExtents: Object.freeze({ x: 0.95, y: 0.35, z: 2.0 }),
    chassisMassOffsetY: -0.35,
    suspension: Object.freeze({
      stiffness: 32,
      dampingRelaxation: 2.6,
      dampingCompression: 4.6,
      restLength: 0.42,
      maxTravel: 0.28,
      maxForce: 100000,
    }),
    wheel: Object.freeze({
      radius: 0.42,
      frictionSlip: 3.6,
      rollInfluence: 0.02,
      // Wheel mount points relative to the chassis centre.
      halfTrack: 0.85,
      frontOffsetZ: 1.5,
      rearOffsetZ: -1.4,
      connectionHeight: -0.1,
    }),
  }),

  handling: Object.freeze({
    // Rear grip is scaled by this while drifting for a slidey feel.
    driftFrictionMultiplier: 0.55,
    // Rear grip while the handbrake is held (locks the rear loose).
    handbrakeFrictionRear: 0.35,
    // Speed (km/h) above which drift assist eases in.
    driftEngageSpeed: 35,
  }),

  world: Object.freeze({
    groundSize: 2000,
    groundColor: 0x3a4a2f,
  }),

  race: Object.freeze({
    totalLaps: 3,
    countdownSeconds: 3,
  }),
});

export default CONFIG;
