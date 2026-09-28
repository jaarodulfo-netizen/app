import { Lock, LockOpen, AlertTriangle, Loader2 } from 'lucide-react';

const STATUS_STYLE = {
    locked: { ring: 'border-sky-400/70', text: 'text-sky-300', glow: 'shadow-[0_0_16px_rgba(56,189,248,0.6)]', ping: 'bg-sky-400' },
    unlocked: { ring: 'border-emerald-400/70', text: 'text-emerald-300', glow: 'shadow-[0_0_16px_rgba(16,185,129,0.6)]', ping: 'bg-emerald-400' },
    opening: { ring: 'border-orange-400/70', text: 'text-orange-300', glow: 'shadow-[0_0_16px_rgba(251,146,60,0.6)]', ping: 'bg-orange-400' },
    alarm: { ring: 'border-red-500/80', text: 'text-red-400', glow: 'shadow-[0_0_18px_rgba(239,68,68,0.7)]', ping: 'bg-red-500' },
};

export function FloorPlan({
    doors,
    selectedId,
    onSelect,
    editable = false,
    onDoorDrop,
    layoutUrl,
    layoutType,
    floor,
}) {
    const positionFromEvent = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return {
            x: Math.min(99, Math.max(1, +(((e.clientX - rect.left) / rect.width) * 100).toFixed(2))),
            y: Math.min(99, Math.max(1, +(((e.clientY - rect.top) / rect.height) * 100).toFixed(2))),
        };
    };

    const handleDrop = (e) => {
        if (!editable || !onDoorDrop) return;
        e.preventDefault();
        const doorId = e.dataTransfer.getData('text/kerma-door-id');
        if (!doorId) return;
        onDoorDrop(doorId, positionFromEvent(e));
    };

    return (
        <div
            className={`relative w-full aspect-[16/10] overflow-hidden rounded-xl border border-sky-500/15 bg-[#050811] ${editable ? 'cursor-crosshair' : ''}`}
            data-testid="floorplan-full"
            onDragOver={(e) => editable && e.preventDefault()}
            onDrop={handleDrop}
        >
            {layoutUrl ? (
                layoutType === 'application/pdf' ? (
                    <object
                        data={layoutUrl}
                        type="application/pdf"
                        className="absolute inset-0 h-full w-full pointer-events-none"
                        aria-label={`Floor ${floor} layout`}
                    />
                ) : (
                    <img
                        src={layoutUrl}
                        alt={`Floor ${floor} layout`}
                        className="absolute inset-0 h-full w-full object-contain"
                        draggable={false}
                    />
                )
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-grid">
                    <p className="font-head text-lg font-bold text-slate-300">FLOOR {floor}</p>
                    <p className="mono mt-2 text-[10px] tracking-[0.25em] text-slate-600">UPLOAD A LAYOUT TO START PLACING DOORS</p>
                </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-500/[0.02] to-transparent" />

            {doors.map((d) => {
                if (d.x == null || d.y == null) return null;
                const style = STATUS_STYLE[d.status] || STATUS_STYLE.locked;
                const active = selectedId === d.id;
                return (
                    <button
                        key={d.id}
                        type="button"
                        draggable={editable}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('text/kerma-door-id', d.id);
                            e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect?.(d);
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 group"
                        style={{ left: `${d.x}%`, top: `${d.y}%` }}
                        title={`${d.code} · ${d.name}`}
                    >
                        <span className={`absolute inset-0 rounded-full ${style.ping} opacity-50 node-ping`} />
                        <span className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-[#0b1220] ${style.ring} ${style.glow} ${active ? 'ring-2 ring-[#fee396]/70 scale-110' : ''}`}>
                            {d.status === 'locked' && <Lock className="h-4 w-4 text-sky-300" />}
                            {d.status === 'unlocked' && <LockOpen className="h-4 w-4 text-emerald-300" />}
                            {d.status === 'opening' && <Loader2 className="h-4 w-4 animate-spin text-orange-300" />}
                            {d.status === 'alarm' && <AlertTriangle className="h-4 w-4 text-red-400" />}
                        </span>
                        <span className={`absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap mono text-[9px] tracking-widest ${style.text}`}>
                            {d.code}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
