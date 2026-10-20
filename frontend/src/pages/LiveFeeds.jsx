import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ExternalLink, Grid2X2, Grid3X3, GridIcon, Maximize2, MonitorUp, Search, Trash2, X, Loader2, CircleAlert, PanelLeftClose, PanelLeftOpen, Expand } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useSecurity } from '../context/SecurityContext';
import { api, formatApiError } from '../context/AuthContext';

const WALL_KEY = 'kerma-video-wall-v1';

const LAYOUTS = [
    { slots: 1, cols: 1, label: '1 × 1', icon: Maximize2 },
    { slots: 4, cols: 2, label: '2 × 2', icon: Grid2X2 },
    { slots: 9, cols: 3, label: '3 × 3', icon: Grid3X3 },
    { slots: 16, cols: 4, label: '4 × 4', icon: GridIcon },
];

function loadWall() {
    try {
        const raw = JSON.parse(localStorage.getItem(WALL_KEY) || '{}');
        const slots = LAYOUTS.some((l) => l.slots === raw.slots) ? raw.slots : 4;
        return {
            slots,
            assignments: Array.isArray(raw.assignments) ? raw.assignments.slice(0, slots) : Array(slots).fill(null),
        };
    } catch {
        return { slots: 4, assignments: Array(4).fill(null) };
    }
}

function saveWall(state) {
    localStorage.setItem(WALL_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('kerma-wall-updated'));
}

function GatewaySnapshot({ cam }) {
    const [src, setSrc] = useState('');
    const [err, setErr] = useState('');
    const objectUrlRef = useRef('');
    useEffect(() => {
        let active = true;
        let timer;
        let pending;
        const poll = async () => {
            if (!active) return;
            if (document.hidden) {
                timer = setTimeout(poll, 2000);
                return;
            }
            const controller = new AbortController();
            pending = controller;
            try {
                const { data } = await api.get(`/cameras/${cam.id}/snapshot`, {
                    responseType: 'blob', signal: controller.signal, timeout: 12000,
                });
                if (!active) return;
                const url = URL.createObjectURL(data);
                if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = url;
                setSrc(url);
                setErr('');
            } catch (e) {
                if (active && !controller.signal.aborted) setErr(formatApiError(e.response?.data?.detail || e.message));
            } finally {
                pending = null;
                if (active) timer = setTimeout(poll, 1400);
            }
        };
        poll();
        return () => {
            active = false;
            clearTimeout(timer);
            pending?.abort();
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = '';
        };
    }, [cam.id]);
    return (
        <div className="absolute inset-0 bg-black">
            {src ? (
                <>
                    <img src={src} alt={cam.label} className="absolute inset-0 h-full w-full object-contain" />
                    <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-[9px] text-amber-200">FOTOGRAMAS · NO VIDEO CONTINUO</span>
                    {err && <span className="absolute bottom-11 left-2 rounded bg-red-950/70 px-2 py-1 text-[9px] text-red-200">CONEXIÓN INESTABLE</span>}
                </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black">
                    {err ? <CircleAlert size={21} className="text-red-400/70" /> : <Loader2 size={21} className="animate-spin text-sky-400/70" />}
                    <span className={`mono text-[9px] tracking-[0.24em] ${err ? 'text-red-300' : 'text-sky-300'}`}>{err ? 'CAMERA UNAVAILABLE' : 'CONNECTING'}</span>
                </div>
            )}
        </div>
    );
}

