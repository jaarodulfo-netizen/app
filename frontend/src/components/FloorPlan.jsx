import { useRef, useState } from 'react';
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
    const stageRef = useRef(null);
    const dragRef = useRef(null);
    const [dragPreview, setDragPreview] = useState(null);

    const positionFromClient = (clientX, clientY) => {
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return {
            x: Math.min(99, Math.max(1, +(((clientX - rect.left) / rect.width) * 100).toFixed(2))),
            y: Math.min(99, Math.max(1, +(((clientY - rect.top) / rect.height) * 100).toFixed(2))),
        };
    };

    const positionFromEvent = (e) => positionFromClient(e.clientX, e.clientY);

    const handleDrop = (e) => {
        if (!editable || !onDoorDrop) return;
        e.preventDefault();
        const doorId = e.dataTransfer.getData('text/kerma-door-id');
        if (!doorId) return;
        const pos = positionFromEvent(e);
        if (pos) onDoorDrop(doorId, pos);
    };

    const startPlacedDoorDrag = (e, door) => {
        if (!editable || !onDoorDrop) return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const startPos = { x: Number(door.x), y: Number(door.y) };
        dragRef.current = {
            door,
            pointerId: e.pointerId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            moved: false,
            startPos,
        };
        setDragPreview({ id: door.id, ...startPos });

        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
    };

    const movePlacedDoor = (e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;

        const distance = Math.hypot(
            e.clientX - drag.startClientX,
            e.clientY - drag.startClientY,
        );
        if (distance > 3) drag.moved = true;

        const pos = positionFromClient(e.clientX, e.clientY);
        if (pos) setDragPreview({ id: drag.door.id, ...pos });
    };

    const finishPlacedDoorDrag = async (e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;

        const pos = positionFromClient(e.clientX, e.clientY);
        dragRef.current = null;
        setDragPreview(null);

        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}

        if (drag.moved && pos) {
            await onDoorDrop(drag.door.id, pos);
        } else {
            onSelect?.(drag.door);
        }
    };

    return (
        <div
            ref={stageRef}
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
                        className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
                        draggable={false}
                    />
                )
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-grid pointer-events-none">
                    <p className="font-head text-lg font-bold text-slate-300">FLOOR {floor}</p>
                    <p className="mono mt-2 text-[10px] tracking-[0.25em] text-slate-600">UPLOAD A LAYOUT TO START PLACING DOORS</p>
                </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-500/[0.02] to-transparent" />

            {doors.map((d) => {
                if (d.x == null || d.y == null) return null;
                const style = STATUS_STYLE[d.status] || STATUS_STYLE.locked;
                const active = selectedId === d.id;
                const preview = dragPreview?.id === d.id ? dragPreview : null;
                const x = preview?.x ?? d.x;
                const y = preview?.y ?? d.y;
                const dragging = Boolean(preview);

                return (
                    <button
                        key={d.id}
                        type="button"
                        onPointerDown={(e) => startPlacedDoorDrag(e, d)}
                        onPointerMove={movePlacedDoor}
                        onPointerUp={finishPlacedDoorDrag}
                        onPointerCancel={finishPlacedDoorDrag}
                        onClick={(e) => e.preventDefault()}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 group touch-none select-none ${editable ? (dragging ? 'cursor-grabbing z-30' : 'cursor-grab') : 'cursor-pointer'}`}
                        style={{ left: `${x}%`, top: `${y}%` }}
                        title={`${d.code} · ${d.name}`}
                    >
                        <span className={`absolute inset-0 rounded-full ${style.ping} opacity-50 node-ping pointer-events-none`} />
                        <span className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-[#0b1220] ${style.ring} ${style.glow} ${active ? 'ring-2 ring-[#fee396]/70 scale-110' : ''} ${dragging ? 'scale-125 ring-2 ring-white/60' : ''}`}>
                            {d.status === 'locked' && <Lock className="h-4 w-4 text-sky-300 pointer-events-none" />}
                            {d.status === 'unlocked' && <LockOpen className="h-4 w-4 text-emerald-300 pointer-events-none" />}
                            {d.status === 'opening' && <Loader2 className="h-4 w-4 animate-spin text-orange-300 pointer-events-none" />}
                            {d.status === 'alarm' && <AlertTriangle className="h-4 w-4 text-red-400 pointer-events-none" />}
                        </span>
                        <span className={`pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap mono text-[9px] tracking-widest ${style.text}`}>
                            {d.code}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
