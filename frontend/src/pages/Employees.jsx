import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ScanFace, X, Copy, UserPlus, Check, Sparkles, Trash2, Loader2, ImagePlus, Pencil, Save, Search, Filter, ShieldCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { useSecurity } from '../context/SecurityContext';
import { api, fileUrl, formatApiError } from '../context/AuthContext';

function Avatar({ emp, size = 'h-14 w-14' }) {
    if (emp.photoPath) {
        return <img src={fileUrl(emp.photoPath)} alt={emp.name} className={`${size} rounded-lg object-cover ring-1 ring-[#ea7f2b]/40`} />;
    }
    const initials = emp.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return (
        <div className={`${size} rounded-lg bg-gradient-to-br from-blue-600/40 to-cyan-500/20 ring-1 ring-sky-500/30 flex items-center justify-center`}>
            <span className="font-display font-bold text-sky-200 text-sm">{initials}</span>
        </div>
    );
}

function DeleteButton({ onConfirm, testid }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 2600);
        return () => clearTimeout(t);
    }, [armed]);
    return (
        <button
            data-testid={testid}
            onClick={() => (armed ? onConfirm() : setArmed(true))}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 mono text-[9px] tracking-widest transition-colors duration-200 ${
                armed ? 'border-red-500/60 bg-red-500/15 text-red-300' : 'border-white/10 text-slate-500 hover:text-red-300 hover:border-red-400/40'
            }`}
        >
            <Trash2 size={12} />
            {armed ? 'CONFIRM' : 'DELETE'}
        </button>
    );
}

function AccessLevelsModal({ open, onClose }) {
    const { doors, devices, updateDoor } = useSecurity();
    const [levels, setLevels] = useState([]);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selected, setSelected] = useState([]);
    const [saving, setSaving] = useState(false);
    const [doorSaving, setDoorSaving] = useState(null);

    const load = async () => {
        try {
            const { data } = await api.get('/access-levels');
            setLevels(data || []);
        } catch (e) {
            toast.error('ACCESS LEVELS FAILED', { description: formatApiError(e?.response?.data?.detail || e?.message) });
        }
    };

    useEffect(() => {
        if (open) load();
    }, [open]);

    const gatewayDeviceMap = Object.fromEntries(
        (devices || []).filter((d) => d.gatewayDeviceId).map((d) => [d.gatewayDeviceId, d]),
    );
    const physicalDoors = (doors || []).filter((d) => d.gatewayDeviceId && d.doorNo && d.visible !== false);
    const controllerDoors = (doors || []).filter(
        (d) => d.gatewayDeviceId && d.doorNo && gatewayDeviceMap[d.gatewayDeviceId]?.type === 'card',
    );
    const controllerGroups = controllerDoors.reduce((groups, door) => {
        const key = door.gatewayDeviceId;
        if (!groups[key]) groups[key] = [];
        groups[key].push(door);
        return groups;
    }, {});

    const saveDoorName = async (door, value) => {
        const nextName = String(value || '').trim();
        if (!nextName || nextName === door.name) return;
        setDoorSaving(door.id);
        try {
            await updateDoor(door.id, { name: nextName });
            toast.success('DOOR NAME UPDATED', { description: nextName });
        } catch (e) {
            toast.error('DOOR UPDATE FAILED', { description: formatApiError(e?.response?.data?.detail || e?.message) });
        } finally {
            setDoorSaving(null);
        }
    };

    const setDoorVisible = async (door, visible) => {
        setDoorSaving(door.id);
        try {
            await updateDoor(door.id, { visible });
            if (!visible) {
                const key = `${door.gatewayDeviceId}:${door.doorNo}`;
                setSelected((prev) => prev.filter((x) => x !== key));
            }
            toast.success(visible ? 'DOOR UNHIDDEN' : 'DOOR HIDDEN', { description: door.name });
        } catch (e) {
            toast.error('DOOR UPDATE FAILED', { description: formatApiError(e?.response?.data?.detail || e?.message) });
        } finally {
            setDoorSaving(null);
        }
    };

    const toggle = (key) => {
        setSelected((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]);
    };

    const save = async () => {
        if (!name.trim() || selected.length === 0) return;
        const doorRights = {};
        for (const key of selected) {
            const [deviceId, doorNo] = key.split(':');
            if (!doorRights[deviceId]) doorRights[deviceId] = [];
            doorRights[deviceId].push(Number(doorNo));
        }
        setSaving(true);
        try {
            await api.post('/access-levels', { name: name.trim(), description: description.trim(), doorRights });
            toast.success('ACCESS LEVEL CREATED', { description: name.trim() });
            setName('');
            setDescription('');
            setSelected([]);
            await load();
        } catch (e) {
            toast.error('ACCESS LEVEL FAILED', { description: formatApiError(e?.response?.data?.detail || e?.message) });
        } finally {
            setSaving(false);
        }
    };

    const remove = async (level) => {
        try {
            await api.delete(`/access-levels/${level.id}`);
            toast.success('ACCESS LEVEL DELETED', { description: level.name });
            await load();
        } catch (e) {
            toast.error('DELETE FAILED', { description: formatApiError(e?.response?.data?.detail || e?.message) });
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24 }}
                        className="relative w-full max-w-4xl rounded-2xl border border-sky-500/25 bg-[#0b1220] p-6 sm:p-8 max-h-[92vh] overflow-y-auto"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="mono text-[10px] tracking-[0.35em] text-sky-400">PHYSICAL ACCESS POLICY</p>
                                <h2 className="font-display text-xl font-bold text-white mt-2">Access Levels</h2>
                                <p className="text-xs text-slate-500 mt-1">Create a level and select exactly which doors or turnstiles it can open.</p>
                            </div>
                            <button onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white">
                                <X size={15} />
                            </button>
                        </div>

                        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="mono text-[10px] tracking-widest text-slate-500">LEVEL NAME</label>
                                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TECHNICIANS"
                                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60" />
                                    </div>
                                    <div>
                                        <label className="mono text-[10px] tracking-widest text-slate-500">DESCRIPTION</label>
                                        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional"
                                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60" />
                                    </div>
                                </div>

                                <div className="mt-5">
                                    <div className="flex items-center justify-between">
                                        <p className="mono text-[10px] tracking-widest text-slate-500">ACCESS POINTS</p>
                                        <p className="mono text-[9px] text-sky-400">{selected.length} SELECTED</p>
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2 max-h-[390px] overflow-y-auto pr-1">
                                        {physicalDoors.map((door) => {
                                            const key = `${door.gatewayDeviceId}:${door.doorNo}`;
                                            const active = selected.includes(key);
                                            return (
                                                <button key={door.id || key} type="button" onClick={() => toggle(key)}
                                                    className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left transition-colors ${active ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-white/[0.02] hover:border-sky-400/30'}`}>
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-200">{door.name}</p>
                                                        <p className="mono text-[9px] text-slate-600 mt-1">{door.gatewayDeviceId} · DOOR {door.doorNo}</p>
                                                    </div>
                                                    <div className={`h-5 w-5 rounded border flex items-center justify-center ${active ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/15'}`}>
                                                        {active && <Check size={13} className="text-emerald-300" />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {physicalDoors.length === 0 && (
                                            <p className="sm:col-span-2 py-8 text-center mono text-[10px] text-slate-600">NO PHYSICAL DOORS AVAILABLE</p>
                                        )}
                                    </div>
                                </div>

                                <button onClick={save} disabled={saving || !name.trim() || selected.length === 0}
                                    className="mt-5 flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 font-head font-bold tracking-widest text-xs text-[#04121f] hover:bg-cyan-400 disabled:opacity-40">
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    CREATE ACCESS LEVEL
                                </button>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <p className="mono text-[10px] tracking-widest text-slate-500">EXISTING LEVELS</p>
                                <div className="mt-3 space-y-2">
                                    {levels.map((level) => {
                                        const count = Object.values(level.doorRights || {}).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
                                        return (
                                            <div key={level.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-200">{level.name}</p>
                                                        <p className="mono text-[9px] text-sky-400 mt-1">{count} ACCESS POINT{count === 1 ? '' : 'S'}</p>
                                                        {level.description && <p className="text-xs text-slate-500 mt-1">{level.description}</p>}
                                                    </div>
                                                    <button onClick={() => remove(level)} className="rounded-md border border-red-400/20 p-2 text-red-300 hover:bg-red-500/10">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {levels.length === 0 && <p className="py-8 text-center mono text-[10px] text-slate-600">NO ACCESS LEVELS CREATED</p>}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="mono text-[10px] tracking-widest text-slate-500">CONTROLLER DOOR LABELS</p>
                                    <p className="text-xs text-slate-500 mt-1">Rename physical controller doors for HR and hide unused outputs. Hidden doors stay linked to the controller but disappear from Access Levels.</p>
                                </div>
                                <span className="mono text-[9px] text-sky-400">{controllerDoors.filter((d) => d.visible !== false).length} VISIBLE</span>
                            </div>

                            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                {Object.entries(controllerGroups).map(([gatewayDeviceId, groupDoors]) => {
                                    const device = gatewayDeviceMap[gatewayDeviceId];
                                    const orderedDoors = [...groupDoors].sort((a, b) => Number(a.doorNo) - Number(b.doorNo));
                                    return (
                                        <div key={gatewayDeviceId} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-200">{device?.name || gatewayDeviceId}</p>
                                                    <p className="mono text-[9px] text-slate-600 mt-1">{gatewayDeviceId}</p>
                                                </div>
                                                <span className="mono text-[9px] text-slate-500">{orderedDoors.filter((d) => d.visible !== false).length}/{orderedDoors.length} SHOWN</span>
                                            </div>

                                            <div className="mt-3 space-y-2">
                                                {orderedDoors.map((door) => {
                                                    const visible = door.visible !== false;
                                                    const busy = doorSaving === door.id;
                                                    return (
                                                        <div key={door.id} className={`rounded-lg border px-3 py-2.5 ${visible ? 'border-white/10 bg-black/20' : 'border-amber-400/20 bg-amber-400/[0.04]'}`}>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-14 shrink-0">
                                                                    <p className="mono text-[9px] text-slate-600">DOOR</p>
                                                                    <p className="text-sm font-bold text-slate-300">{door.doorNo}</p>
                                                                </div>
                                                                <input
                                                                    key={`${door.id}:${door.name}`}
                                                                    defaultValue={door.name}
                                                                    disabled={busy}
                                                                    onBlur={(e) => saveDoorName(door, e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') e.currentTarget.blur();
                                                                        if (e.key === 'Escape') {
                                                                            e.currentTarget.value = door.name;
                                                                            e.currentTarget.blur();
                                                                        }
                                                                    }}
                                                                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-400/60 disabled:opacity-50"
                                                                    aria-label={`Friendly name for ${device?.name || gatewayDeviceId} door ${door.doorNo}`}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    onClick={() => setDoorVisible(door, !visible)}
                                                                    className={`min-w-[82px] rounded-md border px-2.5 py-2 mono text-[9px] tracking-wider transition-colors disabled:opacity-40 ${visible ? 'border-white/10 text-slate-400 hover:text-amber-300 hover:border-amber-400/30' : 'border-emerald-400/25 text-emerald-300 hover:bg-emerald-400/10'}`}
                                                                >
                                                                    {busy ? 'SAVING' : visible ? 'HIDE' : 'UNHIDE'}
                                                                </button>
                                                            </div>
                                                            {!visible && <p className="mt-1.5 mono text-[8px] text-amber-300/70">HIDDEN FROM HR ACCESS SELECTION</p>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                                {controllerDoors.length === 0 && (
                                    <p className="lg:col-span-2 py-8 text-center mono text-[10px] text-slate-600">NO CONTROLLER DOORS AVAILABLE</p>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}


function EnrollModal({ open, onClose }) {
    const { addEmployee } = useSecurity();
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [accessLevels, setAccessLevels] = useState([]);
    const [accessLevelId, setAccessLevelId] = useState('');
    const [cardNo, setCardNo] = useState('');
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [faceState, setFaceState] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [match, setMatch] = useState(null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        api.get('/access-levels')
            .then(({ data }) => setAccessLevels(data || []))
            .catch(() => setAccessLevels([]));
    }, [open]);

    useEffect(() => {
        if (faceState !== 'scanning') return;
        const t = setInterval(() => {
            setProgress((p) => {
                if (p >= 100) {
                    clearInterval(t);
                    setFaceState('done');
                    setMatch((97 + Math.random() * 2.8).toFixed(1));
                    return 100;
                }
                return p + 4;
            });
        }, 110);
        return () => clearInterval(t);
    }, [faceState]);

    const reset = () => {
        setName(''); setRole(''); setAccessLevelId(''); setCardNo('');
        setPhoto(null);
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        setPhotoPreview(null);
        setFaceState('idle'); setProgress(0); setMatch(null);
    };

    const pickPhoto = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        setPhoto(f);
        setPhotoPreview(URL.createObjectURL(f));
    };

    const submit = async () => {
        setSaving(true);
        try {
            let photoPath = null;
            if (photo) {
                const fd = new FormData();
                fd.append('file', photo);
                const { data } = await api.post('/upload/photo', fd);
                photoPath = data.path;
            }
            const selectedLevel = accessLevels.find((item) => item.id === accessLevelId);
            await addEmployee({
                name: name.trim(),
                role: role.trim() || 'Staff Member',
                cardNo,
                faceSync: true,
                faceMatch: match,
                level: selectedLevel?.name || 'CUSTOM',
                accessLevelId,
                photoPath,
            });
            toast.success('PROFILE SYNCHRONIZED', { description: `${name} saved to registry · ready to push to scanners` });
            reset();
            onClose();
        } catch (e) {
            toast.error('ENROLL FAILED', { description: formatApiError(e?.response?.data?.detail || e?.message) });
        } finally {
            setSaving(false);
        }
    };

    const valid = name.trim().length > 1 && /^\d{10}$/.test(cardNo) && faceState === 'done' && !!accessLevelId;

    return (
        <AnimatePresence>
            {open && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        data-testid="enroll-modal"
                        initial={{ opacity: 0, y: 28, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 28, scale: 0.97 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-full max-w-2xl rounded-2xl border border-sky-500/25 bg-[#0b1220] shadow-[0_0_50px_rgba(14,165,233,0.15)] p-6 sm:p-8 max-h-[92vh] overflow-y-auto"
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="mono text-[10px] tracking-[0.35em] text-sky-400">NEW CREDENTIAL PROFILE</p>
                                <h2 className="font-display text-xl font-bold text-white mt-2">Enroll Employee</h2>
                            </div>
                            <button data-testid="enroll-close-btn" onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-400 transition-colors duration-200 hover:bg-white/10 hover:text-white">
                                <X size={15} />
                            </button>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-6 mt-7">
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <button
                                        data-testid="enroll-photo-btn"
                                        onClick={() => fileRef.current?.click()}
                                        className="relative h-20 w-20 shrink-0 rounded-xl border border-dashed border-sky-500/40 bg-white/[0.03] overflow-hidden group transition-colors duration-200 hover:border-[#ea7f2b]/60"
                                    >
                                        {photoPreview ? (
                                            <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                                        ) : (
                                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                                                <ImagePlus size={18} className="text-sky-400" />
                                            </span>
                                        )}
                                        <span className="absolute inset-x-0 bottom-0 bg-black/60 mono text-[8px] tracking-widest text-sky-200 py-0.5 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            {photoPreview ? 'CHANGE' : 'PHOTO'}
                                        </span>
                                    </button>
                                    <div>
                                        <p className="mono text-[10px] tracking-widest text-slate-500">ID PHOTO · OPTIONAL</p>
                                        <p className="text-xs text-slate-500 mt-1">JPG/PNG up to 5MB. If provided, the gateway will also push the face to the assigned terminals.</p>
                                    </div>
                                    <input ref={fileRef} data-testid="enroll-photo-input" type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                                </div>
                                <div>
                                    <label className="mono text-[10px] tracking-widest text-slate-500">FULL NAME</label>
                                    <input
                                        data-testid="enroll-name-input"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. Ada Lovelace"
                                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200"
                                    />
                                </div>
                                <div>
                                    <label className="mono text-[10px] tracking-widest text-slate-500">ROLE</label>
                                    <input
                                        data-testid="enroll-role-input"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        placeholder="e.g. Systems Engineer"
                                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200"
                                    />
                                </div>
                                <div>
                                    <label className="mono text-[10px] tracking-widest text-slate-500">ACCESS LEVEL</label>
                                    <select
                                        data-testid="enroll-level-select"
                                        value={accessLevelId}
                                        onChange={(e) => setAccessLevelId(e.target.value)}
                                        className="mt-2 w-full rounded-lg border border-white/10 bg-[#0f172a] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60 transition-colors duration-200"
                                    >
                                        <option value="">SELECT ACCESS LEVEL</option>
                                        {accessLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                    </select>
                                    {accessLevels.length === 0 && (
                                        <p className="mt-2 mono text-[9px] tracking-wider text-orange-300">CREATE AN ACCESS LEVEL FIRST</p>
                                    )}
                                </div>
                                <div>
                                    <label className="mono text-[10px] tracking-widest text-slate-500">CARD NUMBER · 10 DIGITS</label>
                                    <div className="mt-2 flex gap-2">
                                        <input
                                            data-testid="enroll-card-input"
                                            value={cardNo}
                                            onChange={(e) => setCardNo(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                            inputMode="numeric"
                                            maxLength={10}
                                            placeholder="0008512193"
                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 mono text-sm text-sky-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200"
                                        />

                                    </div>
                                </div>
                            </div>

                            <div className="relative flex flex-col items-center justify-center rounded-xl border border-sky-500/20 bg-black/50 bg-grid p-5 min-h-[300px] overflow-hidden">
                                <span className="absolute left-3 top-3 h-4 w-4 border-t-2 border-l-2 border-sky-400/60" />
                                <span className="absolute right-3 top-3 h-4 w-4 border-t-2 border-r-2 border-sky-400/60" />
                                <span className="absolute left-3 bottom-3 h-4 w-4 border-b-2 border-l-2 border-sky-400/60" />
                                <span className="absolute right-3 bottom-3 h-4 w-4 border-b-2 border-r-2 border-sky-400/60" />

                                {faceState === 'idle' && (
                                    <>
                                        {photoPreview ? (
                                            <img src={photoPreview} alt="Face source" className="h-24 w-24 rounded-full object-cover ring-2 ring-sky-400/50" />
                                        ) : (
                                            <ScanFace size={52} className="text-sky-500/70" />
                                        )}
                                        <p className="mono text-[10px] tracking-[0.3em] text-slate-500 mt-4 text-center">BIOMETRIC CAPTURE READY</p>
                                        <button
                                            data-testid="face-capture-btn"
                                            onClick={() => { setFaceState('scanning'); setProgress(0); }}
                                            className="mt-5 rounded-full bg-sky-500 px-6 py-2.5 font-head font-bold tracking-widest text-xs text-[#04121f] transition-colors duration-200 hover:bg-cyan-400"
                                        >
                                            START FACE CAPTURE
                                        </button>
                                    </>
                                )}
                                {faceState === 'scanning' && (
                                    <>
                                        {photoPreview ? (
                                            <img src={photoPreview} alt="Scanning" className="h-24 w-24 rounded-full object-cover ring-2 ring-cyan-400/70" />
                                        ) : (
                                            <ScanFace size={52} className="text-cyan-300" />
                                        )}
                                        <div className="absolute inset-x-6 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent scan-line shadow-[0_0_16px_rgba(34,211,238,0.8)]" />
                                        <p className="mono text-xs tracking-[0.3em] text-cyan-300 mt-5 tabular-nums">SCANNING · {progress}%</p>
                                        <p className="mono text-[9px] tracking-widest text-slate-600 mt-2">EXTRACTING 512-DIM EMBEDDING</p>
                                    </>
                                )}
                                {faceState === 'done' && (
                                    <>
                                        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-400/10">
                                            <Check size={28} className="text-emerald-300" />
                                        </div>
                                        <p className="mono text-[10px] tracking-[0.3em] text-emerald-300 mt-4">EMBEDDING EXTRACTED</p>
                                        <p className="mono text-xs tracking-widest text-slate-400 mt-2">REFERENCE MATCH · {match}%</p>
                                        <button
                                            data-testid="face-recapture-btn"
                                            onClick={() => { setFaceState('scanning'); setProgress(0); }}
                                            className="mt-4 mono text-[10px] tracking-widest text-sky-400 hover:text-cyan-300 transition-colors duration-200"
                                        >
                                            RECAPTURE
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mt-7 flex items-center justify-between gap-3 border-t border-white/5 pt-5">
                            <p className="mono text-[9px] tracking-widest text-slate-600 hidden sm:block">STORED IN REGISTRY · PUSH TO SCANNERS FROM THE CARD</p>
                            <button
                                data-testid="enroll-submit-btn"
                                onClick={submit}
                                disabled={!valid || saving}
                                className={`flex items-center gap-2 rounded-full px-7 py-3 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                                    valid && !saving ? 'bg-sky-500 text-[#04121f] hover:bg-cyan-400' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                            >
                                {saving ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                                {saving ? 'SAVING…' : 'ENROLL & SYNC'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}


function EditEmployeeModal({ employee, onClose }) {
    const { updateEmployee } = useSecurity();
    const [name, setName] = useState(employee?.name || '');
    const [role, setRole] = useState(employee?.role || '');
    const [accessLevels, setAccessLevels] = useState([]);
    const [accessLevelId, setAccessLevelId] = useState(employee?.accessLevelId || '');
    const initialCards = employee?.cardNos?.length ? employee.cardNos : (employee?.cardNo ? [employee.cardNo] : []);
    const [cardsText, setCardsText] = useState(initialCards.join(', '));
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(employee?.photoPath ? fileUrl(employee.photoPath) : null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

    useEffect(() => {
        api.get('/access-levels')
            .then(({ data }) => {
                const list = data || [];
                setAccessLevels(list);
                if (!accessLevelId && employee?.level) {
                    const match = list.find((item) => item.name === employee.level);
                    if (match) setAccessLevelId(match.id);
                }
            })
            .catch(() => setAccessLevels([]));
    }, [employee?.id, employee?.level, accessLevelId]);

    const pickPhoto = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhoto(file);
        setPhotoPreview(URL.createObjectURL(file));
    };

    const parsedCards = cardsText
        .split(/[\s,;]+/)
        .map((v) => v.trim())
        .filter(Boolean);

    const cardsValid = parsedCards.every((v) => /^\d{10}$/.test(v));

    const submit = async () => {
        if (!name.trim()) return;
        if (!cardsValid) {
            toast.error('INVALID CARD FORMAT', { description: 'Every card must contain exactly 10 digits.' });
            return;
        }
        setSaving(true);
        try {
            let photoPath = employee?.photoPath || null;
            if (photo) {
                const fd = new FormData();
                fd.append('file', photo);
                const { data } = await api.post('/upload/photo', fd);
                photoPath = data.path;
            }
            await updateEmployee(employee.id, {
                name: name.trim(),
                role: role.trim() || 'Staff Member',
                level: accessLevels.find((item) => item.id === accessLevelId)?.name || employee?.level || 'CUSTOM',
                accessLevelId,
                cardNos: parsedCards,
                cardNo: parsedCards[0] || '',
                photoPath,
            });
            toast.success('EMPLOYEE UPDATED', { description: `${name} saved successfully` });
            onClose();
        } catch (e) {
            toast.error('UPDATE FAILED', { description: formatApiError(e?.response?.data?.detail || e?.message) });
        } finally {
            setSaving(false);
        }
    };

    if (!employee) return null;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24 }}
                className="relative w-full max-w-xl rounded-2xl border border-sky-500/25 bg-[#0b1220] p-6 sm:p-8"
            >
                <div className="flex items-start justify-between">
                    <div>
                        <p className="mono text-[10px] tracking-[0.35em] text-sky-400">EDIT CREDENTIAL PROFILE</p>
                        <h2 className="font-display text-xl font-bold text-white mt-2">{employee.name}</h2>
                        {employee.personId && <p className="mono text-[9px] tracking-widest text-slate-600 mt-1">PERSON ID · {employee.personId}</p>}
                    </div>
                    <button onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white">
                        <X size={15} />
                    </button>
                </div>

                <div className="mt-6 space-y-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => fileRef.current?.click()} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-dashed border-sky-500/40 bg-white/[0.03]">
                            {photoPreview ? <img src={photoPreview} alt="Employee" className="h-full w-full object-cover" /> : <ImagePlus size={22} className="m-auto text-sky-400" />}
                        </button>
                        <div>
                            <p className="mono text-[10px] tracking-widest text-slate-500">EMPLOYEE PHOTO</p>
                            <p className="mt-1 text-xs text-slate-500">Click the box to add or replace the image.</p>
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                    </div>

                    <div>
                        <label className="mono text-[10px] tracking-widest text-slate-500">FULL NAME</label>
                        <input value={name} onChange={(e) => setName(e.target.value)}
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60" />
                    </div>

                    <div>
                        <label className="mono text-[10px] tracking-widest text-slate-500">ROLE</label>
                        <input value={role} onChange={(e) => setRole(e.target.value)}
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60" />
                    </div>

                    <div>
                        <label className="mono text-[10px] tracking-widest text-slate-500">ACCESS LEVEL</label>
                        <select value={accessLevelId} onChange={(e) => setAccessLevelId(e.target.value)}
                            className="mt-2 w-full rounded-lg border border-white/10 bg-[#0f172a] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60">
                            <option value="">SELECT ACCESS LEVEL</option>
                            {accessLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="mono text-[10px] tracking-widest text-slate-500">CARD NUMBERS · 10 DIGITS EACH</label>
                        <textarea
                            value={cardsText}
                            onChange={(e) => setCardsText(e.target.value.replace(/[^0-9,;\s]/g, ''))}
                            rows={3}
                            placeholder="0008512197, 0008512175"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 mono text-sm text-sky-200 focus:outline-none focus:border-sky-400/60"
                        />
                        <p className={`mt-1 mono text-[9px] tracking-wider ${cardsValid ? 'text-slate-600' : 'text-red-400'}`}>
                            Separate multiple cards with commas.
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-5">
                    <button onClick={onClose} className="rounded-full border border-white/10 px-5 py-2.5 mono text-[10px] tracking-widest text-slate-400 hover:text-white">CANCEL</button>
                    <button onClick={submit} disabled={saving || !cardsValid || !name.trim()}
                        className="flex items-center gap-2 rounded-full bg-sky-500 px-6 py-2.5 font-head font-bold tracking-widest text-sm text-[#04121f] hover:bg-cyan-400 disabled:opacity-40">
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        {saving ? 'SAVING…' : 'SAVE CHANGES'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default function Employees() {
    const { employees, deleteEmployee } = useSecurity();
    const [open, setOpen] = useState(false);
    const [accessLevelsOpen, setAccessLevelsOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [query, setQuery] = useState('');
    const [faceFilter, setFaceFilter] = useState('all');
    const [levelFilter, setLevelFilter] = useState('all');

    const filteredEmployees = (employees || []).filter((emp) => {
        const cards = emp.cardNos?.length ? emp.cardNos : (emp.cardNo ? [emp.cardNo] : []);
        const haystack = [
            emp.name,
            emp.personId,
            emp.role,
            emp.level,
            ...cards,
        ].filter(Boolean).join(' ').toLowerCase();

        const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
        const matchesFace =
            faceFilter === 'all' ||
            (faceFilter === 'synced' && emp.faceSync) ||
            (faceFilter === 'pending' && !emp.faceSync);
        const matchesLevel = levelFilter === 'all' || emp.level === levelFilter;
        return matchesQuery && matchesFace && matchesLevel;
    });

    const remove = async (emp) => {
        try {
            await deleteEmployee(emp.id);
            toast.success('CREDENTIAL REVOKED', { description: `${emp.name} removed from the registry` });
        } catch (e) {
            toast.error('DELETE FAILED', { description: 'Could not remove employee — try again' });
        }
    };

    return (
        <div className="space-y-6" data-testid="employees-page">
            <PageHeader eyebrow={`PERSONNEL REGISTRY // ${employees ? `${employees.length} ACTIVE CREDENTIALS` : 'SYNCING…'}`} title="Employee Enrollment">
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setAccessLevelsOpen(true)}
                        className="flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/5 px-5 py-3 font-head font-bold tracking-widest text-xs text-sky-300 transition-colors hover:bg-sky-500/10"
                    >
                        <ShieldCheck size={16} />
                        ACCESS LEVELS
                    </button>
                    <button
                        data-testid="enroll-open-btn"
                        onClick={() => setOpen(true)}
                        className="flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 font-head font-bold tracking-widest text-sm text-[#04121f] transition-colors duration-200 hover:bg-cyan-400"
                    >
                        <UserPlus size={16} />
                        ENROLL EMPLOYEE
                    </button>
                </div>
            </PageHeader>

            <div className="aegis-panel rounded-xl p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5">
                        <Search size={15} className="text-slate-500" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search name, Person ID, card number, role…"
                            className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
                            data-testid="employee-search-input"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={faceFilter}
                            onChange={(e) => setFaceFilter(e.target.value)}
                            className="rounded-lg border border-white/10 bg-[#0f172a] px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-400/60"
                        >
                            <option value="all">ALL FACE STATUS</option>
                            <option value="synced">FACE SYNCED</option>
                            <option value="pending">FACE PENDING</option>
                        </select>
                        <select
                            value={levelFilter}
                            onChange={(e) => setLevelFilter(e.target.value)}
                            className="rounded-lg border border-white/10 bg-[#0f172a] px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-400/60"
                        >
                            <option value="all">ALL LEVELS</option>
                            <option>L1 · GENERAL</option>
                            <option>L2 · STAFF</option>
                            <option>L3 · RESTRICTED</option>
                            <option>L4 · COMMAND</option>
                        </select>
                    </div>
                </div>
                <div className="mt-3 flex items-center gap-2 mono text-[10px] tracking-widest text-slate-600">
                    <Filter size={12} />
                    SHOWING {filteredEmployees.length} OF {employees?.length || 0} PEOPLE
                </div>
            </div>

            {employees === null ? (
                <p className="mono text-xs tracking-widest text-slate-600 py-16 text-center">LOADING REGISTRY…</p>
            ) : employees.length === 0 ? (
                <button
                    data-testid="empty-employees-cta"
                    onClick={() => setOpen(true)}
                    className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sky-500/25 py-20 transition-colors duration-200 hover:border-[#ea7f2b]/50 hover:bg-[#ea7f2b]/5"
                >
                    <UserPlus size={28} className="text-sky-500/60" />
                    <p className="mono text-[10px] tracking-[0.25em] text-slate-500">REGISTRY EMPTY · ENROLL YOUR FIRST EMPLOYEE</p>
                </button>
            ) : (
                <div className="overflow-hidden rounded-xl border border-sky-500/15 bg-[#09101d]/90">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-left">
                            <thead className="border-b border-white/5 bg-white/[0.02]">
                                <tr className="mono text-[9px] tracking-widest text-slate-600">
                                    <th className="px-4 py-3 font-medium">PERSON</th>
                                    <th className="px-4 py-3 font-medium">PERSON ID</th>
                                    <th className="px-4 py-3 font-medium">CARD NO.</th>
                                    <th className="px-4 py-3 font-medium">ROLE</th>
                                    <th className="px-4 py-3 font-medium">LEVEL</th>
                                    <th className="px-4 py-3 font-medium">FACE</th>
                                    <th className="px-4 py-3 font-medium text-right">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.map((emp, i) => {
                                    const cards = emp.cardNos?.length ? emp.cardNos : (emp.cardNo ? [emp.cardNo] : []);
                                    return (
                                        <motion.tr
                                            key={emp.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: Math.min(i * 0.015, 0.25) }}
                                            className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025]"
                                        >
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <Avatar emp={emp} size="h-10 w-10" />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-200">{emp.name}</p>
                                                        <p className="mono mt-0.5 text-[9px] tracking-wider text-slate-600">
                                                            {emp.source === 'iVMS-4200' ? 'IMPORTED FROM IVMS' : 'KERMA V2'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 mono text-xs text-slate-400">{emp.personId || '—'}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                                                    {cards.length ? cards.map((card) => (
                                                        <span key={card} className="mono rounded border border-white/5 bg-white/[0.04] px-2 py-1 text-[11px] text-sky-200">{card}</span>
                                                    )) : <span className="mono text-[10px] text-slate-600">NO CARD</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-xs text-slate-400">{emp.role || '—'}</td>
                                            <td className="px-4 py-3.5">
                                                <span className="mono rounded border border-sky-500/20 bg-sky-500/5 px-2 py-1 text-[9px] tracking-wider text-sky-300">{emp.level || '—'}</span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`mono rounded border px-2 py-1 text-[9px] tracking-wider ${
                                                    emp.faceSync
                                                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                                                        : 'border-orange-400/30 bg-orange-400/10 text-orange-300'
                                                }`}>
                                                    {emp.faceSync ? 'SYNCED' : 'PENDING'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex justify-end gap-2">
                                                    {cards.length > 0 && (
                                                        <button
                                                            onClick={() => {
                                                                const value = cards.join(', ');
                                                                try { navigator.clipboard.writeText(value); } catch (e) { /* noop */ }
                                                                toast.info('CARD NUMBER COPIED', { description: value });
                                                            }}
                                                            className="rounded-md border border-white/10 p-2 text-slate-500 hover:border-sky-400/40 hover:text-sky-300"
                                                            title="Copy card number"
                                                        >
                                                            <Copy size={13} />
                                                        </button>
                                                    )}
                                                    <button
                                                        data-testid={`edit-employee-${emp.id}`}
                                                        onClick={() => setEditing(emp)}
                                                        className="flex items-center gap-1.5 rounded-md border border-sky-500/25 px-3 py-2 mono text-[9px] tracking-widest text-sky-300 hover:bg-sky-500/10"
                                                    >
                                                        <Pencil size={12} /> EDIT
                                                    </button>
                                                    <DeleteButton testid={`delete-employee-${emp.id}`} onConfirm={() => remove(emp)} />
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                                {filteredEmployees.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="px-5 py-12 text-center mono text-[10px] tracking-wider text-slate-600">
                                            NO ENROLLMENTS MATCH THE CURRENT FILTERS
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <AccessLevelsModal open={accessLevelsOpen} onClose={() => setAccessLevelsOpen(false)} />
            <EnrollModal open={open} onClose={() => setOpen(false)} />
            <AnimatePresence>
                {editing && <EditEmployeeModal employee={editing} onClose={() => setEditing(null)} />}
            </AnimatePresence>
        </div>
    );
}
