// Small inline icon set (stroke icons, 24px grid). Colour comes from the surrounding text colour.
type P = { size?: number };
const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const Logo = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.3 11l7.4-3.7M8.3 13l7.4 3.7" />
  </svg>
);
export const Search = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);
export const Sparkles = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
    <path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" />
  </svg>
);
export const Briefcase = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" />
  </svg>
);
export const Check = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
export const Clock = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const Layers = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5M3 17.5l9 5 9-5" />
  </svg>
);
export const Zap = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);
export const Arrow = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const User = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
export const Inbox = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5h13l3.5 7v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z" />
  </svg>
);
export const Shield = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
