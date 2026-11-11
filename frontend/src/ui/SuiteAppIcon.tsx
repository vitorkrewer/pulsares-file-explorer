import React, { useId } from 'react';

interface SuiteAppIconProps {
  variant: 'studio' | 'dbstudio';
  size?: number;
  style?: React.CSSProperties;
}

/**
 * Renderiza o emblema oficial em cores reais do Pulsares Studio Editor (`</>`)
 * e do Pulsares DB Studio (cilindro de banco de dados), fiel aos ícones nativos
 * gerados em `tools/generate_icon.py` (`#2563eb` -> `#4f46e5`).
 */
export const SuiteAppIcon: React.FC<SuiteAppIconProps> = ({
  variant,
  size = 18,
  style,
}) => {
  const gradId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        display: 'block',
        flexShrink: 0,
        filter: 'drop-shadow(0 1px 2px rgba(37, 99, 235, 0.28))',
        ...style,
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>

      {/* Base squircle arredondado oficial */}
      <rect x="1.25" y="1.25" width="21.5" height="21.5" rx="5.4" fill={`url(#${gradId})`} />
      <rect
        x="1.75"
        y="1.75"
        width="20.5"
        height="20.5"
        rx="4.9"
        stroke="rgba(255, 255, 255, 0.26)"
        strokeWidth="0.9"
      />

      {variant === 'studio' ? (
        <g
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9.2,8.4 5.8,12 9.2,15.6" />
          <polyline points="14.8,8.4 18.2,12 14.8,15.6" />
          <line x1="10.7" y1="16.7" x2="13.3" y2="7.3" />
        </g>
      ) : (
        <g
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <ellipse
            cx="12"
            cy="7.7"
            rx="5.4"
            ry="2.1"
            fill="rgba(255, 255, 255, 0.18)"
          />
          <path d="M6.6 7.7V15.9C6.6 17.06 9.02 18 12 18C14.98 18 17.4 17.06 17.4 15.9V7.7" />
          <path d="M6.6 11.8C6.6 12.96 9.02 13.9 12 13.9C14.98 13.9 17.4 12.96 17.4 11.8" />
        </g>
      )}
    </svg>
  );
};

