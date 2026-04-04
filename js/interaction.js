/**
 * Interaction
 * Handles click-to-recenter, drag-to-rotate, zoom, and hover for the hyperbolic view.
 */
import { mobiusTransform, mobiusInverse, hyperbolicRotation, screenToDisk, cAbs } from './hyperbolic-math.js';

export class Interaction {
  constructor(svgElement, app) {
    this.svg = svgElement;
    this.app = app;

    // Current Möbius transform state
    this.center = [0, 0];   // current center point in original disk
    this.rotation = 0;      // current rotation angle

    this._setupDrag();
    this._setupZoom();
  }

  /**
   * Apply the current transform to a disk point.
   */
  transform(z) {
    let w = mobiusTransform(z, this.center);
    w = hyperbolicRotation(w, this.rotation);
    return w;
  }

  /**
   * Animate re-centering on a new point.
   */
  recenter(targetDiskPos, duration = 600) {
    // Target: the point we want at center in the ORIGINAL coordinate system
    // We need to compose: first apply current transform, then new centering
    const currentCenter = this.center;
    const targetInCurrent = mobiusTransform(targetDiskPos, currentCenter);
    const rotatedTarget = hyperbolicRotation(targetInCurrent, this.rotation);

    const startCenter = [0, 0]; // In current transformed space, we're at origin
    const endCenter = rotatedTarget;

    const startRotation = this.rotation;

    return new Promise(resolve => {
      const startTime = performance.now();
      const animate = (time) => {
        const elapsed = time - startTime;
        const t = Math.min(1, elapsed / duration);
        // Ease in-out
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        // Interpolate the center
        const interpCenter = [
          endCenter[0] * eased,
          endCenter[1] * eased
        ];

        // Apply incremental transform
        this.app.setTransform(z => {
          let w = mobiusTransform(z, currentCenter);
          w = hyperbolicRotation(w, startRotation);
          w = mobiusTransform(w, interpCenter);
          return w;
        });

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          // Finalize: compute new composite center
          // After animation, the new state is: T_endCenter ∘ R_startRotation ∘ T_currentCenter
          // Store as a simple center + rotation
          this.center = targetDiskPos;
          this.rotation = startRotation;
          this.app.setTransform(z => this.transform(z));
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  }

  _setupDrag() {
    let dragStart = null;
    let startRotation = 0;

    const svg = d3.select(this.svg);

    svg.on('mousedown', (event) => {
      if (event.target.closest('.node')) return;
      dragStart = { x: event.clientX, y: event.clientY };
      startRotation = this.rotation;
      event.preventDefault();
    });

    svg.on('mousemove', (event) => {
      if (!dragStart) return;
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;

      // Convert drag distance to rotation angle
      const dragAngle = Math.atan2(dy, dx) - Math.atan2(0, 1);
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.rotation = startRotation + distance * 0.005;

      this.app.setTransform(z => this.transform(z));
      this.app.render();
    });

    svg.on('mouseup', () => { dragStart = null; });
    svg.on('mouseleave', () => { dragStart = null; });
  }

  _setupZoom() {
    const svg = d3.select(this.svg);

    svg.on('wheel', (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.05 : -0.05;
      this.app.adjustStep(delta);
    });
  }

  reset() {
    this.center = [0, 0];
    this.rotation = 0;
  }
}
