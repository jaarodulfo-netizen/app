import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Grid2X2, Grid3X3, GridIcon, Maximize2, MonitorUp, Search, Trash2, X, Loader2, CircleAlert } from 'lucide-react';
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
    const timerRef = useRef(null);

    const load = async () => {
        try {
            const { data } = await api.get(`/cameras/${cam.id}/snapshot`, { responseType: 'blob' });
            const next = URL.createObjectURL(data);
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = next;
            setSrc(next);
            setErr('');
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || 'Camera unavailable');
        }
    };

    useEffect(() => {
        load();
        timerRef.current = setInterval(load, 1400);
        return () => {
            clearInterval(timerRef.current);
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cam.id]);

    return (
        <div className="absolute inset-0 bg-black">
            {src ? (
                <img src={src} alt={cam.label} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black">
                    {err ? <CircleAlert size={21} className="text-red-400/70" /> : <Loader2 size={21} className="animate-spin text-sky-400/70" />}
                    <span className={`mono text-[9px] tracking-[0.24em] ${err ? 'text-red-300' : 'text-sky-300'}`}>
                        {err ? 'CAMERA UNAVAILABLE' : 'CONNECTING'}
                    </span>
                    {err && <span className="max-w-[85%] text-center mono text-[8px] text-slate-600">{err}</span>}
                </div>
            )}
        </div>
    );
}

function WallCell({ cam, index, selected, onSelect, onDropCamera, onRemove }) {
    const onDrop = (e) => {
        e.preventDefault();
        const cameraId = e.dataTransfer.getData('application/x-kerma-camera') || e.dataTransfer.getData('text/plain');
        if (cameraId) onDropCamera(index, cameraId);
    };

    return (
        <div
            onClick={() => onSelect(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`group relative min-h-0 min-w-0 overflow-hidden bg-black cursor-pointer ${selected ? 'ring-1 ring-inset ring-sky-400/80 z-10' : ''}`}
        >
            {cam ? (
                <>
                    <GatewaySnapshot cam={cam} />
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

    const clear = () => commit({ ...wall, assignments: Array(wall.slots).fill(null) });

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
                        selected={activeSlot === index}
                        onSelect={setActiveSlot}
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

                <div className="flex items-center gap-2">
                    <button onClick={clear} className="flex items-center gap-2 rounded-md px-3 py-2 mono text-[9px] tracking-wider text-slate-500 hover:bg-red-500/10 hover:text-red-300">
                        <Trash2 size={12} /> CLEAR
                    </button>
                    <button onClick={detach} className="flex items-center gap-2 rounded-md border border-sky-400/20 bg-sky-500/10 px-3 py-2 mono text-[9px] tracking-wider text-sky-300 hover:bg-sky-500/20">
                        <ExternalLink size={12} /> DETACH WALL
                    </button>
                </div>
            </div>

            <div className="flex h-[72vh] min-h-[560px] overflow-hidden rounded-lg border border-white/10 bg-black">
                <CameraRail
                    cameras={cameras || []}
                    assignedIds={assignedIds}
                    activeSlot={activeSlot}
                    onAssign={assign}
                />
                {wallGrid}
            </div>
        </div>
    );
}

export default VideoWall;
