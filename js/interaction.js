/**
 * Interaction
 * Globe-like navigation: drag to pan via Möbius transforms,
 * scroll to zoom, click to recenter.
 * Auto-rebuilds tree around whoever is closest to center.
 */
import { mobiusTransform, mobiusInverse, hyperbolicRotation, screenToDisk, cAbs, cSub, cScale } from './hyperbolic-math.js';

export class Interaction {
  constructor(svgElement, app) {
    this.svg = svgElement;
    this.app = app;

    this.center = [0, 0];
    this.rotation = 0;

    this._rafId = null;
    this._needsRender = false;
    this._rebuildTimer = null;

    this._setupDrag();
    this._setupZoom();
  }

  transform(z) {
    let w = mobiusTransform(z, this.center);
    w = hyperbolicRotation(w, this.rotation);
    return w;
  }

  _composeShift(newCenter) {
    const unrotated = hyperbolicRotation(newCenter, -this.rotation);
    this.center = mobiusInverse(unrotated, this.center);

    const r = cAbs(this.center);
    if (r > 0.95) {
      this.center = cScale(this.center, 0.95 / r);
    }
  }

  _scheduleRender() {
    if (this._needsRender) return;
    this._needsRender = true;
    this._rafId = requestAnimationFrame(() => {
      this._needsRender = false;
      this.app.transformFn = z => this.transform(z);
      this.app.render();
    });
  }

  /**
   * Schedule a debounced tree rebuild during drag.
   * Fires every 300ms while dragging to keep connections up to date.
   */
  _scheduleRebuild() {
    if (this._rebuildTimer) return;
    this._rebuildTimer = setTimeout(() => {
      this._rebuildTimer = null;
      this.app.rebuildAroundCenter();
    }, 300);
  }

  _cancelRebuild() {
    if (this._rebuildTimer) {
      clearTimeout(this._rebuildTimer);
      this._rebuildTimer = null;
    }
  }

  recenter(targetOriginalPos, duration = 600) {
    const startCenter = this.center.slice();
    const startRotation = this.rotation;
    const targetCenter = targetOriginalPos.slice();

    return new Promise(resolve => {
      const startTime = performance.now();
      const animate = (time) => {
        const elapsed = time - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        this.center = [
          startCenter[0] + (targetCenter[0] - startCenter[0]) * eased,
          startCenter[1] + (targetCenter[1] - startCenter[1]) * eased
        ];
        this.rotation = startRotation;
        this.app.transformFn = z => this.transform(z);
        this.app.render();

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          this.center = targetCenter;
          this.app.transformFn = z => this.transform(z);
          this.app.render();
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  }

  _getRendererInfo() {
    const r = this.app.renderer;
    return { cx: r.cx, cy: r.cy, radius: r.radius };
  }

  _setupDrag() {
    let dragging = false;
    let lastDiskPos = null;
    let hasMoved = false;

    const svg = d3.select(this.svg);

    svg.on('mousedown', (event) => {
      if (event.target.closest('.node')) return;
      event.preventDefault();
      dragging = true;
      hasMoved = false;
      const { cx, cy, radius } = this._getRendererInfo();
      const rect = this.svg.getBoundingClientRect();
      lastDiskPos = screenToDisk(event.clientX - rect.left, event.clientY - rect.top, cx, cy, radius);
    });

    svg.on('mousemove', (event) => {
      if (!dragging || !lastDiskPos) return;

      const { cx, cy, radius } = this._getRendererInfo();
      const rect = this.svg.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const currentDiskPos = screenToDisk(mx, my, cx, cy, radius);

      const cr = cAbs(currentDiskPos);
      if (cr >= 0.95) return;

      const delta = cSub(lastDiskPos, currentDiskPos);
      const scaledDelta = cScale(delta, 0.5);

      if (cAbs(scaledDelta) > 0.001) {
        this._composeShift(scaledDelta);
        this._scheduleRender();
        hasMoved = true;
        // Debounced rebuild during drag
        this._scheduleRebuild();
      }

      lastDiskPos = currentDiskPos;
    });

    svg.on('mouseup', () => {
      if (dragging && hasMoved) {
        this._cancelRebuild();
        // Immediate rebuild on release
        this.app.rebuildAroundCenter();
      }
      dragging = false;
      lastDiskPos = null;
      hasMoved = false;
    });

    svg.on('mouseleave', () => {
      if (dragging && hasMoved) {
        this._cancelRebuild();
        this.app.rebuildAroundCenter();
      }
      dragging = false;
      lastDiskPos = null;
      hasMoved = false;
    });

    // Touch support
    svg.on('touchstart', (event) => {
      if (event.target.closest('.node')) return;
      event.preventDefault();
      dragging = true;
      hasMoved = false;
      const touch = event.touches[0];
      const { cx, cy, radius } = this._getRendererInfo();
      const rect = this.svg.getBoundingClientRect();
      lastDiskPos = screenToDisk(touch.clientX - rect.left, touch.clientY - rect.top, cx, cy, radius);
    });

    svg.on('touchmove', (event) => {
      if (!dragging || !lastDiskPos) return;
      event.preventDefault();
      const touch = event.touches[0];
      const { cx, cy, radius } = this._getRendererInfo();
      const rect = this.svg.getBoundingClientRect();
      const currentDiskPos = screenToDisk(touch.clientX - rect.left, touch.clientY - rect.top, cx, cy, radius);

      const cr = cAbs(currentDiskPos);
      if (cr >= 0.95) return;

      const delta = cSub(lastDiskPos, currentDiskPos);
      const scaledDelta = cScale(delta, 0.5);
      if (cAbs(scaledDelta) > 0.001) {
        this._composeShift(scaledDelta);
        this._scheduleRender();
        hasMoved = true;
        this._scheduleRebuild();
      }
      lastDiskPos = currentDiskPos;
    });

    svg.on('touchend', () => {
      if (dragging && hasMoved) {
        this._cancelRebuild();
        this.app.rebuildAroundCenter();
      }
      dragging = false;
      lastDiskPos = null;
      hasMoved = false;
    });
  }

  _setupZoom() {
    d3.select(this.svg).on('wheel', (event) => {
      if (event.ctrlKey) return; // Let Ctrl+Wheel pass through for UI zoom
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.05 : -0.05;
      this.app.adjustStep(delta);
    });
  }

  reset() {
    this.center = [0, 0];
    this.rotation = 0;
    this._cancelRebuild();
  }
}
