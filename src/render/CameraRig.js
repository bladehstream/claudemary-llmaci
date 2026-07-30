/* ============================================================
   Chase camera. Distance and height scale with the katamari so
   the ball always fills a similar slice of the screen whether
   it is 5cm or 150m across.
   ============================================================ */

import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../util/math.js';

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.34;
    this.distMul = 6.2;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.quickTurn = 0;
    this._initialised = false;
  }

  configure(cfg, yaw) {
    this.pitch = cfg.pitch;
    this.distMul = cfg.distance;
    this.yaw = yaw;
    this._initialised = false;
  }

  input(dx, dy, sensitivity, invert) {
    this.yaw -= dx * 0.0022 * sensitivity;
    this.pitch = clamp(this.pitch + (invert ? -1 : 1) * dy * 0.0018 * sensitivity, -0.12, 1.15);
  }

  /** Flip to look at the far side of the katamari. */
  flip() {
    this.quickTurn = Math.PI;
  }

  update(dt, kat, world) {
    if (this.quickTurn !== 0) {
      const step = Math.sign(this.quickTurn) * Math.min(Math.abs(this.quickTurn), dt * 9);
      this.yaw += step;
      this.quickTurn -= step;
      if (Math.abs(this.quickTurn) < 1e-3) this.quickTurn = 0;
    }

    const R = kat.radius;
    // Distance is a function of SIZE ONLY. It used to also pull back with
    // speed, which meant the view crept in and out every time you accelerated
    // or braked — the camera doing something the player did not ask it to.
    const dist = R * this.distMul;
    // Deliberately shallow. A steeper rig shows mostly floor, and the whole
    // appeal of this game is seeing the next thing you are about to eat.
    const height = R * (0.5 + this.pitch * 1.15);

    _target.set(kat.group.position.x, kat.group.position.y + R * 0.25, kat.group.position.z);

    /* Smooth the POINT WE FOLLOW; never the orbit around it.

       Damping the camera's world position instead makes every mouse movement
       arrive late, because swinging the yaw moves the desired position and the
       rig then eases toward it. And tying the damping rate to `speedFrac` made
       that lag vary with acceleration and braking, so the camera felt heaviest
       exactly when you were trying to look around.

       Following the ball still wants smoothing — it hops over kerbs and gets
       shoved by collisions. Looking around does not. So: damp the target, then
       place the camera on the orbit from the current yaw/pitch with no
       filtering at all, and the mouse is exact while the follow stays soft. */
    if (!this._initialised) {
      this.look.copy(_target);
      this._initialised = true;
    } else {
      const rate = 12;                    // constant — NOT a function of speed
      this.look.x = damp(this.look.x, _target.x, rate, dt);
      this.look.y = damp(this.look.y, _target.y, rate * 0.85, dt);
      this.look.z = damp(this.look.z, _target.z, rate, dt);
    }

    const cp = Math.cos(this.pitch);
    _desired.set(
      this.look.x + Math.sin(this.yaw) * dist * cp,
      this.look.y + height + Math.sin(this.pitch) * dist * 0.55,
      this.look.z + Math.cos(this.yaw) * dist * cp,
    );

    // Keep the rig inside the stage. In the house the room walls sit on the
    // bounds, so a big katamari in a corner would otherwise push the camera
    // out through the wall and fill the screen with plaster.
    if (world && world.bounds) {
      const b = world.bounds;
      const pad = Math.min(R * 0.6, 2);
      _desired.x = clamp(_desired.x, b.minX + pad, b.maxX - pad);
      _desired.z = clamp(_desired.z, b.minZ + pad, b.maxZ - pad);
    }

    // Don't let the camera sink through the floor.
    const floor = world ? world.groundAt(_desired.x, _desired.z) : 0;
    if (isFinite(floor) && floor < 1e5) _desired.y = Math.max(_desired.y, floor + R * 0.55);

    this.pos.copy(_desired);

    if (this.shake > 0.0001) {
      const s = this.shake * R * 0.11;
      this.camera.position.set(
        this.pos.x + (Math.random() - 0.5) * s,
        this.pos.y + (Math.random() - 0.5) * s,
        this.pos.z + (Math.random() - 0.5) * s,
      );
      this.shake = Math.max(0, this.shake - dt * 3.6);
    } else {
      this.camera.position.copy(this.pos);
    }
    this.camera.lookAt(this.look);

    // Depth range follows the katamari's scale.
    const near = clamp(R * 0.06, 0.004, 4);
    // Match the fog so we are not rasterising a whole city that is
    // invisible behind it anyway.
    const far = Math.max(R * 60, (this.fogFar || 400) * 1.25);
    if (this.camera.near !== near || this.camera.far !== far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    return far;
  }

  bump(amount) { this.shake = Math.min(1.6, this.shake + amount); }
}
