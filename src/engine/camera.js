/**
 * camera.js
 *
 * ChaseCamera: smoothly follows a target from behind and above using the
 * critically-damped helpers in game/logic/cameraMath.js. The heavy math lives
 * in that pure module so it can be unit tested without Three; this class just
 * binds it to a THREE.PerspectiveCamera each frame.
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";
import { expDamp, dampAngle } from "../game/logic/cameraMath.js";

export class ChaseCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.cfg = CONFIG.camera;

    // Smoothed state.
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._heading = 0;
    this._zoom = 0;
    this._initialised = false;

    // Scratch vectors reused each frame to avoid allocation.
    this._desiredPos = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();
  }

  /**
   * Snap directly behind the target (used on reset / first frame).
   * @param {THREE.Vector3} position
   * @param {number} heading radians (yaw around Y)
   */
  snap(position, heading) {
    this._heading = heading;
    this._zoom = 0;
    this._computeDesired(position, heading, 0);
    this._pos.copy(this._desiredPos);
    this._look.copy(this._desiredLook);
    this._apply();
    this._initialised = true;
  }

  _computeDesired(position, heading, zoom) {
    const dist = this.cfg.distance + zoom;
    const behindX = -Math.sin(heading);
    const behindZ = -Math.cos(heading);

    this._desiredPos.set(
      position.x + behindX * dist,
      position.y + this.cfg.height,
      position.z + behindZ * dist,
    );

    const aheadX = Math.sin(heading);
    const aheadZ = Math.cos(heading);
    this._desiredLook.set(
      position.x + aheadX * this.cfg.lookAhead,
      position.y + this.cfg.lookHeight,
      position.z + aheadZ * this.cfg.lookAhead,
    );
  }

  /**
   * Follow the target for this frame.
   * @param {THREE.Vector3} position target world position
   * @param {number} heading target yaw in radians
   * @param {number} speed target speed in m/s (drives speed-based zoom)
   * @param {number} dt seconds since last frame
   */
  update(position, heading, speed, dt) {
    if (!this._initialised) {
      this.snap(position, heading);
      return;
    }

    // Smooth the heading so quick spins do not whip the camera.
    this._heading = dampAngle(
      this._heading,
      heading,
      this.cfg.headingStiffness,
      dt,
    );

    const targetZoom = Math.min(
      Math.abs(speed) * this.cfg.speedZoom * 10,
      this.cfg.maxSpeedZoom,
    );
    this._zoom = expDamp(this._zoom, targetZoom, this.cfg.positionStiffness, dt);

    this._computeDesired(position, this._heading, this._zoom);

    this._pos.x = expDamp(this._pos.x, this._desiredPos.x, this.cfg.positionStiffness, dt);
    this._pos.y = expDamp(this._pos.y, this._desiredPos.y, this.cfg.positionStiffness, dt);
    this._pos.z = expDamp(this._pos.z, this._desiredPos.z, this.cfg.positionStiffness, dt);

    this._look.x = expDamp(this._look.x, this._desiredLook.x, this.cfg.positionStiffness, dt);
    this._look.y = expDamp(this._look.y, this._desiredLook.y, this.cfg.positionStiffness, dt);
    this._look.z = expDamp(this._look.z, this._desiredLook.z, this.cfg.positionStiffness, dt);

    this._apply();
  }

  _apply() {
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
  }
}

export default ChaseCamera;
