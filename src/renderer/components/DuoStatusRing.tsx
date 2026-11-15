import React from 'react';

export interface DuoStatusRingProps {
  readonly darkMode: boolean;
  readonly batteryLevel?: number;
  readonly activeSignalDots?: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const sweep = ((endAngle - startAngle + 360) % 360);
  const largeArcFlag = sweep > 180 ? '1' : '0';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function DuoStatusRing(props: DuoStatusRingProps): React.ReactElement {
  const fg = props.darkMode ? '#ffffff' : '#000000';
  const trackColor = props.darkMode ? 'rgba(255, 255, 255, 0.26)' : 'rgba(0, 0, 0, 0.2)';
  const batteryLevel = props.batteryLevel ?? 0.82;
  const activeDots = props.activeSignalDots ?? 4;

  const size = 38;
  const cx = 19;
  const cy = 19;
  const r = 15.2;
  const strokeW = 2.67;

  const arcStart = 222;
  const arcTotalSweep = 276;
  const trackPath = describeArc(cx, cy, r, arcStart, (arcStart + arcTotalSweep) % 360);
  const fillEnd = (arcStart + arcTotalSweep * batteryLevel) % 360;
  const fillPath = describeArc(cx, cy, r, arcStart, fillEnd);

  const dotAngles = [201, 187, 173, 159];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="iOS 27.1 V68 Combined Status Ring"
    >
      <path
        d={trackPath}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      <path
        d={fillPath}
        fill="none"
        stroke={fg}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />

      {dotAngles.map((angle, idx) => {
        const pt = polarToCartesian(cx, cy, r, angle);
        const isActive = idx < activeDots;
        return (
          <circle
            key={angle}
            cx={pt.x.toFixed(2)}
            cy={pt.y.toFixed(2)}
            r={2.0}
            fill={isActive ? fg : trackColor}
          />
        );
      })}

      <g transform="translate(11, 12.8)">
        <path
          d="M 8 11.4 C 8.75 11.4 9.35 10.8 9.35 10.05 C 9.35 9.3 8.75 8.7 8 8.7 C 7.25 8.7 6.65 9.3 6.65 10.05 C 6.65 10.8 7.25 11.4 8 11.4 Z"
          fill={fg}
        />
        <path
          d="M 4.6 7.5 C 6.45 5.8 9.55 5.8 11.4 7.5"
          fill="none"
          stroke={fg}
          strokeWidth="1.65"
          strokeLinecap="round"
        />
        <path
          d="M 1.9 4.7 C 5.25 1.65 10.75 1.65 14.1 4.7"
          fill="none"
          stroke={fg}
          strokeWidth="1.65"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
