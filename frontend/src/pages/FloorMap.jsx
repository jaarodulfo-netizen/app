import { useState } from 'react';
import { motion } from 'framer-motion';
import { LockOpen, BellOff, Loader2, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FloorPlan } from '../components/FloorPlan';
import { useSecurity } from '../context/SecurityContext';
import { CAMERAS } from '../data/mockData';

const STATUS_META = {
    locked: { label: 'LOCKED', cls: 'text-sky-300 border-sky-400/30 bg-sky-400/10', dot: 'bg-sky-400' },
    unlocked: { label: 'UNLOCKED', cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10', dot: 'bg-emerald-400' },
    opening: { label: 'RELEASING', cls: 'text-orange-300 border-orange-400/30 bg-orange-400/10', dot: 'bg-orange-400' },
    alarm: { label: 'TAMPER ALARM', cls: 'text-red-300 border-red-400/30 bg-red-400/10', dot: 'bg-red-500' },
};

export default function FloorMap() {
    const { doors, openDoor, silenceDoor } = useSecurity();
    const [selectedId, setSelectedId] = useState('d-01');
    const selected = doors.find((d) => d.id === selectedId);
    const cam = selected ? CAMERAS.find((c) => c.id === selected.camId) : null;
    const meta = STATUS_META[selected.status];

    return (
        <div className="space-y-6" data-testid="floormap-page">
            <PageHeader eyebrow="BUILDING LAYOUT // HQ NORTH TOWER" title="Floor Map & Doors">
                <div className="flex items-center gap-4 mono text-[10px] tracking-widest text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> LOCKED</span>
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> OPEN</span>
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> ALARM</span>
                </div>
            </PageHeader>

            <div className="grid lg:grid-cols-[1fr_360px] gap-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="aegis-panel corner-frame rounded-2xl bg-grid p-4 sm:p-8"
                >
                    <FloorPlan doors={doors} selectedId={selectedId} onSelect={(d) => setSelectedId(d.id)} />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-5"
                >
                    <div className="aegis-panel aegis-panel-glow rounded-xl p-6" data-testid="door-detail-panel">
                        <div className="flex items-center justify-between">
                            <p className="mono text-xs tracking-[0.3em] text-sky-400">{selected.code}</p>
                            <span className={`mono text-[10px] tracking-widest px-2.5 py-1 rounded border ${meta.cls}`}>{meta.label}</span>
                        </div>
                        <h2 className="font-display text-xl font-bold text-white mt-3">{selected.name}</h2>
                        <p className="mono text-[10px] tracking-widest text-slate-500 mt-1.5">ZONE · {selected.zone} · FLOOR 04</p>

                        {cam && cam.img && (
                            <div className="relative mt-5 aspect-video overflow-hidden rounded-lg border border-white/10 scanlines">
                                <img
                                    src={cam.img}
                                    alt={cam.label}
                                    className="h-full w-full object-cover"
                                    style={{ filter: 'grayscale(45%) contrast(1.12) brightness(0.78) saturate(0.75)' }}
                                />
                                <div className="absolute inset-0 bg-sky-900/20 mix-blend-overlay" />
                                <span className="absolute left-2 top-2 flex items-center gap-1.5 mono text-[9px] tracking-widest text-red-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 rec-blink" /> REC
                                </span>
                                <span className="absolute bottom-2 left-2 mono text-[9px] tracking-widest text-sky-200/90">
                                    {cam.code} · ASSIGNED FEED
                                </span>
                            </div>
                        )}

                        {selected.status === 'alarm' ? (
                            <button
                                data-testid="door-silence-btn"
                                onClick={() => silenceDoor(selected.id)}
                                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-red-500/90 py-3.5 font-head font-bold tracking-widest text-sm text-white transition-colors duration-200 hover:bg-red-400"
                            >
                                <BellOff size={16} />
                                SILENCE ALARM
                            </button>
                        ) : (
                            <button
                                data-testid="door-open-btn"
                                onClick={() => openDoor(selected.id)}
                                disabled={selected.status !== 'locked'}
                                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                                    selected.status === 'locked'
                                        ? 'bg-sky-500 text-[#04121f] hover:bg-cyan-400'
                                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                            >
                                {selected.status === 'opening' ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" /> RELEASING LATCH…
                                    </>
                                ) : selected.status === 'unlocked' ? (
                                    <>
                                        <LockOpen size={16} /> OPEN · AUTO RELOCK IN 10S
                                    </>
                                ) : (
                                    <>
                                        <LockOpen size={16} /> REMOTE OPEN
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    <div className="aegis-panel rounded-xl p-4">
                        <p className="mono text-[10px] tracking-[0.25em] text-slate-500 px-2 pb-3">ALL DOORS · {doors.length}</p>
                        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                            {doors.map((d) => (
                                <button
                                    key={d.id}
                                    data-testid={`door-list-${d.code.toLowerCase()}`}
                                    onClick={() => setSelectedId(d.id)}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-200 ${
                                        d.id === selectedId ? 'bg-sky-500/10 border border-sky-500/25' : 'border border-transparent hover:bg-white/[0.04]'
                                    }`}
                                >
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_META[d.status].dot} ${d.status === 'alarm' ? 'alarm-flash' : ''}`} />
                                    <span className="mono text-[10px] text-slate-500 w-10">{d.code}</span>
                                    <span className="text-sm text-slate-200 flex-1 truncate">{d.name}</span>
                                    {d.status === 'alarm' && <ShieldAlert size={13} className="text-red-400 shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
