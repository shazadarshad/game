/**
 * world.js
 *
 * Thin wrapper around a CANNON.World tuned for arcade vehicle handling. Owns
 * gravity, broadphase, the solver, a shared default contact material, and a
 * flat static ground body (a plane). Exposes step() and add/remove helpers so
 * game code never touches the raw world directly, plus a syncMesh() helper that
 * copies a Cannon body transform onto a Three mesh/group.
 *
 * Runs in the browser only. The bare specifier "cannon-es" resolves via the
 * importmap in index.html, so this file is not importable by Node (it is only
 * syntax-checked offline).
 */
import * as CANNON from "cannon-es";
import { CONFIG } from "../config.js";

export class PhysicsWorld {
  constructor() {
    const world = new CANNON.World();
    world.gravity.set(0, CONFIG.physics.gravity, 0);

    // SAP broadphase is a good default for many mostly-static bodies.
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 12;
    world.solver.tolerance = 0.001;

    // Shared material so tyre <-> ground friction is predictable. The raycast
    // vehicle handles wheel grip itself, but bodies resting on the ground
    // (props, the chassis when it lands) use this contact pairing.
    const defaultMaterial = new CANNON.Material("default");
    const defaultContact = new CANNON.ContactMaterial(
      defaultMaterial,
      defaultMaterial,
      {
        friction: 0.4,
        restitution: 0.1,
      },
    );
    world.addContactMaterial(defaultContact);
    world.defaultContactMaterial = defaultContact;

    this.world = world;
    this.defaultMaterial = defaultMaterial;

    this._addGround();
  }

  /**
   * Static, infinite-friction ground plane at y = 0. A plane is effectively
   * unbounded, so CONFIG.world.groundSize is only used by the visual ground;
   * the physics plane covers the whole level regardless.
   */
  _addGround() {
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0,
      material: this.defaultMaterial,
      type: CANNON.Body.STATIC,
    });
    groundBody.addShape(groundShape);
    // Rotate the plane so its +normal points up (+Y).
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);
    this.groundBody = groundBody;
  }

  /**
   * Advance the simulation by a fixed step, letting Cannon interpolate with up
   * to `subSteps` internal substeps if the frame ran long.
   * @param {number} dt fixed step in seconds
   * @param {number} [subSteps]
   */
  step(dt, subSteps = CONFIG.physics.maxSubSteps) {
    this.world.step(dt, dt, subSteps);
  }

  /** @param {CANNON.Body} body */
  addBody(body) {
    this.world.addBody(body);
  }

  /** @param {CANNON.Body} body */
  removeBody(body) {
    this.world.removeBody(body);
  }

  /**
   * Copy a Cannon body transform onto a Three mesh/group.
   * Both APIs expose {x,y,z(,w)} so copy() works across the boundary.
   * @param {{position:object, quaternion:object}} mesh a THREE.Object3D
   * @param {CANNON.Body} body
   */
  static syncMesh(mesh, body) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
}

export default PhysicsWorld;
