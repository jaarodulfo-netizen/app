import { Lock, LockOpen, AlertTriangle, Loader2 } from 'lucide-react';

const STATUS_STYLE = {
    locked: { ring: 'border-sky-400/70', dot: 'bg-sky-400', text: 'text-sky-300', glow: 'shadow-[0_0_16px_rgba(56,189,248,0.6)]', ping: 'bg-sky-400' },
    unlocked: { ring: 'border-emerald-400/70', dot: 'bg-emerald-400', text: 'text-emerald-300', glow: 'shadow-[0_0_16px_rgba(16,185,129,0.6)]', ping: 'bg-emerald-400' },
    opening: { ring: 'border-orange-400/70', dot: 'bg-orange-400', text: 'text-orange-300', glow: 'shadow-[0_0_16px_rgba(251,146,60,0.6)]', ping: 'bg-orange-400' },
    alarm: { ring: 'border-red-500/80', dot: 'bg-red-500', text: 'text-red-400', glow: 'shadow-[0_0_18px_rgba(239,68,68,0.7)]', ping: 'bg-red-500' },
};

const ROOMS = [
    { label: 'SERVER ROOM', x: 40, y: 40, w: 220, h: 170 },
    { label: 'OFFICE BULLPEN', x: 300, y: 40, w: 340, h: 210 },
    { label: 'EXECUTIVE SUITE', x: 680, y: 40, w: 280, h: 210 },
    { label: 'MAIN LOBBY', x: 40, y: 350, w: 380, h: 230 },
    { label: 'ELEVATOR CORE', x: 440, y: 350, w: 140, h: 230 },
    { label: 'PARKING RAMP B1', x: 620, y: 350, w: 340, h: 230 },
];

export function FloorPlan({ doors, selectedId, onSelect, compact = false, editable = false, onPlanClick }) {
    const handlePlanClick = (e) => {
        if (!editable || !onPlanClick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onPlanClick({
            x: Math.min(98, Math.max(2, +(((e.clientX - rect.left) / rect.width) * 100).toFixed(1))),
            y: Math.min(98, Math.max(2, +(((e.clientY - rect.top) / rect.height) * 100).toFixed(1))),
        });
    };

    return (
        <div
            className={`relative w-full ${editable ? 'cursor-crosshair' : ''}`}
            data-testid={compact ? 'floorplan-mini' : 'floorplan-full'}
            onClick={handlePlanClick}
        >
            <svg viewBox="0 0 1000 620" className="w-full h-auto block">
                <defs>
                    <radialGradient id="map-glow" cx="50%" cy="45%" r="70%">
                        <stop offset="0%" stopColor="rgba(14,116,233,0.10)" />
                        <stop offset="100%" stopColor="rgba(2,6,23,0)" />
                    </radialGradient>
                </defs>
                <rect x="0" y="0" width="1000" height="620" fill="url(#map-glow)" />
                <rect x="40" y="40" width="920" height="540" fill="rgba(15,23,42,0.35)" stroke="rgba(56,189,248,0.35)" strokeWidth="2.5" />
                <rect x="40" y="280" width="920" height="70" fill="rgba(14,116,233,0.06)" stroke="rgba(56,189,248,0.22)" strokeWidth="1.5" />
                <text x="500" y="320" textAnchor="middle" fill="#3b5b8a" fontSize="15" fontFamily="JetBrains Mono, monospace" letterSpacing="6">
                    CENTRAL CORRIDOR
                </text>
                {ROOMS.map((r) => (
                    <g key={r.label}>
                        <rect
                            x={r.x}
                            y={r.y}
                            width={r.w}
                            height={r.h}
                            fill="rgba(15,23,42,0.55)"
                            stroke="rgba(56,189,248,0.28)"
                            strokeWidth="1.8"
                        />
                        <text
                            x={r.x + 16}
                            y={r.y + 30}
                            fill="#54749f"
                            fontSize={compact ? 17 : 14}
                            fontFamily="JetBrains Mono, monospace"
                            letterSpacing="3"
                        >
                            {r.label}
                        </text>
                    </g>
                ))}
                {doors.map((d) => (
                    <circle key={d.id} cx={d.x * 10} cy={d.y * 6.2} r="26" fill="rgba(56,189,248,0.05)" stroke="rgba(56,189,248,0.15)" strokeDasharray="4 4" />
                ))}
            </svg>

            {doors.map((d) => {
                const s = STATUS_STYLE[d.status] || STATUS_STYLE.locked;
                const active = selectedId === d.id;
                return (
                    <button
                        key={d.id}
                        data-testid={`door-node-${(d.code || d.id).toLowerCase()}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect && onSelect(d);
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 group"
                        style={{ left: `${d.x}%`, top: `${d.y}%` }}
                        title={`${d.code} · ${d.name}`}
                    >
                        <span className={`absolute inset-0 rounded-full ${s.ping} opacity-60 node-ping`} />
                        <span
                            className={`relative flex items-center justify-center rounded-full border-2 bg-[#0b1220] transition-transform duration-200 group-hover:scale-125 ${s.ring} ${s.glow} ${
                                d.status === 'alarm' ? 'alarm-flash' : ''
                            } ${compact ? 'h-5 w-5' : 'h-8 w-8'} ${active ? 'scale-125 ring-2 ring-[#fee396]/70' : ''}`}
                        >
                            {d.status === 'locked' && <Lock className={compact ? 'h-2.5 w-2.5 text-sky-300' : 'h-3.5 w-3.5 text-sky-300'} />}
                            {d.status === 'unlocked' && <LockOpen className={compact ? 'h-2.5 w-2.5 text-emerald-300' : 'h-3.5 w-3.5 text-emerald-300'} />}
                            {d.status === 'opening' && <Loader2 className={`${compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} text-orange-300 animate-spin`} />}
                            {d.status === 'alarm' && <AlertTriangle className={compact ? 'h-2.5 w-2.5 text-red-400' : 'h-3.5 w-3.5 text-red-400'} />}
                        </span>
                        {!compact && (
                            <span
                                className={`absolute left-1/2 -translate-x-1/2 top-full mt-1.5 mono text-[10px] tracking-widest whitespace-nowrap ${s.text} opacity-80 group-hover:opacity-100`}
                            >
                                {d.code}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
