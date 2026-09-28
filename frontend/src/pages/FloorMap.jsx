import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LockOpen, BellOff, Loader2, ShieldAlert, Pencil, Plus, X, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { FloorPlan } from '../components/FloorPlan';
import { useSecurity } from '../context/SecurityContext';

const STATUS_META = {
    locked: { label: 'LOCKED', cls: 'text-sky-300 border-sky-400/30 bg-sky-400/10', dot: 'bg-sky-400' },
    unlocked: { label: 'UNLOCKED', cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10', dot: 'bg-emerald-400' },
    opening: { label: 'RELEASING', cls: 'text-orange-300 border-orange-400/30 bg-orange-400/10', dot: 'bg-orange-400' },
    alarm: { label: 'TAMPER ALARM', cls: 'text-red-300 border-red-400/30 bg-red-400/10', dot: 'bg-red-500' },
};

function AddDoorModal({ pos, onClose }) {
    const { addDoor } = useSecurity();
    const [name, setName] = useState('');
    const [zone, setZone] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const door = await addDoor({ name: name.trim(), zone: zone.trim().toUpperCase() || 'GENERAL', x: pos.x, y: pos.y });
            toast.success('DOOR PLACED', { description: `${door.code} · ${door.name}` });
            setName(''); setZone('');
            onClose(door);
        } catch (err) {
            toast.error('COULD NOT PLACE DOOR', { description: 'Try again' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => onClose(null)} />
            <motion.div
                data-testid="add-door-modal"
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full max-w-md rounded-2xl border border-[#ea7f2b]/40 bg-[#0b1220] p-6 sm:p-8"
            >
                <div className="flex items-start justify-between">
                    <div>
                        <p className="mono text-[10px] tracking-[0.35em] text-gold">NEW DOOR · X {pos.x}% · Y {pos.y}%</p>
                        <h2 className="font-display text-xl font-bold text-white mt-2">Place Door</h2>
                    </div>
                    <button data-testid="add-door-close-btn" onClick={() => onClose(null)} className="rounded-full border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors duration-200">
                        <X size={15} />
                    </button>
                </div>
                <form onSubmit={submit} className="mt-6 space-y-4">
                    <div>
                        <label className="mono text-[10px] tracking-widest text-slate-500">DOOR NAME</label>
                        <input data-testid="door-name-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Entrada Principal"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                    </div>
                    <div>
                        <label className="mono text-[10px] tracking-widest text-slate-500">ZONE</label>
                        <input data-testid="door-zone-input" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="e.g. LOBBY"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                    </div>
                    <button data-testid="add-door-submit-btn" type="submit" disabled={saving}
                        className={`flex w-full items-center justify-center gap-2 rounded-full py-3 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                            saving ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-[#fee396] to-[#ea7f2b] text-[#2b1608] hover:opacity-90'
                        }`}>
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                        {saving ? 'PLACING…' : 'PLACE DOOR'}
                    </button>
                </form>
            </motion.div>
        </motion.div>
    );
}

export default function FloorMap() {
    const { doors, openDoor, silenceDoor, cameras, updateDoor, deleteDoor } = useSecurity();
    const doorList = doors || [];
    const [selectedId, setSelectedId] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [newDoorPos, setNewDoorPos] = useState(null);
    const [editName, setEditName] = useState('');
    const [editZone, setEditZone] = useState('');
    const [deleteArmed, setDeleteArmed] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);

    const selected = doorList.find((d) => d.id === selectedId) || null;
    const cam = selected && selected.camId ? (cameras || []).find((c) => c.id === selected.camId) : null;
    const meta = selected ? STATUS_META[selected.status] || STATUS_META.locked : null;

    const selectDoor = (d) => {
        setSelectedId(d.id);
        setEditName(d.name);
        setEditZone(d.zone);
        setDeleteArmed(false);
    };

    const saveEdit = async () => {
        setSavingEdit(true);
        try {
            await updateDoor(selected.id, { name: editName.trim(), zone: editZone.trim().toUpperCase() || 'GENERAL' });
            toast.success('DOOR UPDATED', { description: `${selected.code} · ${editName}` });
        } catch (e) {
            toast.error('UPDATE FAILED', { description: 'Try again' });
        } finally {
            setSavingEdit(false);
        }
    };

    const removeDoor = async () => {
        try {
            await deleteDoor(selected.id);
            toast.success('DOOR REMOVED', { description: `${selected.code} · ${selected.name}` });
            setSelectedId(null);
            setDeleteArmed(false);
        } catch (e) {
            toast.error('DELETE FAILED', { description: 'Try again' });
        }
    };

    return (
        <div className="space-y-6" data-testid="floormap-page">
            <PageHeader eyebrow="BUILDING LAYOUT // HQ NORTH TOWER" title="Floor Map & Doors">
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-4 mono text-[10px] tracking-widest text-slate-500">
                        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> LOCKED</span>
                        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> OPEN</span>
                        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> ALARM</span>
                    </div>
                    <button
                        data-testid="edit-layout-toggle"
                        onClick={() => setEditMode(!editMode)}
                        className={`flex items-center gap-2 rounded-full border px-5 py-2.5 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                            editMode
                                ? 'border-[#ea7f2b]/60 bg-[#ea7f2b]/15 text-gold'
                                : 'border-sky-500/40 text-sky-300 hover:bg-sky-500/10'
                        }`}
                    >
                        <Pencil size={14} />
                        {editMode ? 'DONE EDITING' : 'EDIT LAYOUT'}
                    </button>
                </div>
            </PageHeader>

            {editMode && (
                <motion.p
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mono text-[10px] tracking-[0.3em] text-gold border border-[#ea7f2b]/30 bg-[#ea7f2b]/5 rounded-lg px-4 py-3"
                    data-testid="edit-mode-banner"
                >
                    EDIT MODE · CLICK ANYWHERE ON THE PLAN TO PLACE A DOOR · SELECT A DOOR TO RENAME OR DELETE IT
                </motion.p>
            )}

            <div className="grid lg:grid-cols-[1fr_360px] gap-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className={`aegis-panel corner-frame rounded-2xl bg-grid p-4 sm:p-8 ${editMode ? 'border-[#ea7f2b]/40' : ''}`}
                >
                    <FloorPlan
                        doors={doorList}
                        selectedId={selectedId}
                        onSelect={selectDoor}
                        editable={editMode}
                        onPlanClick={(pos) => setNewDoorPos(pos)}
                    />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-5"
                >
                    {doorList.length === 0 ? (
                        <div className="aegis-panel rounded-xl p-8 text-center" data-testid="no-doors-panel">
                            <ShieldAlert size={26} className="text-sky-500/60 mx-auto" />
                            <p className="font-head font-bold text-slate-200 tracking-wide mt-4">NO DOORS PLACED YET</p>
                            <p className="text-xs text-slate-500 mt-2">Enable EDIT LAYOUT and click on the plan to place the real doors of your building.</p>
                            <button
                                data-testid="no-doors-edit-btn"
                                onClick={() => setEditMode(true)}
                                className="mt-5 rounded-full bg-gradient-to-r from-[#fee396] to-[#ea7f2b] px-6 py-2.5 font-head font-bold tracking-widest text-xs text-[#2b1608] hover:opacity-90 transition-opacity duration-200"
                            >
                                START PLACING DOORS
                            </button>
                        </div>
                    ) : !selected ? (
                        <div className="aegis-panel rounded-xl p-8 text-center">
                            <p className="mono text-[10px] tracking-[0.25em] text-slate-500">SELECT A DOOR ON THE PLAN OR FROM THE LIST</p>
                        </div>
                    ) : (
                        <div className="aegis-panel aegis-panel-glow rounded-xl p-6" data-testid="door-detail-panel">
                            <div className="flex items-center justify-between">
                                <p className="mono text-xs tracking-[0.3em] text-sky-400">{selected.code}</p>
                                <span className={`mono text-[10px] tracking-widest px-2.5 py-1 rounded border ${meta.cls}`}>{meta.label}</span>
                            </div>

                            {editMode ? (
                                <div className="mt-4 space-y-4">
                                    <div>
                                        <label className="mono text-[10px] tracking-widest text-slate-500">NAME</label>
                                        <input data-testid="edit-door-name-input" value={editName} onChange={(e) => setEditName(e.target.value)}
                                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                                    </div>
                                    <div>
                                        <label className="mono text-[10px] tracking-widest text-slate-500">ZONE</label>
                                        <input data-testid="edit-door-zone-input" value={editZone} onChange={(e) => setEditZone(e.target.value)}
                                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                                    </div>
                                    <button data-testid="save-door-btn" onClick={saveEdit} disabled={savingEdit || !editName.trim()}
                                        className={`flex w-full items-center justify-center gap-2 rounded-full py-3 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                                            savingEdit || !editName.trim() ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-sky-500 text-[#04121f] hover:bg-cyan-400'
                                        }`}>
                                        {savingEdit ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                        SAVE CHANGES
                                    </button>
                                    <button
                                        data-testid="delete-door-btn"
                                        onClick={() => (deleteArmed ? removeDoor() : setDeleteArmed(true))}
                                        className={`flex w-full items-center justify-center gap-2 rounded-full border py-3 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                                            deleteArmed ? 'border-red-500/70 bg-red-500/15 text-red-300' : 'border-white/10 text-slate-400 hover:text-red-300 hover:border-red-400/40'
                                        }`}
                                    >
                                        <Trash2 size={15} />
                                        {deleteArmed ? 'CONFIRM DELETE' : 'DELETE DOOR'}
                                    </button>
                                </div>
                            ) : (
                                <>
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
                                </>
                            )}
                        </div>
                    )}

                    {doorList.length > 0 && (
                        <div className="aegis-panel rounded-xl p-4">
                            <p className="mono text-[10px] tracking-[0.25em] text-slate-500 px-2 pb-3">ALL DOORS · {doorList.length}</p>
                            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                                {doorList.map((d) => (
                                    <button
                                        key={d.id}
                                        data-testid={`door-list-${(d.code || d.id).toLowerCase()}`}
                                        onClick={() => selectDoor(d)}
                                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-200 ${
                                            d.id === selectedId ? 'bg-sky-500/10 border border-sky-500/25' : 'border border-transparent hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${(STATUS_META[d.status] || STATUS_META.locked).dot} ${d.status === 'alarm' ? 'alarm-flash' : ''}`} />
                                        <span className="mono text-[10px] text-slate-500 w-10">{d.code}</span>
                                        <span className="text-sm text-slate-200 flex-1 truncate">{d.name}</span>
                                        {d.status === 'alarm' && <ShieldAlert size={13} className="text-red-400 shrink-0" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>

            <AnimatePresence>
                {newDoorPos && (
                    <AddDoorModal
                        pos={newDoorPos}
                        onClose={(door) => {
                            setNewDoorPos(null);
                            if (door) selectDoor(door);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
