export const Logo = ({ size = 38 }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="AegisNet logo">
        <defs>
            <linearGradient id="aegis-g" x1="6" y1="3" x2="42" y2="45" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7dd3fc" />
                <stop offset="1" stopColor="#0284c7" />
            </linearGradient>
        </defs>
        <path
            d="M24 3 L42 10 V24 C42 35.2 34.4 42.8 24 45.5 C13.6 42.8 6 35.2 6 24 V10 Z"
            stroke="url(#aegis-g)"
            strokeWidth="2.4"
            fill="rgba(6,182,212,0.07)"
        />
        <circle cx="24" cy="19" r="4.2" fill="#06b6d4" />
        <circle cx="24" cy="19" r="7.4" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
        <path d="M24 23.5 V33 M24 33 H31.5 M24 33 H16.5" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="31.5" cy="33" r="2.2" fill="#38bdf8" />
        <circle cx="16.5" cy="33" r="2.2" fill="#38bdf8" />
    </svg>
);