// Native browser HLS via the private outbound Windows Gateway tunnel.
// Falls back to legacy stills if the onsite Gateway has not been upgraded yet.
function GatewayLiveVideo({ cam, quality }) {
    const videoRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [fallback, setFallback] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        let hls = null;
        let video = videoRef.current;
        setReady(false);
        setFallback(false);
        setError('');
        const initialize = async () => {
            try {
                const { data } = await api.post(`/cameras/${cam.id}/live/start`, { quality }, { timeout: 16000 });
                if (!active) return;
                if (!data?.ok || !data?.playlistUrl) throw new Error('HLS Gateway unavailable');
                const url = new URL(data.playlistUrl, process.env.REACT_APP_BACKEND_URL).toString();
                if (Hls.isSupported()) {
                    hls = new Hls({
                        lowLatencyMode: false,
                        liveSyncDurationCount: 2,
                        maxBufferLength: 12,
                        maxLiveSyncPlaybackRate: 1.5,
                        enableWorker: true,
                    });
                    hls.on(Hls.Events.ERROR, (_event, state) => {
                        if (!active) return;
                        if (state.fatal) {
                            setError('Video HD interrumpido; se muestran capturas de respaldo');
                            setFallback(true);
                            hls?.destroy();
                            hls = null;
                        }
                    });
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(url));
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (!active) return;
                        video?.play()?.catch(() => {});
                        setReady(true);
                    });
                } else if (video?.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                    video.play().catch(() => {});
                    setReady(true);
                } else {
                    throw new Error('Navegador sin reproductor HLS');
                }
            } catch (err) {
                if (!active) return;
                setError(formatApiError(err.response?.data?.detail || err.message) || 'Gateway HLS no disponible');
                setFallback(true);
            }
        };
        initialize();
        return () => {
            active = false;
            hls?.destroy();
            video?.pause();
            if (video) { video.removeAttribute('src'); video.load(); }
        };
    }, [cam.id, quality]);

    return (
        <div className="absolute inset-0 bg-black">
            {fallback ? (
                <>
                    <GatewaySnapshot cam={cam} />
                    <div className="pointer-events-none absolute bottom-11 right-2 z-20 max-w-[80%] rounded bg-amber-950/85 p-1.5 text-[9px] text-amber-200">
                        {error || 'Gateway local pendiente de actualizar para HLS'}
                    </div>
                </>
            ) : (
                <>
                    <video ref={videoRef} muted autoPlay playsInline controls={false}
                        className="absolute inset-0 h-full w-full bg-black object-contain" />
                    <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[9px] text-emerald-200">
                        {ready ? (quality === 'main' ? 'LIVE HD · PRINCIPAL · 1080P MÁX.' : 'LIVE H.264 · SUBSTREAM') : 'CONECTANDO VIDEO CONTINUO…'}
                    </div>
                </>
            )}
        </div>
    );
}

