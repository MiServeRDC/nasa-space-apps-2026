// Precision half-pixel snapped SVG Tactical Reticle & Ultrasound Caliper Overlay (`TacticalReticleSvg`).
// Renders crisp `1px` (`vectorEffect="non-scaling-stroke"`) registration ticks, measurement calipers
// (`IJV CSA` / `tau_w` Poiseuille shear & `Ocular ONSD` `5.80 mm` SANS cutoff), and Issue #12
// epistemic framing markers (`[EMPIRICAL - BIDMC CSV]` vs `[DELTA SIMULATED - UNVALIDATED]`)
// without anisotropic text distortion.

import React from 'react';
import { snapHalfPixel } from './instrumentMath';

export type TacticalReticleVariant = 'STAGE_PERIMETER' | 'POCUS_IJV' | 'OCULAR_ONSD';

export interface TacticalReticleSvgProps {
  variant?: TacticalReticleVariant;
  simulated?: boolean;
  sourceLabel?: string;
  caliperPrimaryText?: string;
  caliperSecondaryText?: string;
  warningActive?: boolean;
  className?: string;
}

export function TacticalReticleSvg({
  variant = 'STAGE_PERIMETER',
  simulated = false,
  sourceLabel,
  caliperPrimaryText,
  caliperSecondaryText,
  warningActive = false,
  className = '',
}: TacticalReticleSvgProps) {
  const w = 400;
  const h = 260;

  const strokeColor = warningActive
    ? 'rgba(244, 63, 94, 0.78)'
    : simulated
      ? 'rgba(245, 158, 11, 0.68)'
      : 'rgba(34, 211, 238, 0.56)';

  const cornerLen = 14;
  const xMin = snapHalfPixel(8);
  const yMin = snapHalfPixel(8);
  const xMax = snapHalfPixel(w - 9);
  const yMax = snapHalfPixel(h - 9);
  const midX = snapHalfPixel(w * 0.5);
  const midY = snapHalfPixel(h * 0.5);

  const epistemicBanner = `[${sourceLabel ?? (simulated ? 'SCENARIO PREVIEW - UNVALIDATED' : 'ANATOMICAL REFERENCE')}]`;

  const isStagePerimeter = variant === 'STAGE_PERIMETER';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`.trim()}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        {/* 4 corner registration brackets */}
        <path
          d={`M ${xMin} ${yMin + cornerLen} L ${xMin} ${yMin} L ${xMin + cornerLen} ${yMin}
              M ${xMax - cornerLen} ${yMin} L ${xMax} ${yMin} L ${xMax} ${yMin + cornerLen}
              M ${xMin} ${yMax - cornerLen} L ${xMin} ${yMax} L ${xMin + cornerLen} ${yMax}
              M ${xMax - cornerLen} ${yMax} L ${xMax} ${yMax} L ${xMax} ${yMax - cornerLen}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {/* Peripheral mid-edge fiducial ticks */}
        <path
          d={`M ${midX - 6} ${yMin} L ${midX + 6} ${yMin}
              M ${midX - 6} ${yMax} L ${midX + 6} ${yMax}
              M ${xMin} ${midY - 6} L ${xMin} ${midY + 6}
              M ${xMax} ${midY - 6} L ${xMax} ${midY + 6}`}
          fill="none"
          stroke="rgba(255, 255, 255, 0.24)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {variant === 'POCUS_IJV' ? (
          <g>
            {/* Transverse IJV lumen caliper crosshairs */}
            <line
              x1={snapHalfPixel(118)}
              y1={snapHalfPixel(120)}
              x2={snapHalfPixel(182)}
              y2={snapHalfPixel(120)}
              stroke="#22d3ee"
              strokeDasharray="2 2"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={snapHalfPixel(150)}
              y1={snapHalfPixel(96)}
              x2={snapHalfPixel(150)}
              y2={snapHalfPixel(144)}
              stroke="#22d3ee"
              strokeDasharray="2 2"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null}

        {variant === 'OCULAR_ONSD' ? (
          <g>
            {/* Retrobulbar 3.0 mm depth marker + ONSD width caliper */}
            <line
              x1={snapHalfPixel(168)}
              y1={snapHalfPixel(156)}
              x2={snapHalfPixel(232)}
              y2={snapHalfPixel(156)}
              stroke={warningActive ? '#f43f5e' : '#22d3ee'}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={snapHalfPixel(168)}
              y1={snapHalfPixel(151)}
              x2={snapHalfPixel(168)}
              y2={snapHalfPixel(161)}
              stroke={warningActive ? '#f43f5e' : '#22d3ee'}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={snapHalfPixel(232)}
              y1={snapHalfPixel(151)}
              x2={snapHalfPixel(232)}
              y2={snapHalfPixel(161)}
              stroke={warningActive ? '#f43f5e' : '#22d3ee'}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null}
      </svg>

      {/* Unstretched 1:1 pixel-crisp telemetry annotations */}
      {isStagePerimeter ? (
        <div className="absolute right-3.5 top-2.5 flex flex-col items-end gap-0.5 font-mono text-[9px] tracking-wider">
          {caliperPrimaryText ? (
            <span className="text-cyan-200/85">{caliperPrimaryText}</span>
          ) : null}
          <span className={simulated ? 'text-amber-300/85' : 'text-emerald-300/85'}>
            {caliperSecondaryText ? `${caliperSecondaryText} | ${epistemicBanner}` : epistemicBanner}
          </span>
        </div>
      ) : (
        <>
          {caliperPrimaryText || caliperSecondaryText ? (
            <div className="absolute right-3.5 top-2.5 flex flex-col items-end gap-0.5 font-mono text-[9px] tracking-wider">
              {caliperPrimaryText ? (
                <span className="text-cyan-200/85">{caliperPrimaryText}</span>
              ) : null}
              {caliperSecondaryText ? (
                <span className="text-[var(--color-ink-meta)]">{caliperSecondaryText}</span>
              ) : null}
            </div>
          ) : null}
          <div
            className={`absolute bottom-2.5 left-3.5 font-mono text-[9px] tracking-wider ${
              simulated ? 'text-amber-300/85' : 'text-emerald-300/85'
            }`}
          >
            {epistemicBanner}
          </div>
        </>
      )}
    </div>
  );
}
