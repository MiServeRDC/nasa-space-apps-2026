// Spring-physics motion smoothing engine based on OpenScreen math
// Reference: getopenscreen/openscreen/src/lib/zoomMath/motionSmoothing.ts
// Mathematical formulation: m * d^2x/dt^2 + c * dx/dt + k * (x - x_target) = 0
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

export interface SpringConfig {
  stiffness: number; // k (default 340.0)
  damping: number;   // c (default 38.0)
  mass: number;      // m (default 0.85)
}

export const DEFAULT_SPRING_CONFIG: SpringConfig = {
  stiffness: 340.0,
  damping: 38.0,
  mass: 0.85,
};

export type Vector3Tuple = [number, number, number];

export interface SpringState1D {
  position: number;
  velocity: number;
}

export interface SpringState3D {
  position: Vector3Tuple;
  velocity: Vector3Tuple;
}

export interface CameraPreset {
  id: string;
  name: string;
  position: Vector3Tuple;
  target: Vector3Tuple;
  fov?: number;
  description: string;
}

export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  DEFAULT: {
    id: 'DEFAULT',
    name: 'Full Body Anatomical',
    position: [0, 0.45, 3.3],
    target: [0, 0.45, 0],
    fov: 45,
    description: 'Whole-body overview with multi-layer coronal inspection',
  },
  IJV: {
    id: 'IJV',
    name: 'Internal Jugular Vein (IJV)',
    position: [0.06, 1.32, 1.05],
    target: [0.06, 1.32, 0.05],
    fov: 35,
    description: 'Cervical venous outflow, cross-sectional area and wall shear stress',
  },
  ONSD: {
    id: 'ONSD',
    name: 'Optic Nerve Sheath (SANS)',
    position: [0.06, 1.56, 0.95],
    target: [0.06, 1.56, 0.13],
    fov: 30,
    description: 'Retrobulbar sheath diameter at 3mm posterior to ocular globe',
  },
  FEMUR: {
    id: 'FEMUR',
    name: 'Femur Mechanostat',
    position: [0.14, 0.14, 1.15],
    target: [0.14, 0.14, 0.05],
    fov: 38,
    description: 'Mid-diaphyseal cortical strain and osteocyte sclerostin inhibition',
  },
  SOLEUS: {
    id: 'SOLEUS',
    name: 'Soleus Calf Muscle',
    position: [-0.13, -0.39, 1.05],
    target: [-0.13, -0.39, -0.05],
    fov: 35,
    description: 'Postural anti-gravity soleus myofiber thickness and irisin secretion',
  },
  CALCANEUS: {
    id: 'CALCANEUS',
    name: 'Calcaneus & Gait',
    position: [0.13, -0.71, 0.95],
    target: [0.13, -0.71, 0.05],
    fov: 32,
    description: 'Heel trabecular bone mineral density and Mars 0.38g gait symmetry',
  },
};

/**
 * Step a single-dimensional spring toward target over dt seconds.
 * Solves damped harmonic oscillator using semi-implicit Euler integration.
 */
export function stepSpring1D(
  current: number,
  target: number,
  velocity: number,
  dt: number,
  config: SpringConfig = DEFAULT_SPRING_CONFIG,
): SpringState1D {
  // Clamp delta time to avoid instability on frame drops
  const clampedDt = Math.min(Math.max(dt, 0.001), 0.064);

  // F_spring = -k * (x - target)
  // F_damping = -c * velocity
  // a = (F_spring + F_damping) / m
  const displacement = current - target;
  const springForce = -config.stiffness * displacement;
  const dampingForce = -config.damping * velocity;
  const acceleration = (springForce + dampingForce) / config.mass;

  const nextVelocity = velocity + acceleration * clampedDt;
  const nextPosition = current + nextVelocity * clampedDt;

  // Settle threshold to avoid micro-jitter
  if (Math.abs(nextPosition - target) < 1e-4 && Math.abs(nextVelocity) < 1e-4) {
    return { position: target, velocity: 0 };
  }

  return { position: nextPosition, velocity: nextVelocity };
}

/**
 * Step a 3D vector spring toward target vector over dt seconds.
 */
export function stepSpring3D(
  current: Vector3Tuple,
  target: Vector3Tuple,
  velocity: Vector3Tuple,
  dt: number,
  config: SpringConfig = DEFAULT_SPRING_CONFIG,
): SpringState3D {
  const x = stepSpring1D(current[0], target[0], velocity[0], dt, config);
  const y = stepSpring1D(current[1], target[1], velocity[1], dt, config);
  const z = stepSpring1D(current[2], target[2], velocity[2], dt, config);

  return {
    position: [x.position, y.position, z.position],
    velocity: [x.velocity, y.velocity, z.velocity],
  };
}

/**
 * Computes distance between two 3D points.
 */
export function distance3D(a: Vector3Tuple, b: Vector3Tuple): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
