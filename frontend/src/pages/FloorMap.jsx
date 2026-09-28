import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LockOpen, Lock, BellOff, Loader2, ShieldAlert, Pencil, Upload, Save, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { FloorPlan } from '../components/FloorPlan';
import { useSecurity } from '../context/SecurityContext';
import { api, fileUrl } from '../context/AuthContext';

const STATUS_META = {
    locked: { label: 'LOCKED', cls: 'text-sky-300 border-sky-400/30 bg-sky-400/10', dot: 'bg-sky-400' },
    unlocked: { label: 'UNLOCKED', cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10', dot: 'bg-emerald-400' },
    opening: { label: 'RELEASING', cls: 'text-orange-300 border-orange-400/30 bg-orange-400/10', dot: 'bg-orange-400' },
    alarm: { label: 'TAMPER ALARM', cls: 'text-red-300 border-red-400/30 bg-red-500/10', dot: 'bg-red-500' },
};

export default function FloorMap() {
    const { doors, openDoor, closeDoor, silenceDoor, updateDoor, placeDoor } = useSecurity();
    const [floor, setFloor] = useState(1);
    const [layouts, setLayouts] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [editMode, setEditMode] = useState(true);
    const [editName, setEditName] = useState('');
    const [editZone, setEditZone] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [uploading, setUploading] = useState(false);
    const uploadRef = useRef(null);

    const doorList = useMemo(() => doors || [], [doors]);
    const placedOnFloor = useMemo(
        () => doorList.filter((d) => Number(d.floor) === floor && d.x != null && d.y != null),
        [doorList, floor],
    );
    const unplaced = useMemo(
        () => doorList.filter((d) => d.floor == null || d.x == null || d.y == null),
        [doorList],
    );
    const currentLayout = layouts.find((l) => Number(l.floor) === floor);
    const selected = doorList.find((d) => d.id === selectedId) || null;
    const meta = selected ? STATUS_META[selected.status] || STATUS_META.locked : null;

    useEffect(() => {
        api.get('/layouts')
            .then((r) => setLayouts(r.data || []))
            .catch(() => setLayouts([]));
    }, []);

    useEffect(() => {
        if (!selected) return;
        setEditName(selected.name || '');
        setEditZone(selected.zone || '');
    }, [selected]);

    const uploadLayout = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const { data } = await api.post(`/upload/layout/${floor}`, fd);
            setLayouts((prev) => {
                const rest = prev.filter((l) => Number(l.floor) !== floor);
                return [...rest, data].sort((a, b) => a.floor - b.floor);
            });
            toast.success(`FLOOR ${floor} LAYOUT UPLOADED`);
        } catch (err) {
            toast.error('LAYOUT UPLOAD FAILED', { description: err?.response?.data?.detail || 'Could not upload layout' });
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDoorDrop = async (doorId, pos) => {
        try {
            const door = await placeDoor(doorId, { floor, x: pos.x, y: pos.y });
            setSelectedId(door.id);
            toast.success('DOOR PLACED', { description: `${door.code} · Floor ${floor}` });
        } catch (err) {
            toast.error('COULD NOT PLACE DOOR', { description: err?.response?.data?.detail || 'Try again' });
        }
    };

    const unplaceDoor = async () => {
        if (!selected) return;
        try {
            await placeDoor(selected.id, { floor: null, x: null, y: null });
            toast.success('DOOR RETURNED TO UNPLACED LIST', { description: selected.name });
            setSelectedId(null);
        } catch (err) {
            toast.error('COULD NOT UNPLACE DOOR');
        }
    };

    const saveEdit = async () => {
        if (!selected) return;
        setSavingEdit(true);
        try {
            await updateDoor(selected.id, {
                name: editName.trim(),
                zone: editZone.trim().toUpperCase() || 'GENERAL',
            });
            toast.success('DOOR UPDATED');
        } catch {
            toast.error('UPDATE FAILED');
        } finally {
            setSavingEdit(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="floormap-page">
            <PageHeader eyebrow="BUILDING LAYOUT // KERMA GAMES MONTERREY" title="Floor Map & Doors">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex rounded-full border border-sky-500/20 bg-[#09101d] p-1">
                        {[1, 2, 3].map((n) => (
                            <button
                                key={n}
                                onClick={() => { setFloor(n); setSelectedId(null); }}
                                className={`rounded-full px-4 py-2 mono text-[10px] tracking-widest transition-colors ${
                                    floor === n ? 'bg-sky-500 text-[#04121f]' : 'text-slate-500 hover:text-slate-200'
                                }`}
                            >
                                FLOOR {n}
                            </button>
                        ))}
                    </div>
                    <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={uploadLayout} />
                    <button
                        onClick={() => uploadRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 rounded-full border border-sky-500/40 px-5 py-2.5 font-head text-xs font-bold tracking-widest text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
                    >
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {currentLayout?.path ? 'REPLACE LAYOUT' : 'UPLOAD LAYOUT'}
                    </button>
                    <button
                        onClick={() => setEditMode((v) => !v)}
                        className={`flex items-center gap-2 rounded-full border px-5 py-2.5 font-head text-xs font-bold tracking-widest ${
                            editMode ? 'border-[#ea7f2b]/50 bg-[#ea7f2b]/10 text-gold' : 'border-white/10 text-slate-400'
                        }`}
                    >
                        <Pencil size={14} />
                        {editMode ? 'PLACEMENT MODE ON' : 'PLACEMENT MODE OFF'}
                    </button>
                </div>
            </PageHeader>

            <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="aegis-panel rounded-2xl p-4 sm:p-6"
                >
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="mono text-[10px] tracking-[0.28em] text-sky-400">FLOOR {floor}</p>
                            <p className="mt-1 text-xs text-slate-500">
                                {currentLayout?.filename || 'No layout uploaded yet'}
                            </p>
                        </div>
                        <p className="mono text-[9px] tracking-widest text-slate-600">
                            {placedOnFloor.length} PLACED · {unplaced.length} UNPLACED
                        </p>
                    </div>

                    <FloorPlan
                        doors={placedOnFloor}
                        selectedId={selectedId}
                        onSelect={(d) => setSelectedId(d.id)}
                        editable={editMode}
                        onDoorDrop={handleDoorDrop}
                        floor={floor}
                        layoutUrl={currentLayout?.path ? fileUrl(currentLayout.path) : null}
                        layoutType={currentLayout?.content_type}
                    />

                    {editMode && (
                        <p className="mt-3 mono text-[9px] tracking-[0.18em] text-slate-600">
                            DRAG A DOOR FROM THE RIGHT PANEL ONTO THIS FLOOR. YOU CAN ALSO DRAG AN EXISTING DOOR TO REPOSITION IT.
                        </p>
                    )}
                </motion.div>

                <div className="space-y-5">
                    {selected ? (
                        <div className="aegis-panel rounded-xl p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="mono text-[10px] tracking-widest text-sky-400">{selected.code}</p>
                                    <h3 className="mt-1 font-head text-lg font-bold text-slate-100">{selected.name}</h3>
                                </div>
                                <span className={`mono rounded border px-2.5 py-1 text-[9px] tracking-widest ${meta.cls}`}>{meta.label}</span>
                            </div>

                            <div className="mt-4 grid gap-3">
                                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-sky-400/60" />
                                <input value={editZone} onChange={(e) => setEditZone(e.target.value)}
                                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-sky-400/60" />
                                <button onClick={saveEdit} disabled={savingEdit}
                                    className="flex items-center justify-center gap-2 rounded-full bg-sky-500 py-2.5 font-head text-xs font-bold tracking-widest text-[#04121f] disabled:opacity-40">
                                    {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} SAVE
                                </button>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => openDoor(selected.id)}
                                    disabled={!selected.gatewayDeviceId}
                                    className="flex items-center justify-center gap-2 rounded-full bg-sky-500 py-2.5 font-head text-xs font-bold text-[#04121f] disabled:opacity-30"
                                >
                                    <LockOpen size={14} /> OPEN
                                </button>
                                <button
                                    onClick={() => closeDoor(selected.id)}
                                    disabled={!selected.gatewayDeviceId}
                                    className="flex items-center justify-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 py-2.5 font-head text-xs font-bold text-emerald-200 disabled:opacity-30"
                                >
                                    <Lock size={14} /> CLOSE
                                </button>
                            </div>

                            {selected.status === 'alarm' && (
                                <button onClick={() => silenceDoor(selected.id)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-xs font-bold text-white">
                                    <BellOff size={14} /> SILENCE ALARM
                                </button>
                            )}

                            {selected.floor != null && (
                                <button onClick={unplaceDoor} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 py-2.5 mono text-[10px] tracking-widest text-slate-400 hover:text-orange-300">
                                    <Undo2 size={13} /> RETURN TO UNPLACED
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="aegis-panel rounded-xl p-5 text-center">
                            <ShieldAlert size={22} className="mx-auto text-sky-500/50" />
                            <p className="mt-3 mono text-[10px] tracking-widest text-slate-600">SELECT A PLACED DOOR TO VIEW CONTROLS</p>
                        </div>
                    )}

                    <div className="aegis-panel rounded-xl p-4">
                        <div className="flex items-center justify-between px-1 pb-3">
                            <p className="mono text-[10px] tracking-[0.22em] text-slate-400">UNPLACED DOORS</p>
                            <span className="mono text-[10px] text-slate-600">{unplaced.length}</span>
                        </div>
                        <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                            {unplaced.map((d) => (
                                <button
                                    key={d.id}
                                    draggable={editMode}
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/kerma-door-id', d.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onClick={() => setSelectedId(d.id)}
                                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                        selectedId === d.id ? 'border-sky-500/30 bg-sky-500/10' : 'border-transparent hover:bg-white/[0.04]'
                                    }`}
                                >
                                    <span className={`h-2 w-2 rounded-full ${(STATUS_META[d.status] || STATUS_META.locked).dot}`} />
                                    <span className="mono w-10 text-[10px] text-slate-600">{d.code}</span>
                                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{d.name}</span>
                                    <span className="mono text-[8px] tracking-wider text-slate-600">{d.gatewayDeviceId ? 'HW' : 'VIRTUAL'}</span>
                                </button>
                            ))}
                            {unplaced.length === 0 && (
                                <p className="py-8 text-center mono text-[9px] tracking-widest text-slate-600">ALL DOORS HAVE BEEN PLACED</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
