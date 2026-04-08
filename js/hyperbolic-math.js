/**
 * Hyperbolic Math Utilities
 * Poincaré disk model operations using [x, y] as complex numbers.
 */

// Complex number operations (z = [x, y])
export function cAdd(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
export function cSub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
export function cMul(a, b) {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}
export function cDiv(a, b) {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
export function cConj(a) { return [a[0], -a[1]]; }
export function cAbs(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
export function cScale(a, s) { return [a[0] * s, a[1] * s]; }

/**
 * Möbius transformation: maps point `a` to the origin.
 * T_a(z) = (z - a) / (1 - conj(a) * z)
 */
export function mobiusTransform(z, a) {
  const num = cSub(z, a);
  const den = cSub([1, 0], cMul(cConj(a), z));
  return cDiv(num, den);
}

/**
 * Inverse Möbius transformation.
 * T_a^{-1}(w) = (w + a) / (1 + conj(a) * w)
 */
export function mobiusInverse(w, a) {
  const num = cAdd(w, a);
  const den = cAdd([1, 0], cMul(cConj(a), w));
  return cDiv(num, den);
}

/**
 * Rotation in the Poincaré disk: z -> e^{i*theta} * z
 */
export function hyperbolicRotation(z, theta) {
  const rot = [Math.cos(theta), Math.sin(theta)];
  return cMul(rot, z);
}

/**
 * Hyperbolic distance between two points in the Poincaré disk.
 */
export function hyperbolicDistance(z1, z2) {
  const diff = cSub(z1, z2);
  const diffSq = diff[0] * diff[0] + diff[1] * diff[1];
  const d1 = 1 - (z1[0] * z1[0] + z1[1] * z1[1]);
  const d2 = 1 - (z2[0] * z2[0] + z2[1] * z2[1]);
  return Math.acosh(1 + 2 * diffSq / (d1 * d2));
}

/**
 * Convert Poincaré disk coordinates to screen coordinates.
 */
export function diskToScreen(z, centerX, centerY, radius) {
  return [centerX + z[0] * radius, centerY + z[1] * radius];
}

/**
 * Convert screen coordinates to Poincaré disk coordinates.
 */
export function screenToDisk(sx, sy, centerX, centerY, radius) {
  return [(sx - centerX) / radius, (sy - centerY) / radius];
}

/**
 * Compute geodesic arc between two points in the Poincaré disk.
 * Returns SVG path data string.
 */
export function geodesicPath(z1, z2, centerX, centerY, radius) {
  const [sx1, sy1] = diskToScreen(z1, centerX, centerY, radius);
  const [sx2, sy2] = diskToScreen(z2, centerX, centerY, radius);

  // Check if points are approximately collinear with origin
  const cross = z1[0] * z2[1] - z1[1] * z2[0];
  if (Math.abs(cross) < 0.001) {
    // Near-straight line through origin
    return `M ${sx1} ${sy1} L ${sx2} ${sy2}`;
  }

  // Compute the geodesic arc (circle orthogonal to unit circle)
  // Inversion of z with respect to unit circle: z* = z / |z|^2
  const abs1sq = z1[0] * z1[0] + z1[1] * z1[1];
  const abs2sq = z2[0] * z2[0] + z2[1] * z2[1];

  if (abs1sq < 1e-10 || abs2sq < 1e-10) {
    // One point is at origin, geodesic is a straight line
    return `M ${sx1} ${sy1} L ${sx2} ${sy2}`;
  }

  const inv1 = [z1[0] / abs1sq, z1[1] / abs1sq];

  // Find circle through z1, z2, inv1
  // Using three points to find circle center
  const ax = z1[0], ay = z1[1];
  const bx = z2[0], by = z2[1];
  const cx = inv1[0], cy = inv1[1];

  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-10) {
    return `M ${sx1} ${sy1} L ${sx2} ${sy2}`;
  }

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;

  const arcCenterDisk = [ux, uy];
  const arcRadius = Math.sqrt((ax - ux) * (ax - ux) + (ay - uy) * (ay - uy));

  // Convert arc center and radius to screen space
  const [scx, scy] = diskToScreen(arcCenterDisk, centerX, centerY, radius);
  const screenArcRadius = arcRadius * radius;

  // Determine sweep direction
  const angle1 = Math.atan2(sy1 - scy, sx1 - scx);
  const angle2 = Math.atan2(sy2 - scy, sx2 - scx);
  let sweepAngle = angle2 - angle1;
  if (sweepAngle > Math.PI) sweepAngle -= 2 * Math.PI;
  if (sweepAngle < -Math.PI) sweepAngle += 2 * Math.PI;
  const sweep = sweepAngle > 0 ? 1 : 0;
  const largeArc = Math.abs(sweepAngle) > Math.PI ? 1 : 0;

  return `M ${sx1} ${sy1} A ${screenArcRadius} ${screenArcRadius} 0 ${largeArc} ${sweep} ${sx2} ${sy2}`;
}

/**
 * Compute a point on the geodesic arc between z1 and z2 at fraction t (0-1).
 * Returns screen coordinates [sx, sy] and tangent direction [tx, ty].
 */
export function geodesicPointAt(z1, z2, t, centerX, centerY, radius) {
  const [sx1, sy1] = diskToScreen(z1, centerX, centerY, radius);
  const [sx2, sy2] = diskToScreen(z2, centerX, centerY, radius);

  const cross = z1[0] * z2[1] - z1[1] * z2[0];
  const abs1sq = z1[0] * z1[0] + z1[1] * z1[1];
  const abs2sq = z2[0] * z2[0] + z2[1] * z2[1];

  // Straight line cases
  if (Math.abs(cross) < 0.001 || abs1sq < 1e-10 || abs2sq < 1e-10) {
    const px = sx1 + (sx2 - sx1) * t;
    const py = sy1 + (sy2 - sy1) * t;
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: px, y: py, tx: dx / len, ty: dy / len };
  }

  // Find arc circle center (same math as geodesicPath)
  const inv1 = [z1[0] / abs1sq, z1[1] / abs1sq];
  const ax = z1[0], ay = z1[1];
  const bx = z2[0], by = z2[1];
  const cx = inv1[0], cy = inv1[1];
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

  if (Math.abs(D) < 1e-10) {
    const px = sx1 + (sx2 - sx1) * t;
    const py = sy1 + (sy2 - sy1) * t;
    return { x: px, y: py, tx: sx2 - sx1, ty: sy2 - sy1 };
  }

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
  const arcR = Math.sqrt((ax - ux) * (ax - ux) + (ay - uy) * (ay - uy));

  // Convert to screen
  const [scx, scy] = diskToScreen([ux, uy], centerX, centerY, radius);
  const sArcR = arcR * radius;

  // Angles of endpoints on the arc circle
  const a1 = Math.atan2(sy1 - scy, sx1 - scx);
  const a2 = Math.atan2(sy2 - scy, sx2 - scx);

  // Choose shortest arc
  let da = a2 - a1;
  if (da > Math.PI) da -= 2 * Math.PI;
  if (da < -Math.PI) da += 2 * Math.PI;

  const angle = a1 + da * t;
  const px = scx + sArcR * Math.cos(angle);
  const py = scy + sArcR * Math.sin(angle);

  // Tangent is perpendicular to radius at this point
  const tx = -Math.sin(angle) * Math.sign(da);
  const ty = Math.cos(angle) * Math.sign(da);

  return { x: px, y: py, tx, ty };
}

/**
 * Interpolate Möbius transform parameter for animation.
 * Linearly interpolate in disk coordinates (good enough for smooth animation).
 */
export function interpolatePoint(from, to, t) {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t
  ];
}