function WallCell({ cam, quality, index, selected, onSelect, onFocus, onDropCamera, onRemove }) {
    const onDrop = (e) => {
        e.preventDefault();
        const cameraId = e.dataTransfer.getData('application/x-kerma-camera') || e.dataTransfer.getData('text/plain');
        if (cameraId) onDropCamera(index, cameraId);
    };

    return (
        <div
            onClick={() => onSelect(index)}
            onDoubleClick={() => { if (cam) onFocus(index); }}
            title={cam ? "Doble clic para ampliar o restaurar" : "Seleccionar ventana"}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`group relative min-h-0 min-w-0 overflow-hidden bg-black cursor-pointer ${selected ? 'ring-1 ring-inset ring-sky-400/80 z-10' : ''}`}
        >
            {cam ? (
                <>
                    <GatewayLiveVideo cam={cam} quality={quality} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/20 to-transparent px-2.5 pb-2 pt-8 opacity-80 group-hover:opacity-100">
                        <div className="truncate mono text-[9px] tracking-wider text-white">{cam.label}</div>
                        <div className="truncate mono text-[8px] tracking-wider text-slate-400">{cam.nvrName || 'NVR'} · CH {cam.channelNo || '—'}</div>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(index);
                        }}
                        className="absolute right-2 top-2 z-20 rounded bg-black/65 p-1.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300"
                        title="Remove camera"
                    >
                        <X size={13} />
                    </button>
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[#030609]">
                    <div className="text-center">
                        <MonitorUp size={20} className="mx-auto text-slate-800" />
                        <p className="mt-2 mono text-[8px] tracking-[0.28em] text-slate-700">DROP CAMERA</p>
                        <p className="mt-1 mono text-[7px] tracking-wider text-slate-800">WINDOW {index + 1}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function CameraRail({ cameras, assignedIds, activeSlot, onAssign }) {
    const [query, setQuery] = useState('');
    const grouped = useMemo(() => {
        const q = query.trim().toLowerCase();
        const rows = cameras.filter((cam) => !q || `${cam.label} ${cam.nvrName} ${cam.channelNo}`.toLowerCase().includes(q));
        const map = new Map();
        rows.forEach((cam) => {
            const key = cam.nvrName || 'UNASSIGNED NVR';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(cam);
        });
        return [...map.entries()];
    }, [cameras, query]);

    return (
        <aside className="w-[280px] shrink-0 border-r border-white/10 bg-[#060a10] flex flex-col min-h-0">
            <div className="p-3 border-b border-white/10">
                <p className="mono text-[9px] tracking-[0.28em] text-sky-400">CAMERA TREE</p>
                <div className="mt-2 flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5">
                    <Search size={13} className="text-slate-600" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search camera..."
                        className="h-9 min-w-0 flex-1 bg-transparent mono text-[10px] text-slate-200 outline-none placeholder:text-slate-700"
                    />
                </div>
                <p className="mt-2 mono text-[8px] text-slate-600">SELECT WINDOW {activeSlot + 1}, THEN CLICK OR DRAG A CAMERA</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {grouped.map(([nvr, items]) => (
                    <div key={nvr} className="border-b border-white/5">
                        <div className="sticky top-0 z-10 bg-[#090e16]/95 px-3 py-2 mono text-[9px] tracking-widest text-slate-400">
                            {nvr} · {items.length}
                        </div>
                        {items.map((cam) => {
                            const active = assignedIds.has(cam.id);
                            return (
                                <button
                                    key={cam.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.effectAllowed = 'copy';
                                        e.dataTransfer.setData('application/x-kerma-camera', cam.id);
                                        e.dataTransfer.setData('text/plain', cam.id);
                                    }}
                                    onClick={() => onAssign(activeSlot, cam.id)}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-sky-500/10 ${active ? 'bg-sky-500/[0.06]' : ''}`}
                                >
                                    <span className={`h-1.5 w-1.5 rounded-full ${cam.status === 'live' ? 'bg-emerald-400' : 'bg-red-500'}`} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate mono text-[9px] text-slate-300">{cam.label}</div>
                                        <div className="mono text-[8px] text-slate-600">CH {cam.channelNo || '—'} · {cam.nvrIp || ''}</div>
                                    </div>
                                    {active && <span className="mono text-[7px] text-sky-400">IN WALL</span>}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </aside>
    );
}

function VideoWall() {
    const { cameras } = useSecurity();
    const [wall, setWall] = useState(loadWall);
    const [activeSlot, setActiveSlot] = useState(0);
    const [showCameraTree, setShowCameraTree] = useState(true);
    const previousGridRef = useRef(null);
    const wallContainerRef = useRef(null);
    const detached = new URLSearchParams(window.location.search).get('detached') === '1';

    useEffect(() => {
        const sync = () => setWall(loadWall());
        window.addEventListener('storage', sync);
        window.addEventListener('kerma-wall-updated', sync);
        return () => {
            window.removeEventListener('storage', sync);
            window.removeEventListener('kerma-wall-updated', sync);
        };
    }, []);

    const layout = LAYOUTS.find((l) => l.slots === wall.slots) || LAYOUTS[1];
    const cameraMap = useMemo(() => new Map((cameras || []).map((cam) => [cam.id, cam])), [cameras]);
    const assignedIds = useMemo(() => new Set(wall.assignments.filter(Boolean)), [wall.assignments]);

    const commit = (next) => {
        setWall(next);
        saveWall(next);
    };

    const setLayout = (slots) => {
        previousGridRef.current = null;
        const assignments = Array(slots).fill(null);
        wall.assignments.slice(0, slots).forEach((id, i) => { assignments[i] = id || null; });
        commit({ slots, assignments });
        setActiveSlot((current) => Math.min(current, slots - 1));
    };

    const assign = (slot, cameraId) => {
        const assignments = [...wall.assignments];
        const existingSlot = assignments.findIndex((id) => id === cameraId);
        if (existingSlot >= 0) assignments[existingSlot] = null;
        assignments[slot] = cameraId;
        commit({ ...wall, assignments });
        setActiveSlot(Math.min(slot + 1, wall.slots - 1));
    };

    const remove = (slot) => {
        const assignments = [...wall.assignments];
        assignments[slot] = null;
        commit({ ...wall, assignments });
    };

    const clear = () => { previousGridRef.current = null; commit({ ...wall, assignments: Array(wall.slots).fill(null) }); };

    const focus = (slot) => {
        if (previousGridRef.current) {
            const previous = previousGridRef.current;
            previousGridRef.current = null;
            commit(previous);
            return;
        }
        const cameraId = wall.assignments[slot];
        if (!cameraId) return;
        previousGridRef.current = wall;
        commit({ slots: 1, assignments: [cameraId] });
        setActiveSlot(0);
    };

    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else wallContainerRef.current?.requestFullscreen?.().catch(() => {});
    };

    const detach = () => {
        const url = `${window.location.origin}${window.location.pathname}?detached=1`;
        window.open(url, 'kerma-video-wall', 'popup=yes,width=1500,height=900,resizable=yes,scrollbars=no');
    };

    const wallGrid = (
        <div
            className="grid flex-1 min-h-0 min-w-0 gap-0 bg-black"
            style={{
                gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${Math.ceil(layout.slots / layout.cols)}, minmax(0, 1fr))`,
            }}
        >
            {Array.from({ length: wall.slots }).map((_, index) => {
                const id = wall.assignments[index];
                const cam = id ? cameraMap.get(id) : null;
                return (
                    <WallCell
                        key={index}
                        index={index}
                        cam={cam}
                        quality={wall.slots === 1 ? "main" : "sub"}
                        selected={activeSlot === index}
                        onSelect={setActiveSlot}
                        onFocus={focus}
                        onDropCamera={assign}
                        onRemove={remove}
                    />
                );
            })}
        </div>
    );

    if (detached) {
        return (
            <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
                <div className="flex h-10 shrink-0 items-center justify-between bg-[#05080c] px-3">
                    <span className="mono text-[9px] tracking-[0.28em] text-sky-300">KERMA VIDEO WALL · DETACHED</span>
                    <span className="mono text-[8px] text-slate-600">{layout.label}</span>
                </div>
                {wallGrid}
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="feeds-page">
            <PageHeader
                eyebrow={cameras === null ? 'NVR // SYNCING…' : `VIDEO WALL // ${assignedIds.size} ACTIVE WINDOWS`}
                title="Live Video Wall"
            />

            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#070b12] px-3 py-2">
                <div className="flex items-center gap-1.5">
                    {LAYOUTS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.slots}
                                onClick={() => setLayout(item.slots)}
                                className={`flex items-center gap-2 rounded-md px-3 py-2 mono text-[9px] tracking-wider transition-colors ${wall.slots === item.slots ? 'bg-sky-500/15 text-sky-300' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}
                            >
                                <Icon size={13} />
                                {item.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" data-testid="cctv-tree-toggle" onClick={() => setShowCameraTree(v => !v)}
                        className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[10px] text-sky-200">
                        {showCameraTree ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
                        {showCameraTree ? 'OCULTAR ÁRBOL' : 'CÁMARAS'}
                    </button>
                    <button type="button" data-testid="cctv-fullscreen" onClick={toggleFullscreen}
                        className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[10px] text-sky-200">
                        <Expand size={15} /> FULLSCREEN
                    </button>
                    <button onClick={clear} className="flex items-center gap-2 rounded-md px-3 py-2 mono text-[9px] tracking-wider text-slate-500 hover:bg-red-500/10 hover:text-red-300">
                        <Trash2 size={12} /> CLEAR
                    </button>
                    <button onClick={detach} className="flex items-center gap-2 rounded-md border border-sky-400/20 bg-sky-500/10 px-3 py-2 mono text-[9px] tracking-wider text-sky-300 hover:bg-sky-500/20">
                        <ExternalLink size={12} /> DETACH WALL
                    </button>
                </div>
            </div>

            <div ref={wallContainerRef} className="flex h-[72vh] min-h-[560px] overflow-hidden rounded-lg border border-white/10 bg-black">
                {showCameraTree && <CameraRail
                    cameras={cameras || []}
                    assignedIds={assignedIds}
                    activeSlot={activeSlot}
                    onAssign={assign}
                />}
                {wallGrid}
            </div>
        </div>
    );
}

export default VideoWall;
