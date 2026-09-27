import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Plus, Minus, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, VideoOff } from 'lucide-react';
import dayjs from 'dayjs';
import { PageHeader } from '../components/PageHeader';
import { useNow } from '../context/SecurityContext';
import { CAMERAS } from '../data/mockData';

function CamTile({ cam, onZoom, large = false }) {
    const now = useNow(1000);
    const live = cam.status === 'live';
    return (
        <div
            data-testid={`cam-tile-${cam.code.toLowerCase()}`}
            onClick={() => live && onZoom && onZoom(cam)}
            className={`group relative aspect-video overflow-hidden rounded-lg border bg-black scanlines ${
                live ? 'border-sky-500/15 cursor-pointer transition-colors duration-300 hover:border-sky-400/50' : 'border-red-500/20'
            }`}
        >
            {live ? (
                <>
                    <img
                        src={cam.img}
                        alt={cam.label}
                        className={`h-full w-full object-cover ${large ? '' : 'transition-transform duration-500 group-hover:scale-[1.04]'}`}
                        style={{ filter: 'grayscale(45%) contrast(1.12) brightness(0.78) saturate(0.75)' }}
                    />
                    <div className="absolute inset-0 bg-sky-900/20 mix-blend-overlay" />
                    <span
                        className="absolute right-3 top-1/3 mono text-[9px] tracking-widest text-amber-300/90 border border-amber-400/40 bg-amber-400/10 rounded px-1.5 py-0.5 motion-flicker"
                        style={{ animationDelay: `${(parseInt(cam.code.slice(-1), 10) * 1.7) % 6}s` }}
                    >
                        MOTION
                    </span>
                    {!large && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/50 backdrop-blur-md p-2 border border-sky-500/30">
                                <span />
                                <button data-testid={`ptz-up-${cam.code.toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><ChevronUp size={14} /></button>
                                <button data-testid={`ptz-zoom-in-${cam.code.toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><Plus size={14} /></button>
                                <button data-testid={`ptz-left-${cam.code.toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><ChevronLeft size={14} /></button>
                                <span />
                                <button data-testid={`ptz-right-${cam.code.toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><ChevronRight size={14} /></button>
                                <span />
                                <button data-testid={`ptz-down-${cam.code.toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><ChevronDown size={14} /></button>
                                <button data-testid={`ptz-zoom-out-${cam.code.toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><Minus size={14} /></button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="absolute inset-0">
                    <div className="static-noise absolute inset-0 opacity-50" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <VideoOff size={large ? 34 : 22} className="text-red-400/70" />
                        <p className={`mono tracking-[0.35em] text-red-400 ${large ? 'text-base' : 'text-xs'}`}>NO SIGNAL</p>
                        <p className="mono text-[9px] tracking-widest text-slate-600">SIGNAL LOST · LAST FRAME 04:12:33</p>
                    </div>
                </div>
            )}

            <span className={`absolute left-3 top-2.5 flex items-center gap-1.5 mono text-[10px] tracking-widest ${live ? 'text-red-400' : 'text-slate-600'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-red-500 rec-blink' : 'bg-slate-700'}`} />
                {live ? 'REC' : 'OFF'}
            </span>
            <span className="absolute right-3 top-2.5 mono text-[10px] tracking-widest text-slate-300 tabular-nums">
                {dayjs(now).format('HH:mm:ss')}
            </span>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8">
                <p className={`mono tracking-widest text-sky-200 ${large ? 'text-sm' : 'text-[10px]'}`}>
                    {cam.code} · {cam.label}
                </p>
                <p className="mono text-[9px] tracking-widest text-slate-500 mt-0.5">{cam.location.toUpperCase()}</p>
            </div>
        </div>
    );
}

export default function LiveFeeds() {
    const [zoom, setZoom] = useState(null);
    const liveCount = CAMERAS.filter((c) => c.status === 'live').length;

    return (
        <div className="space-y-6" data-testid="feeds-page">
            <PageHeader eyebrow={`NVR-01 // ${liveCount} OF ${CAMERAS.length} CHANNELS LIVE`} title="Live Video Grid">
                <span className="flex items-center gap-2 mono text-[10px] tracking-widest text-red-400 border border-red-400/30 bg-red-400/10 rounded-full px-4 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 rec-blink" /> RECORDING · 30 DAY RETENTION
                </span>
            </PageHeader>

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {CAMERAS.map((cam, i) => (
                    <motion.div
                        key={cam.id}
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <CamTile cam={cam} onZoom={setZoom} />
                    </motion.div>
                ))}
            </div>

            <AnimatePresence>
                {zoom && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-10"
                        onClick={() => setZoom(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.94, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.94, y: 20 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="w-full max-w-5xl"
                            onClick={(e) => e.stopPropagation()}
                            data-testid="cam-zoom-modal"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <p className="mono text-xs tracking-[0.3em] text-sky-300">{zoom.code} · {zoom.label} — FULL CHANNEL VIEW</p>
                                <button
                                    data-testid="cam-modal-close"
                                    onClick={() => setZoom(null)}
                                    className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 mono text-[10px] tracking-widest text-slate-300 transition-colors duration-200 hover:bg-white/10"
                                >
                                    <X size={13} /> CLOSE
                                </button>
                            </div>
                            <CamTile cam={zoom} large />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
