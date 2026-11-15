// GLSL3 (WebGL2) Pass 0 Internal Organ & Merged Z-Anatomy Scalar Load ShaderMaterial.
// Maps normalized physiological stress `uScalarLoad in [0, 1]` onto the NASA-STD-3001
// 4-stop clinical LUT (#22d3ee -> #facc15 -> #fb923c -> #f43f5e), switches to neutral
// slate #6b7280 when `uObserved < 0.5` (Issue #11), and animates a Poiseuille perfusion pulse.

import * as THREE from 'three';

export interface OrganLoadMaterialOptions {
  scalarLoad?: number;
  observed?: boolean;
  pulseRateRad?: number;
  opacity?: number;
  baseTintHex?: string;
  useVertexLoad?: boolean;
  depthWrite?: boolean;
}

export interface OrganLoadUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uScalarLoad: THREE.IUniform<number>;
  uObserved: THREE.IUniform<number>;
  uPulseRateRad: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uBaseTint: THREE.IUniform<THREE.Color>;
  uUseVertexLoad: THREE.IUniform<number>;
}

export const ORGAN_LOAD_VERTEX_GLSL3 = /* glsl */ `
in float aLocalLoad;
in float aObserved;

uniform float uScalarLoad;
uniform float uObserved;
uniform float uUseVertexLoad;

out vec3 vNormal;
out vec3 vViewDir;
out vec3 vWorldPos;
out vec2 vUv;
out float vLocalLoad;
out float vOrganObserved;

void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPos.xyz);
  vWorldPos = worldPos.xyz;
  vUv = uv;
  vLocalLoad = uUseVertexLoad >= 0.5 ? clamp(aLocalLoad, 0.0, 1.0) : clamp(uScalarLoad, 0.0, 1.0);
  vOrganObserved = uUseVertexLoad >= 0.5 ? (uObserved * aObserved) : uObserved;
  gl_Position = projectionMatrix * mvPos;
}
`;

export const ORGAN_LOAD_FRAGMENT_GLSL3 = /* glsl */ `
uniform float uTime;
uniform float uScalarLoad;
uniform float uObserved;
uniform float uPulseRateRad;
uniform float uOpacity;
uniform vec3 uBaseTint;

in vec3 vNormal;
in vec3 vViewDir;
in vec3 vWorldPos;
in vec2 vUv;
in float vLocalLoad;
in float vOrganObserved;

layout(location = 0) out vec4 fragColor;

vec3 sampleSeverityLut(float loadVal) {
  vec3 cNominal  = vec3(0.133, 0.827, 0.933); // #22d3ee
  vec3 cModerate = vec3(0.980, 0.800, 0.082); // #facc15
  vec3 cElevated = vec3(0.984, 0.573, 0.235); // #fb923c
  vec3 cCritical = vec3(0.957, 0.247, 0.369); // #f43f5e

  float s = clamp(loadVal, 0.0, 1.0);
  if (s < 0.35) {
    return mix(cNominal, cModerate, s / 0.35);
  }
  if (s < 0.70) {
    return mix(cModerate, cElevated, (s - 0.35) / 0.35);
  }
  return mix(cElevated, cCritical, (s - 0.70) / 0.30);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  vec3 keyDir = normalize(vec3(0.35, 0.75, 0.60));

  float lambert = 0.28 + 0.52 * max(dot(N, keyDir), 0.0);
  float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.2);

  // Traveling vascular Poiseuille perfusion wave along vertical axis + UV
  float waveArg = (vWorldPos.y * 14.0 + vUv.x * 18.0) - uTime * uPulseRateRad;
  float perfusionPulse = 0.5 + 0.5 * sin(waveArg);

  vec3 unobsSlate = vec3(0.420, 0.447, 0.502); // #6b7280
  vec3 lutCol = sampleSeverityLut(vLocalLoad);
  vec3 activeCol = mix(uBaseTint, lutCol, 0.78);
  vec3 baseColor = vOrganObserved >= 0.5 ? activeCol : unobsSlate;

  float pulseGain = vOrganObserved >= 0.5 ? (0.10 + 0.26 * vLocalLoad) * perfusionPulse : 0.0;
  vec3 finalRgb = baseColor * lambert + lutCol * rim * 0.62 + lutCol * pulseGain;

  fragColor = vec4(finalRgb, clamp(uOpacity, 0.0, 1.0));
}
`;

export function createOrganLoadMaterial(
  options: OrganLoadMaterialOptions = {},
): THREE.ShaderMaterial {
  const opacity = options.opacity ?? 0.92;
  const uniforms: OrganLoadUniforms = {
    uTime: { value: 0 },
    uScalarLoad: { value: options.scalarLoad ?? 0.18 },
    uObserved: { value: options.observed === false ? 0.0 : 1.0 },
    uPulseRateRad: { value: options.pulseRateRad ?? 6.2 },
    uOpacity: { value: opacity },
    uBaseTint: { value: new THREE.Color(options.baseTintHex ?? '#0e7490') },
    uUseVertexLoad: { value: options.useVertexLoad ? 1.0 : 0.0 },
  };

  return new THREE.ShaderMaterial({
    name: 'ARESOrganLoadPass0',
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: ORGAN_LOAD_VERTEX_GLSL3,
    fragmentShader: ORGAN_LOAD_FRAGMENT_GLSL3,
    transparent: opacity < 0.999,
    depthTest: true,
    depthWrite: options.depthWrite ?? opacity >= 0.85,
    side: THREE.DoubleSide,
  });
}
