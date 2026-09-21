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
    clearColor: 0xd9803f,
    fogColor: 0xe6935a,
    fogNear: 120,
    fogFar: 620,
    // Tone-mapping exposure for the ACESFilmic curve applied in the renderer.
    toneMappingExposure: 1.15,
    // Postprocessing (EffectComposer + UnrealBloomPass + OutputPass), loaded
    // from the same three/addons/ CDN prefix already used elsewhere. Disable
    // to fall back to a direct renderer.render() call (e.g. for low-end GPUs).
    postprocessing: Object.freeze({
      enabled: true,
      bloomStrength: 0.55,
      bloomRadius: 0.45,
      bloomThreshold: 0.82,
    }),
  }),

  environment: Object.freeze({
    // Procedural gradient sky (generated on a canvas, no network asset).
    // Colours blend top -> horizon down the dome. Warm sunset palette.
    skyTopColor: 0x2b3f77,
    skyHorizonColor: 0xff9d5c,
    // Radius of the sky dome sphere (metres). Sits well outside the far plane
    // of the fog so the gradient reads as a distant sky.
    skyRadius: 900,
    // Low-angle warm "sun" light for a dramatic sunset look, with soft edged
    // shadows from the framed shadow camera below.
    sunColor: 0xffb066,
    sunIntensity: 2.4,
    sunPosition: Object.freeze({ x: 220, y: 70, z: -40 }),
    // Shadow camera orthographic half-size framed around the whole track.
    shadowCameraSize: 200,
    shadowMapSize: 2048,
    shadowBias: -0.0004,
    // Hemisphere fill so shadowed faces are lit by sky/ground bounce. Warm
    // sky tint above, cool-ish ground bounce below for contrast.
    skyFillColor: 0xff9d6a,
    groundFillColor: 0x2c2a3a,
    hemisphereIntensity: 0.55,
    // A low ambient floor so nothing is pure black.
    ambientColor: 0x3a3450,
    ambientIntensity: 0.3,
    // Cool rim/fill light opposite the sun, so shadowed faces are not flatly
    // dark (cheap approximation of bounce light without extra shadow maps).
    rimColor: 0x6a86ff,
    rimIntensity: 0.5,
    rimPosition: Object.freeze({ x: -160, y: 90, z: 140 }),
    // Reflection environment map (generated procedurally via three/addons'
    // RoomEnvironment + PMREMGenerator, no HDRI download) applied to
    // scene.environment so metallic/glossy surfaces (car body, glass) pick up
    // soft reflections.
    envMapEnabled: true,
    envMapIntensity: 0.9,
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
    // Screen-shake on hard collisions: a short decaying positional jolt applied
    // on top of the smoothed chase-cam position. impulse -> initial magnitude
    // (metres), decay -> how fast it settles (per second, exponential).
    shakeDecay: 9,
    // Impulse (m/s change) below this is ignored so gentle wall taps do not
    // shake the camera.
    shakeMinImpulse: 3,
    // Impulse mapped to full-strength shake for the max magnitude below.
    shakeMaxImpulse: 16,
    shakeMaxMagnitude: 0.35,
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
    // Rolling-resistance brake force applied while coasting (no throttle or
    // brake held) so the car gently slows instead of freewheeling forever.
    coastBrakeForce: 2,
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

  scenery: Object.freeze({
    // Roadside decoration (trees + grandstands), placed procedurally along the
    // offset centerline. Purely visual: no physics bodies, so collision
    // geometry (barriers) is unaffected. Placement keeps a minimum clearance
    // from the barrier line so nothing pokes through the track edge.
    enabled: true,
    // Lateral clearance (metres) beyond the barrier before scenery may sit.
    clearance: 4,
    tree: Object.freeze({
      // Roughly every N metres of centerline a tree cluster is attempted on
      // each side, skipping a side at random for a less uniform tree line.
      spacing: 14,
      // Extra random lateral jitter (metres) added beyond the base offset.
      jitter: 6,
      minOffset: 3,
      maxOffset: 22,
      minHeight: 4,
      maxHeight: 7.5,
      minRadius: 1.1,
      maxRadius: 1.9,
      trunkColor: 0x5b3a29,
      canopyColors: Object.freeze([0x2f6b34, 0x35803b, 0x27592c]),
    }),
    grandstand: Object.freeze({
      // Number of grandstand blocks placed at evenly spaced intervals along
      // the loop (on alternating sides) for a "race day" backdrop.
      count: 5,
      offset: 16,
      width: 22,
      depth: 6,
      height: 8,
      frameColor: 0x545a66,
      seatColors: Object.freeze([0x3b6ea5, 0xd2482a, 0xe0b23a, 0x3f9457]),
    }),
  }),

  fx: Object.freeze({
    // Speed-line (radial streak) postprocessing-free overlay: implemented as a
    // full-screen DOM/canvas vignette whose opacity ramps with speed, cheap
    // enough to run without a dedicated composer pass.
    speedLines: Object.freeze({
      enabled: true,
      // Speed (km/h) at which lines start to appear / reach full strength.
      startKmh: 90,
      maxKmh: 220,
      maxOpacity: 0.55,
    }),
    // Wall-collision sparks: a short-lived burst of small bright particles
    // spawned at the impact point. Pooled the same way skid marks are.
    sparks: Object.freeze({
      enabled: true,
      pool: 120,
      particlesPerHit: 14,
      lifetime: 0.5,
      speed: 6,
      // Impact speed (m/s change) below which no sparks are spawned.
      minImpactSpeed: 2.5,
      color: 0xffcf7a,
    }),
    // Dust puffs kicked up by wheelspin on a hard launch (high throttle from
    // near-standstill), reusing the same pooled-sprite approach as the
    // existing tire-smoke puff. See logic/dust.js#wheelspinIntensity for the
    // pure trigger math; distinct from the drift smoke puff, which is keyed
    // off lateral slip rather than throttle.
    dust: Object.freeze({
      enabled: true,
      color: 0xcabf9a,
      // Throttle must be at or above this to start kicking up dust.
      minThrottle: 0.6,
      // Dust fades out once speed reaches this (km/h); a launch-only effect.
      cutoffKmh: 45,
    }),
  }),

  hud: Object.freeze({
    // Dial-style speedometer geometry (SVG-driven, DOM based). Angles are in
    // degrees, measured clockwise from straight up (12 o'clock = 0).
    speedoMaxKmh: 240,
    speedoStartAngle: -130,
    speedoEndAngle: 130,
    // Redline zone (fraction of speedoMaxKmh) rendered in a warning colour.
    redlineFraction: 0.82,
  }),

  audio: Object.freeze({
    enabled: true,
    masterVolume: 0.55,
    engine: Object.freeze({
      // Base oscillator frequency (Hz) at idle (speed 0) and the additional
      // frequency added per km/h, giving a simple RPM-ish pitch curve.
      idleHz: 55,
      hzPerKmh: 2.6,
      maxHz: 260,
      // Throttle blends in a brighter overtone for a "under load" feel.
      volumeIdle: 0.05,
      volumeMax: 0.32,
    }),
    tireScreech: Object.freeze({
      volumeMax: 0.28,
      // How quickly screech volume eases toward its target (per second).
      attackRate: 10,
      releaseRate: 6,
    }),
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
    // How far back along -forward (metres) the car is placed from a spawn or
    // respawn point, so it crosses the line ahead of it cleanly instead of
    // straddling it. Used by both the grid spawn and mid-race checkpoint
    // recovery so the offset convention stays in one place.
    spawnBackOffset: 6,
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
