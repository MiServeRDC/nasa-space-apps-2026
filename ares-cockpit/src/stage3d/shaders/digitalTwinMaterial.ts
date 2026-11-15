// GLSL3 (WebGL2) Dual-Gender Anatomical Silhouette & Epistemic Wireframe ShaderMaterial.
// Implements:
// 1. Object-space Dual-Gender position + normal morphing (`morphTarget0`, `morphNormal0`)
//    prior to `normalize(normalMatrix * morphedNormal)`.
// 2. Dual-pass BackSide (renderOrder 10) + FrontSide (renderOrder 11) Fresnel rim.
// 3. Issue #11 epistemic rendering for `observed: false` via 4x4 ordered Bayer stipple
//    dither + diagonal scanline + dashed contour (#6b7280 / #facc15, NEVER #22d3ee cyan).
// 4. Apple Silicon / WebGL2 safe 1px anti-aliased barycentric wireframe (`fwidth` + `dFdx`/`dFdy`).

import * as THREE from 'three';

export interface DigitalTwinMaterialOptions {
  side?: THREE.Side;
  genderMorphWeight?: number;
  dpr?: number;
  wireframeWidthPx?: number;
  fresnelPower?: number;
  opacity?: number;
  globalObserved?: boolean;
  propagatedIntensity?: number;
  measuredColorHex?: string;
  unobservedNoRrColorHex?: string;
  propagatedOnlyColorHex?: string;
}

export interface DigitalTwinUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uGenderMorphWeight: THREE.IUniform<number>;
  uDPR: THREE.IUniform<number>;
  uWireframeWidth: THREE.IUniform<number>;
  uFresnelPower: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uBackPassScale: THREE.IUniform<number>;
  uGlobalObserved: THREE.IUniform<number>;
  uPropagatedIntensity: THREE.IUniform<number>;
  uFluidShiftLoad: THREE.IUniform<number>;
  uMeasuredColor: THREE.IUniform<THREE.Color>;
  uUnobservedNoRrColor: THREE.IUniform<THREE.Color>;
  uPropagatedOnlyColor: THREE.IUniform<THREE.Color>;
}

export const DIGITAL_TWIN_VERTEX_GLSL3 = /* glsl */ `
in vec3 morphTarget0;
in vec3 morphNormal0;
in vec3 aBarycentric;
in float aObserved;
in float aRegionStress;

uniform float uGenderMorphWeight;

out vec3 vNormal;
out vec3 vViewDir;
out vec3 vBarycentric;
out vec3 vWorldPos;
out float vObserved;
out float vRegionStress;

void main() {
  float w = clamp(uGenderMorphWeight, 0.0, 1.0);
  vec3 morphedPos = position + morphTarget0 * w;
  vec3 blendedObjNormal = normal + morphNormal0 * w;
  float nLen = max(length(blendedObjNormal), 1e-5);
  vec3 morphedNormal = blendedObjNormal / nLen;

  vec4 mvPos = modelViewMatrix * vec4(morphedPos, 1.0);
  vec4 worldPos = modelMatrix * vec4(morphedPos, 1.0);

  vNormal = normalize(normalMatrix * morphedNormal);
  vViewDir = normalize(-mvPos.xyz);
  vBarycentric = aBarycentric;
  vWorldPos = worldPos.xyz;
  vObserved = aObserved;
  vRegionStress = clamp(aRegionStress, 0.0, 1.0);

  gl_Position = projectionMatrix * mvPos;
}
`;

