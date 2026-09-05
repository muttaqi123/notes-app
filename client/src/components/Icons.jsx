/**
 * Inline SVG rather than an icon package: eleven icons do not justify a
 * dependency, and inline paths cannot arrive late and shift the layout.
 */
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const MenuIcon = (p) => (
  <svg {...base} {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
);

export const SearchIcon = (p) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
);

export const CloseIcon = (p) => (
  <svg {...base} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
);

export const PinIcon = ({ filled = false, ...p }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="M15 4v6l3 4v1H6v-1l3-4V4z" /><path d="M12 15v5" />
  </svg>
);

export const ArchiveIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11h14V8M10 12h4" />
  </svg>
);

export const UnarchiveIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11h14V8M12 17v-5M9.5 14.5 12 12l2.5 2.5" />
  </svg>
);

export const TrashIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
);

export const RestoreIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
  </svg>
);

export const PaletteIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.8-.4-1.1.4-2.2 1.6-2.2H17a4 4 0 0 0 4-4c0-5-4-10-9-10Z" />
    <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="11" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const LabelIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 8a2 2 0 0 1 2-2h8l7 6-7 6H5a2 2 0 0 1-2-2z" />
    <circle cx="7.5" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const HistoryIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 1 0 2.6-6.4M3 3v4h4M12 8v4.5l3 1.8" />
  </svg>
);

export const NoteIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M5 4h14v11l-5 5H5z" /><path d="M19 15h-5v5" />
  </svg>
);

export const CheckboxIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12.2 2.4 2.4 4.6-5" />
  </svg>
);

export const PlusIcon = (p) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
);

export const MarkdownIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 15V9l2.5 3L11 9v6M15 9v4M15 13l1.8 2 1.7-2" />
  </svg>
);

export const LogoutIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h11" />
  </svg>
);
