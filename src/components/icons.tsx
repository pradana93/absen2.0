/** Inline SVG icon set — stroke-based, sized via prop. */
import { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (
  { size = 20, ...props }: P,
  children: ReactNode,
) => (
  <svg
    viewBox="0 0 24 24" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" {...props}
  >
    {children}
  </svg>
);

export const IconHome = (p: P) => base(p, <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></>);
export const IconHistory = (p: P) => base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>);
export const IconBriefcase = (p: P) => base(p, <><rect x="3" y="7.5" width="18" height="13" rx="2.5" /><path d="M8.5 7.5V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8v1.7" /><path d="M3 13h18" /></>);
export const IconUsers = (p: P) => base(p, <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.7c2.3.3 4.2 1.9 5 4.6" /></>);
export const IconGear = (p: P) => base(p, <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" /></>);
export const IconCamera = (p: P) => base(p, <><path d="M4 8h2.2l1.6-2.4h8.4L17.8 8H20a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8Z" /><circle cx="12" cy="13.5" r="3.5" /></>);
export const IconPin = (p: P) => base(p, <><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>);
export const IconCheck = (p: P) => base(p, <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconX = (p: P) => base(p, <path d="M6 6l12 12M18 6 6 18" />);
export const IconAlert = (p: P) => base(p, <><path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.3" r="0.4" fill="currentColor" /></>);
export const IconSignal = (p: P) => base(p, <><path d="M4 18.5v-2" /><path d="M9 18.5v-5" /><path d="M14 18.5V9.5" /><path d="M19 18.5v-12" /></>);
export const IconBell = (p: P) => base(p, <><path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5Z" /><path d="M10 18.5a2 2 0 0 0 4 0" /></>);
export const IconSun = (p: P) => base(p, <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></>);
export const IconMoon = (p: P) => base(p, <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />);
export const IconClipboard = (p: P) => base(p, <><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path d="M9 4.5V3h6v1.5" /><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4.5" /></>);
export const IconTrash = (p: P) => base(p, <><path d="M4.5 6.5h15" /><path d="M8 6.5V5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 5v1.5" /><path d="M6.5 6.5 7.5 20a1.5 1.5 0 0 0 1.5 1.4h6A1.5 1.5 0 0 0 16.5 20l1-13.5" /></>);
export const IconRefresh = (p: P) => base(p, <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3.5V8h-4.5" /></>);
export const IconPlus = (p: P) => base(p, <path d="M12 5v14M5 12h14" />);
export const IconArrowRight = (p: P) => base(p, <><path d="M4.5 12h15" /><path d="m13.5 6 6 6-6 6" /></>);
export const IconDownload = (p: P) => base(p, <><path d="M12 3.5v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4.5 20h15" /></>);
export const IconScan = (p: P) => base(p, <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M7.5 12h9" /></>);
export const IconClock = (p: P) => base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 6.5V12l3 2.5" /></>);
export const IconCalendar = (p: P) => base(p, <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" /></>);
export const IconDoc = (p: P) => base(p, <><path d="M6 3.5h8l4 4V20.5H6Z" /><path d="M14 3.5v4h4" /><path d="M9 12h6M9 15.5h6" /></>);
export const IconShield = (p: P) => base(p, <><path d="M12 3 5 5.5v6c0 4.5 3 7.5 7 9.5 4-2 7-5 7-9.5v-6L12 3Z" /><path d="m9 11.5 2 2 4-4.5" /></>);
export const IconLock = (p: P) => base(p, <><rect x="5.5" y="10.5" width="13" height="10" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>);
export const IconLogoutIn = (p: P) => base(p, <><path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14" /><path d="M10 12h10.5" /><path d="m17 8.5 3.5 3.5-3.5 3.5" /></>);
export const IconEdit = (p: P) => base(p, <><path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z" /><path d="m12.5 7.5 4 4" /></>);
export const IconCpu = (p: P) => base(p, <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="10" y="10" width="4" height="4" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>);
export const IconBuilding = (p: P) => base(p, <><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21" /><path d="M15 9h3.5A1.5 1.5 0 0 1 20 10.5V21" /><path d="M2.5 21h19" /><path d="M7.5 8h2M7.5 12h2M7.5 16h2M11 8h1M11 12h1M11 16h1" /></>);
export const IconCoffee = (p: P) => base(p, <><path d="M4 9h12v6.5A4.5 4.5 0 0 1 11.5 20h-3A4.5 4.5 0 0 1 4 15.5V9Z" /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M7.5 5.5c0-1 .8-1 .8-2M11 5.5c0-1 .8-1 .8-2" /></>);
export const IconFace = (p: P) => base(p, <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9.5" cy="10.5" r="0.5" fill="currentColor" /><circle cx="14.5" cy="10.5" r="0.5" fill="currentColor" /><path d="M9 15c1 .9 2 1.3 3 1.3s2-.4 3-1.3" /></>);
export const IconWallet = (p: P) => base(p, <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V9" /><rect x="3" y="8" width="18" height="11" rx="2.5" /><path d="M15.5 13.5h3" /></>);
export const IconFlame = (p: P) => base(p, <path d="M12 3c1.1 3.2-3.2 4.8-3.2 8.4a3.2 3.2 0 0 0 6.4.3c0-1.6 1.8-2.5 1.8.3a5 5 0 0 1-10 0C7 7.4 11 6.4 12 3Z" />);
export const IconSmartphone = (p: P) => base(p, <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>);
export const IconStar = (p: P) => base(p, <path d="m12 3.2 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.2Z" />);
export const IconMail = (p: P) => base(p, <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></>);
export const IconEye = (p: P) => base(p, <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = (p: P) => base(p, <><path d="M4 4l16 16" /><path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.5 17.5 0 0 1-3.2 3.9M6.1 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.3 3.3-.7" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const IconCrosshair = (p: P) => base(p, <><circle cx="12" cy="12" r="8" /><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" /></>);
export const IconFile = (p: P) => base(p, <><path d="M6 3.5h8l4 4V20.5H6Z" /><path d="M14 3.5v4h4" /></>);
export const IconDatabase = (p: P) => base(p, <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" /><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>);
export const IconPhone = (p: P) => base(p, <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />);

export const IconLogo = ({ size = 30, ...props }: P) => (
  <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" {...props}>
    <defs>
      <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--color-sun-300, #ffc684)" />
        <stop offset="1" stopColor="var(--color-sun-500, #f07300)" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="112" fill="url(#lg-bg)" />
    <g stroke="#fff" strokeWidth="26" strokeLinecap="round">
      <line x1="256" y1="78" x2="256" y2="122" />
      <line x1="130" y1="130" x2="161" y2="161" />
      <line x1="382" y1="130" x2="351" y2="161" />
      <line x1="78" y1="256" x2="122" y2="256" />
      <line x1="434" y1="256" x2="390" y2="256" />
    </g>
    <circle cx="256" cy="256" r="106" fill="#fff" />
    <path d="M214 262 q42 44 84 0" fill="none" stroke="var(--color-sun-500, #f07300)" strokeWidth="20" strokeLinecap="round" />
    <circle cx="220" cy="230" r="13" fill="var(--color-sun-500, #f07300)" />
    <circle cx="292" cy="230" r="13" fill="var(--color-sun-500, #f07300)" />
    <path d="M256 380 c-30 0 -52 22 -52 50 0 34 52 74 52 74 s52 -40 52 -74 c0 -28 -22 -50 -52 -50 Z" fill="#fff" />
    <circle cx="256" cy="430" r="18" fill="var(--color-sun-500, #f07300)" />
  </svg>
);
