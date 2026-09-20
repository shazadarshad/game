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
    // Tone-mapping exposure for the ACESFilmic curve applied in the renderer.
    toneMappingExposure: 1.05,
  }),

  environment: Object.freeze({
    // Procedural gradient sky (generated on a canvas, no network asset).
    // Colours blend top -> horizon down the dome.
    skyTopColor: 0x2a63b8,
    skyHorizonColor: 0xbfe0ff,
    // Radius of the sky dome sphere (metres). Sits well outside the far plane
    // of the fog so the gradient reads as a distant sky.
    skyRadius: 900,
    // Directional "sun" light.
    sunColor: 0xfff2d8,
    sunIntensity: 2.0,
    sunPosition: Object.freeze({ x: 120, y: 200, z: 90 }),
    // Shadow camera orthographic half-size framed around the whole track.
    shadowCameraSize: 200,
    shadowMapSize: 2048,
    shadowBias: -0.0004,
    // Hemisphere fill so shadowed faces are lit by sky/ground bounce.
    skyFillColor: 0xbfd8ff,
    groundFillColor: 0x3a4a2f,
    hemisphereIntensity: 0.7,
    // A low ambient floor so nothing is pure black.
    ambientColor: 0x404858,
    ambientIntensity: 0.35,
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
    // Lateral slip (m/s) above which skid feedback (tire marks, puff, body
    // lean) begins to appear. Below this the car is considered gripping.
    skidSlipThreshold: 3.2,
    // Lateral slip (m/s) mapped to full drift intensity (1.0) for lean/opacity.
    skidSlipMax: 10,
    // Maximum arcade body-lean angle (radians) into a full-intensity drift.
    maxBodyLean: 0.12,
    // How quickly the visual body lean eases toward its target (per second).
    bodyLeanStiffness: 8,
    // Skid-mark decal pool: max quads kept alive before the oldest is reused.
    skidMarkPool: 240,
    // Minimum ground distance (m) the car must travel before dropping the next
    // pair of skid quads, so the pool is not exhausted in a single corner.
    skidMarkSpacing: 0.6,
    // Lifetime (seconds) a skid mark stays fully opaque before it fades out.
    skidMarkLifetime: 6,
  }),

  world: Object.freeze({
    groundSize: 2000,
    groundColor: 0x3a4a2f,
  }),

  race: Object.freeze({
    totalLaps: 3,
    countdownSeconds: 3,
    // Milliseconds each countdown number (and the final "GO!") is displayed.
    countdownIntervalMs: 1000,
    goHoldMs: 700,
  }),

  track: Object.freeze({
    // Half-width of the drivable road ribbon (metres). The full road is twice
    // this wide. Barriers sit just outside the road edges.
    roadHalfWidth: 9,
    // Barrier dimensions (metres). Walls run along both road edges.
    barrierHeight: 1.4,
    barrierThickness: 0.8,
    // How far each checkpoint gate reaches from the centerline to each side.
    // Slightly wider than the road so a car anywhere on the tarmac triggers it.
    checkpointHalfWidth: 11,
    // Number of checkpoint gates placed evenly along the centerline (including
    // the start/finish gate at index 0). Must be >= 2.
    checkpointCount: 8,
    // Visual road material colours.
    roadColor: 0x2b2f38,
    roadEdgeColor: 0xe8e8ec,
    barrierColor: 0xb63b3b,
    barrierAccentColor: 0xf2f2f5,
    startLineColor: 0xf5f5f8,
    // Height the car spawns above the road so it settles onto its wheels.
    spawnHeight: 1.4,
    // Closed-circuit centerline: a hand-designed loop with two long straights,
    // a wide sweeper, a hairpin, and a couple of esses. Points are in metres on
    // the XZ plane (y = 0). The list is a closed loop; the last point connects
    // back to the first. Kept as a plain array (not frozen deeply) so the track
    // builder can read it without cloning.
    centerline: Object.freeze([
      Object.freeze({ x: 0, z: 0 }),
      Object.freeze({ x: 0, z: 60 }),
      Object.freeze({ x: 0, z: 120 }),
      Object.freeze({ x: 6, z: 168 }),
      Object.freeze({ x: 28, z: 196 }),
      Object.freeze({ x: 64, z: 204 }),
      Object.freeze({ x: 100, z: 196 }),
      Object.freeze({ x: 124, z: 168 }),
      Object.freeze({ x: 130, z: 128 }),
      Object.freeze({ x: 120, z: 96 }),
      Object.freeze({ x: 96, z: 80 }),
      Object.freeze({ x: 72, z: 76 }),
      Object.freeze({ x: 52, z: 60 }),
      Object.freeze({ x: 48, z: 32 }),
      Object.freeze({ x: 64, z: 8 }),
      Object.freeze({ x: 96, z: 0 }),
      Object.freeze({ x: 120, z: -24 }),
      Object.freeze({ x: 120, z: -64 }),
      Object.freeze({ x: 96, z: -88 }),
      Object.freeze({ x: 56, z: -92 }),
      Object.freeze({ x: 20, z: -84 }),
      Object.freeze({ x: 2, z: -56 }),
      Object.freeze({ x: 0, z: -28 }),
    ]),
  }),
});

export default CONFIG;