export const DIGITAL_TWIN_FRAGMENT_GLSL3 = /* glsl */ `
uniform float uTime;
uniform float uDPR;
uniform float uWireframeWidth;
uniform float uFresnelPower;
uniform float uOpacity;
uniform float uBackPassScale;
uniform float uGlobalObserved;
uniform float uPropagatedIntensity;
uniform float uFluidShiftLoad;
uniform vec3 uMeasuredColor;
uniform vec3 uUnobservedNoRrColor;
uniform vec3 uPropagatedOnlyColor;

in vec3 vNormal;
in vec3 vViewDir;
in vec3 vBarycentric;
in vec3 vWorldPos;
in float vObserved;
in float vRegionStress;

layout(location = 0) out vec4 fragColor;

float bayerDither4x4(vec2 fragCoord) {
  int x = int(mod(fragCoord.x, 4.0));
  int y = int(mod(fragCoord.y, 4.0));
  int idx = y * 4 + x;
  if (idx == 0) return 0.0 / 16.0;
  if (idx == 1) return 8.0 / 16.0;
  if (idx == 2) return 2.0 / 16.0;
  if (idx == 3) return 10.0 / 16.0;
  if (idx == 4) return 12.0 / 16.0;
  if (idx == 5) return 4.0 / 16.0;
  if (idx == 6) return 14.0 / 16.0;
  if (idx == 7) return 6.0 / 16.0;
  if (idx == 8) return 3.0 / 16.0;
  if (idx == 9) return 11.0 / 16.0;
  if (idx == 10) return 1.0 / 16.0;
  if (idx == 11) return 9.0 / 16.0;
  if (idx == 12) return 15.0 / 16.0;
  if (idx == 13) return 7.0 / 16.0;
  if (idx == 14) return 13.0 / 16.0;
  return 5.0 / 16.0;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  float ndv = abs(dot(N, V));
  float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), max(uFresnelPower, 0.5));

  // Euclidean + fwidth screen-space pixel metric for crisp 1px barycentric wireframe
  vec3 ddx = dFdx(vBarycentric);
  vec3 ddy = dFdy(vBarycentric);
  vec3 euclidDelta = max(sqrt(ddx * ddx + ddy * ddy), vec3(1e-5));
  vec3 fwDelta = max(fwidth(vBarycentric), vec3(1e-5));
  vec3 edgeDelta = mix(euclidDelta, fwDelta, 0.2);
  vec3 distPx = vBarycentric / edgeDelta;
  float nearestEdge = min(min(distPx.x, distPx.y), distPx.z);
  float halfWidth = max(0.45, uWireframeWidth * max(uDPR, 1.0) * 0.5);
  float wire = 1.0 - smoothstep(halfWidth - 0.45, halfWidth + 0.55, nearestEdge);

  float cephaladWave = 0.5 + 0.5 * sin(vWorldPos.y * 5.5 - uTime * 1.8);
  float shiftBoost = uFluidShiftLoad * smoothstep(-0.2, 1.4, vWorldPos.y) * cephaladWave * 0.18;

  float isObserved = uGlobalObserved * vObserved;

  if (isObserved > 0.5) {
    // Blend nominal cyan (#22d3ee) into NASA-STD-3001 caution/warning/critical palette
    // at stressed anatomical zones so active body problems glow unmistakably on the twin.
    vec3 cModerate = vec3(0.980, 0.800, 0.082); // #facc15
    vec3 cElevated = vec3(0.984, 0.573, 0.235); // #fb923c
    vec3 cCritical = vec3(0.957, 0.247, 0.369); // #f43f5e

    float s = clamp(vRegionStress, 0.0, 1.0);
    vec3 zoneColor = uMeasuredColor;
    if (s >= 0.16 && s < 0.38) {
      zoneColor = mix(uMeasuredColor, cModerate, (s - 0.16) / 0.22);
    } else if (s >= 0.38 && s < 0.68) {
      zoneColor = mix(cModerate, cElevated, (s - 0.38) / 0.30);
    } else if (s >= 0.68) {
      zoneColor = mix(cElevated, cCritical, (s - 0.68) / 0.32);
    }

    float stressPulse = s >= 0.20 ? (0.5 + 0.5 * sin(uTime * 3.8 - vWorldPos.y * 4.0)) * s * 0.28 : 0.0;
    vec3 rimCol = zoneColor * (0.44 + 1.05 * fresnel + shiftBoost + stressPulse);
    vec3 wireCol = mix(zoneColor * 0.72, vec3(0.94, 0.98, 1.0), 0.32) * wire * (0.56 + 0.24 * s);
    float alpha = clamp(
      (0.10 + fresnel * 0.58 + wire * 0.36 + shiftBoost + stressPulse * 0.65) * uBackPassScale * uOpacity,
      0.0,
      0.92
    );
    fragColor = vec4(rimCol + wireCol, alpha);
    return;
  }

  // Issue #11 unobserved epistemic state: 4x4 Bayer stipple + diagonal scanline + dashed rim
  // Strictly neutral #6b7280 (< 0.05 propagation) or amber #facc15 (>= 0.05), NEVER nominal cyan.
  vec3 unobsBase = uPropagatedIntensity >= 0.05 ? uPropagatedOnlyColor : uUnobservedNoRrColor;
  float scanline = step(0.1, sin((gl_FragCoord.x + gl_FragCoord.y) * 0.35 - uTime * 2.6));
  float dashContour = step(0.35, fract((vWorldPos.y + vWorldPos.x) * 9.0));
  float rawAlpha = (0.08 + fresnel * 0.34 * dashContour + wire * 0.22) * (0.45 + 0.55 * scanline);
  float cappedAlpha = min(rawAlpha * uBackPassScale * uOpacity, 0.25);

  float threshold = bayerDither4x4(gl_FragCoord.xy);
  if (cappedAlpha <= threshold * 0.32) {
    discard;
  }

  fragColor = vec4(unobsBase * (0.55 + 0.65 * fresnel + 0.35 * wire), cappedAlpha);
}
`;

export function createDigitalTwinMaterial(
  options: DigitalTwinMaterialOptions = {},
): THREE.ShaderMaterial {
  const side = options.side ?? THREE.FrontSide;
  const isBackSide = side === THREE.BackSide;

  const uniforms: DigitalTwinUniforms = {
    uTime: { value: 0 },
    uGenderMorphWeight: { value: options.genderMorphWeight ?? 0 },
    uDPR: { value: options.dpr ?? 1 },
    uWireframeWidth: { value: options.wireframeWidthPx ?? 1.0 },
    uFresnelPower: { value: options.fresnelPower ?? 2.6 },
    uOpacity: { value: options.opacity ?? 1.0 },
    uBackPassScale: { value: isBackSide ? 0.52 : 1.0 },
    uGlobalObserved: { value: options.globalObserved === false ? 0.0 : 1.0 },
    uPropagatedIntensity: { value: options.propagatedIntensity ?? 0.0 },
    uFluidShiftLoad: { value: 0.15 },
    uMeasuredColor: { value: new THREE.Color(options.measuredColorHex ?? '#22d3ee') },
    uUnobservedNoRrColor: { value: new THREE.Color(options.unobservedNoRrColorHex ?? '#6b7280') },
    uPropagatedOnlyColor: { value: new THREE.Color(options.propagatedOnlyColorHex ?? '#facc15') },
  };

  return new THREE.ShaderMaterial({
    name: isBackSide ? 'ARESDigitalTwinBackPass' : 'ARESDigitalTwinFrontPass',
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: DIGITAL_TWIN_VERTEX_GLSL3,
    fragmentShader: DIGITAL_TWIN_FRAGMENT_GLSL3,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side,
    blending: THREE.NormalBlending,
  });
}
