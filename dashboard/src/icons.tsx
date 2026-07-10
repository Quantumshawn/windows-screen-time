interface IconProps {
  className?: string;
}

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function BarsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="10" width="4" height="10" rx="1" />
      <rect x="10" y="5" width="4" height="15" rx="1" />
      <rect x="16" y="13" width="4" height="7" rx="1" />
    </svg>
  );
}

export function SlidersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h9M17 7h3" />
      <circle cx="14" cy="7" r="2.2" />
      <path d="M4 17h3M11 17h9" />
      <circle cx="8" cy="17" r="2.2" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 5 2 6.5 2 6.5H4.5s2-1.5 2-6.5Z" />
      <path d="M10.3 19a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  );
}

export function FlameIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21c-3.6 0-6-2.4-6-5.6 0-2.3 1.3-3.8 2.3-5.4.6-.9.5-2.2-.3-3.5 2.6.5 4.2 2.3 4.6 4 .5-1 .6-2.1.3-3.5 2.4 1.4 4.1 4.1 4.1 6.9 0 3.6-2 7.1-5 7.1Z" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 6.5 9.5 17 4 11.5" />
    </svg>
  );
}
