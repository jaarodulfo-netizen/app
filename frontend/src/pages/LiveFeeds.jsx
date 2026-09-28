import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Plus, Minus, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, VideoOff, Cctv, Trash2, Loader2, Play, Square, CircleAlert } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import Hls from 'hls.js';
import { PageHeader } from '../components/PageHeader';
import { useNow, useSecurity } from '../context/SecurityContext';
import { api, API_BASE, formatApiError } from '../context/AuthContext';

function DeleteChip({ onConfirm, testid }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 2600);
        return () => clearTimeout(t);
    }, [armed]);
    return (
        <button
            data-testid={testid}
            onClick={(e) => {
                e.stopPropagation();
                armed ? onConfirm() : setArmed(true);
            }}
            className={`absolute right-3 top-9 z-10 flex items-center gap-1 rounded border px-1.5 py-1 mono text-[9px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${
                armed ? 'border-red-500/60 bg-red-500/20 text-red-300' : 'border-white/15 bg-black/60 text-slate-300 hover:text-red-300'
            }`}
        >
            <Trash2 size={11} />
            {armed ? 'SURE?' : ''}
        </button>
    );
}

function LivePlayer({ cam, autoStart = false }) {
    const [state, setState] = useState('idle');
    const [err, setErr] = useState('');
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const pollRef = useRef(null);
    const tokenRef = useRef('');

    const attach = (token) => {
        const url = `${API_BASE}/streams/${cam.id}/index.m3u8?token=${encodeURIComponent(token)}`;
        const video = videoRef.current;
        if (!video) return;
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.play().catch(() => {});
        } else if (Hls.isSupported()) {
            const hls = new Hls({ lowLatencyMode: true });
            hls.on(Hls.Events.ERROR, (_ev, data) => {
                if (data?.fatal) {
                    clearInterval(pollRef.current);
                    setErr(data.details === 'bufferAddCodecError' ? 'BROWSER DOES NOT SUPPORT THIS CODEC (H.264) — USE CHROME/EDGE/SAFARI' : `PLAYBACK ERROR · ${data.details}`);
                    setState('error');
                }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hlsRef.current = hls;
        }
    };

    const start = async () => {
        setState('connecting');
        setErr('');
        try {
            const { data } = await api.post(`/cameras/${cam.id}/stream/start`);
            tokenRef.current = data.token;
            pollRef.current = setInterval(async () => {
                try {
                    const { data: s } = await api.get(`/cameras/${cam.id}/stream/status`);
                    if (s.state === 'live' || s.state === 'stopped') {
                        clearInterval(pollRef.current);
                        setState('live');
                        attach(tokenRef.current);
                    } else if (s.state === 'error') {
                        clearInterval(pollRef.current);
                        setErr((s.stderrTail || []).slice(-1)[0] || 'Stream unreachable');
                        setState('error');
                    }
                } catch (e) {
                    /* keep polling */
                }
            }, 1500);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail));
            setState('error');
        }
    };

    const stop = async () => {
        clearInterval(pollRef.current);
        hlsRef.current?.destroy();
        hlsRef.current = null;
        setState('idle');
        try {
            await api.post(`/cameras/${cam.id}/stream/stop`);
        } catch (e) {
            /* already gone */
        }
    };

    useEffect(() => {
        if (autoStart) start();
        return () => {
            clearInterval(pollRef.current);
            hlsRef.current?.destroy();
            if (tokenRef.current) api.post(`/cameras/${cam.id}/stream/stop`).catch(() => {});
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="absolute inset-0" data-testid={`live-player-${cam.id}`}>
            {(state === 'live' || state === 'connecting') && (
                <video ref={videoRef} muted autoPlay playsInline className={`absolute inset-0 h-full w-full object-cover ${state === 'live' ? '' : 'opacity-0'}`} />
            )}
            {state === 'idle' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-grid">
                    <Cctv size={26} className="text-sky-500/50" />
                    <p className="mono text-[10px] tracking-[0.3em] text-sky-400/70">RTSP CHANNEL LINKED</p>
                    <button
                        data-testid={`go-live-${cam.id}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            start();
                        }}
                        className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#fee396] to-[#ea7f2b] px-6 py-2.5 font-head font-bold tracking-widest text-xs text-[#2b1608] hover:opacity-90 transition-opacity duration-200"
                    >
                        <Play size={13} /> GO LIVE
                    </button>
                </div>
            )}
            {state === 'connecting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                    <Loader2 size={26} className="animate-spin text-sky-400" />
                    <p className="mono text-[10px] tracking-[0.3em] text-sky-300">CONNECTING TO NVR…</p>
                </div>
            )}
            {state === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6">
                    <CircleAlert size={24} className="text-red-400" />
                    <p className="mono text-[10px] tracking-[0.3em] text-red-300">STREAM UNREACHABLE</p>
                    <p className="mono text-[9px] tracking-wider text-slate-500 text-center break-all max-w-xs">{err}</p>
                    <button
                        data-testid={`retry-live-${cam.id}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            start();
                        }}
                        className="mt-1 rounded-full border border-red-400/40 px-5 py-2 mono text-[10px] tracking-widest text-red-300 hover:bg-red-500/10 transition-colors duration-200"
                    >
                        RETRY
                    </button>
                </div>
            )}
            {state === 'live' && (
                <button
                    data-testid={`stop-live-${cam.id}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        stop();
                    }}
                    className="absolute left-3 top-9 z-10 flex items-center gap-1.5 rounded border border-white/15 bg-black/60 px-2 py-1 mono text-[9px] tracking-widest text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:text-red-300"
                >
                    <Square size={10} /> STOP
                </button>
            )}
        </div>
    );
}

function CamTile({ cam, onZoom, onDelete, large = false }) {
    const now = useNow(1000);
    const live = cam.status === 'live';
    const hasStream = Boolean(cam.rtsp);
    return (
        <div
            data-testid={`cam-tile-${(cam.code || 'x').toLowerCase()}`}
            onClick={() => live && onZoom && onZoom(cam)}
            className={`group relative aspect-video overflow-hidden rounded-lg border bg-black scanlines ${
                live ? 'border-sky-500/15 cursor-pointer transition-colors duration-300 hover:border-sky-400/50' : 'border-red-500/20'
            }`}
        >
            {hasStream ? (
                <LivePlayer cam={cam} autoStart={large} />
            ) : cam.img ? (
                <>
                    <img
                        src={cam.img}
                        alt={cam.label}
                        className={`h-full w-full object-cover ${large ? '' : 'transition-transform duration-500 group-hover:scale-[1.04]'}`}
                        style={{ filter: 'grayscale(45%) contrast(1.12) brightness(0.78) saturate(0.75)' }}
                    />
                    <div className="absolute inset-0 bg-sky-900/20 mix-blend-overlay" />
                </>
            ) : live ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-grid">
                    <Cctv size={large ? 34 : 22} className="text-sky-500/50" />
                    <p className={`mono tracking-[0.35em] text-sky-400/70 ${large ? 'text-sm' : 'text-[10px]'}`}>NO STREAM CONFIGURED</p>
                    <p className="mono text-[9px] tracking-widest text-slate-600">ADD THE RTSP URL OF THIS NVR CHANNEL</p>
                </div>
            ) : (
                <div className="absolute inset-0">
                    <div className="static-noise absolute inset-0 opacity-50" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <VideoOff size={large ? 34 : 22} className="text-red-400/70" />
                        <p className={`mono tracking-[0.35em] text-red-400 ${large ? 'text-base' : 'text-xs'}`}>NO SIGNAL</p>
                    </div>
                </div>
            )}

            {onDelete && <DeleteChip testid={`delete-cam-${cam.id}`} onConfirm={() => onDelete(cam)} />}

            {hasStream && !large && (
                <span className="absolute left-3 top-9 z-10 mono text-[8px] tracking-widest text-gold border border-[#ea7f2b]/40 bg-[#ea7f2b]/10 rounded px-1.5 py-0.5">
                    RTSP LINKED
                </span>
            )}

            {live && !large && !hasStream && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/50 backdrop-blur-md p-2 border border-sky-500/30">
                        <span />
                        <button data-testid={`ptz-up-${(cam.code || 'x').toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><ChevronUp size={14} /></button>
                        <button data-testid={`ptz-zoom-in-${(cam.code || 'x').toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><Plus size={14} /></button>
                        <button data-testid={`ptz-left-${(cam.code || 'x').toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><ChevronLeft size={14} /></button>
                        <span />
                        <button data-testid={`ptz-right-${(cam.code || 'x').toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><ChevronRight size={14} /></button>
                        <span />
                        <button data-testid={`ptz-down-${(cam.code || 'x').toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><ChevronDown size={14} /></button>
                        <button data-testid={`ptz-zoom-out-${(cam.code || 'x').toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-sky-300 hover:bg-sky-500/20"><Minus size={14} /></button>
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
                <p className="mono text-[9px] tracking-widest text-slate-500 mt-0.5">
                    {(cam.location || 'UNASSIGNED ZONE').toUpperCase()}
                    {cam.nvrName ? ` · ${cam.nvrName.toUpperCase()}` : ''}
                </p>
            </div>
        </div>
    );
}

function AddCameraModal({ open, onClose }) {
    const { addCamera, devices } = useSecurity();
    const nvrs = (devices || []).filter((d) => d.type === 'nvr');
    const [label, setLabel] = useState('');
    const [location, setLocation] = useState('');
    const [nvr, setNvr] = useState('');
    const [rtsp, setRtsp] = useState('');
    const [img, setImg] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const nvrDoc = nvrs.find((n) => n.id === nvr);
            await addCamera({ label: label.trim().toUpperCase(), location: location.trim(), nvr, nvrName: nvrDoc?.name || '', rtsp: rtsp.trim(), img: img.trim() || null });
            toast.success('CAMERA REGISTERED', { description: label.toUpperCase() });
            setLabel(''); setLocation(''); setNvr(''); setRtsp(''); setImg('');
            onClose();
        } catch (err) {
            toast.error('REGISTER FAILED', { description: 'Could not save camera — try again' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        data-testid="add-camera-modal"
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-full max-w-md rounded-2xl border border-sky-500/25 bg-[#0b1220] p-6 sm:p-8 max-h-[92vh] overflow-y-auto"
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="mono text-[10px] tracking-[0.35em] text-sky-400">NVR CHANNEL</p>
                                <h2 className="font-display text-xl font-bold text-white mt-2">Register Camera</h2>
                            </div>
                            <button data-testid="add-camera-close-btn" onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors duration-200">
                                <X size={15} />
                            </button>
                        </div>
                        <form onSubmit={submit} className="mt-6 space-y-4">
                            <div>
                                <label className="mono text-[10px] tracking-widest text-slate-500">CHANNEL LABEL</label>
                                <input data-testid="camera-label-input" value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="e.g. LOBBY ENTRANCE"
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                            </div>
                            <div>
                                <label className="mono text-[10px] tracking-widest text-slate-500">LOCATION</label>
                                <input data-testid="camera-location-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Floor 04 · North"
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                            </div>
                            <div>
                                <label className="mono text-[10px] tracking-widest text-slate-500">ASSIGNED NVR</label>
                                <select data-testid="camera-nvr-select" value={nvr} onChange={(e) => setNvr(e.target.value)}
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#0f172a] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60 transition-colors duration-200">
                                    <option value="">UNASSIGNED</option>
                                    {nvrs.map((n) => (
                                        <option key={n.id} value={n.id}>{n.name}</option>
                                    ))}
                                </select>
                                {nvrs.length === 0 && <p className="mono text-[9px] tracking-wider text-orange-300/80 mt-2">NO NVRS YET · ADD ONE IN ACCESS DEVICES</p>}
                            </div>
                            <div>
                                <label className="mono text-[10px] tracking-widest text-slate-500">RTSP STREAM URL · FROM YOUR NVR</label>
                                <input data-testid="camera-rtsp-input" value={rtsp} onChange={(e) => setRtsp(e.target.value)} placeholder="rtsp://usuario:clave@10.4.0.21:554/Streaming/Channels/101"
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 mono text-xs text-sky-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                                <p className="mono text-[9px] tracking-wider text-slate-600 mt-2">HIKVISION · CANAL 1 = /101 · CANAL 2 = /201 · SUBSTREAM = /102</p>
                            </div>
                            <div>
                                <label className="mono text-[10px] tracking-widest text-slate-500">SNAPSHOT URL · OPTIONAL</label>
                                <input data-testid="camera-img-input" value={img} onChange={(e) => setImg(e.target.value)} placeholder="https://…/frame.jpg"
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 mono text-xs text-sky-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                            </div>
                            <button data-testid="add-camera-submit-btn" type="submit" disabled={saving}
                                className={`flex w-full items-center justify-center gap-2 rounded-full py-3 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                                    saving ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-sky-500 text-[#04121f] hover:bg-cyan-400'
                                }`}>
                                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                {saving ? 'REGISTERING…' : 'REGISTER CHANNEL'}
                            </button>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default function LiveFeeds() {
    const { cameras, deleteCamera } = useSecurity();
    const [zoom, setZoom] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const list = cameras || [];
    const liveCount = list.filter((c) => c.status === 'live').length;

    const remove = async (cam) => {
        try {
            await api.post(`/cameras/${cam.id}/stream/stop`).catch(() => {});
            await deleteCamera(cam.id);
            toast.success('CHANNEL REMOVED', { description: `${cam.code} · ${cam.label}` });
        } catch (e) {
            toast.error('DELETE FAILED', { description: 'Could not remove camera — try again' });
        }
    };

    return (
        <div className="space-y-6" data-testid="feeds-page">
            <PageHeader eyebrow={cameras === null ? 'NVR // SYNCING…' : `NVR GRID // ${liveCount} OF ${list.length} CHANNELS LIVE`} title="Live Video Grid">
                <div className="flex items-center gap-3">
                    <span className="hidden sm:flex items-center gap-2 mono text-[10px] tracking-widest text-red-400 border border-red-400/30 bg-red-400/10 rounded-full px-4 py-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 rec-blink" /> RECORDING
                    </span>
                    <button
                        data-testid="add-camera-open-btn"
                        onClick={() => setAddOpen(true)}
                        className="flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 font-head font-bold tracking-widest text-sm text-[#04121f] transition-colors duration-200 hover:bg-cyan-400"
                    >
                        <Plus size={15} /> ADD CAMERA
                    </button>
                </div>
            </PageHeader>

            {cameras === null ? (
                <p className="mono text-xs tracking-widest text-slate-600 py-16 text-center">CONNECTING TO NVR GRID…</p>
            ) : list.length === 0 ? (
                <button
                    data-testid="empty-cameras-cta"
                    onClick={() => setAddOpen(true)}
                    className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sky-500/25 py-20 transition-colors duration-200 hover:border-[#ea7f2b]/50 hover:bg-[#ea7f2b]/5"
                >
                    <Cctv size={28} className="text-sky-500/60" />
                    <p className="mono text-[10px] tracking-[0.25em] text-slate-500">NO CAMERAS REGISTERED · ADD YOUR FIRST NVR CHANNEL</p>
                </button>
            ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {list.map((cam, i) => (
                        <motion.div
                            key={cam.id}
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.07, 0.4), duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <CamTile cam={cam} onZoom={setZoom} onDelete={remove} />
                        </motion.div>
                    ))}
                </div>
            )}

            <AddCameraModal open={addOpen} onClose={() => setAddOpen(false)} />

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
