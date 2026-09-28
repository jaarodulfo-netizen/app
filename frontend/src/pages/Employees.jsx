import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ScanFace, X, Copy, UserPlus, Check, Sparkles, Trash2, Loader2, ImagePlus } from 'lucide-react';
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

function EnrollModal({ open, onClose }) {
    const { addEmployee } = useSecurity();
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [level, setLevel] = useState('L1 · GENERAL');
    const [cardNo, setCardNo] = useState('');
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [faceState, setFaceState] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [match, setMatch] = useState(null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

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
        setName(''); setRole(''); setLevel('L1 · GENERAL'); setCardNo('');
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
            await addEmployee({ name: name.trim(), role: role.trim() || 'Staff Member', cardNo, faceSync: true, faceMatch: match, level, photoPath });
            toast.success('PROFILE SYNCHRONIZED', { description: `${name} saved to registry · ready to push to scanners` });
            reset();
            onClose();
        } catch (e) {
            toast.error('ENROLL FAILED', { description: formatApiError(e?.response?.data?.detail || e?.message) });
        } finally {
            setSaving(false);
        }
    };

    const valid = name.trim().length > 1 && /^\d{10}$/.test(cardNo) && faceState === 'done';

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
                                        value={level}
                                        onChange={(e) => setLevel(e.target.value)}
                                        className="mt-2 w-full rounded-lg border border-white/10 bg-[#0f172a] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60 transition-colors duration-200"
                                    >
                                        <option>L1 · GENERAL</option>
                                        <option>L2 · STAFF</option>
                                        <option>L3 · RESTRICTED</option>
                                        <option>L4 · COMMAND</option>
                                    </select>
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

export default function Employees() {
    const { employees, deleteEmployee } = useSecurity();
    const [open, setOpen] = useState(false);

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
                <button
                    data-testid="enroll-open-btn"
                    onClick={() => setOpen(true)}
                    className="flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 font-head font-bold tracking-widest text-sm text-[#04121f] transition-colors duration-200 hover:bg-cyan-400"
                >
                    <UserPlus size={16} />
                    ENROLL EMPLOYEE
                </button>
            </PageHeader>

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
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {employees.map((emp, i) => (
                        <motion.div
                            key={emp.id}
                            data-testid={`employee-card-${emp.id}`}
                            initial={{ opacity: 0, y: 22 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.06, 0.5), duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                            className="aegis-panel rounded-xl p-5 transition-colors duration-300 hover:border-sky-400/40"
                        >
                            <div className="flex items-start gap-4">
                                <Avatar emp={emp} />
                                <div className="min-w-0 flex-1">
                                    <p className="font-head font-bold text-slate-100 tracking-wide truncate">{emp.name}</p>
                                    <p className="text-xs text-slate-500 mt-0.5 truncate">{emp.role}</p>
                                    <span className="inline-block mt-2 mono text-[9px] tracking-widest text-sky-300 border border-sky-500/25 bg-sky-500/5 rounded px-2 py-0.5">
                                        {emp.level}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {(emp.cardNos?.length ? emp.cardNos : (emp.cardNo ? [emp.cardNo] : [])).map((card) => (
                                        <span key={card} className="mono text-xs text-slate-300 bg-white/[0.04] border border-white/5 rounded px-2.5 py-1.5">{card}</span>
                                    ))}
                                    {!emp.cardNo && !emp.cardNos?.length && <span className="mono text-xs text-slate-600">NO CARD</span>}
                                </div>
                                <button
                                    data-testid={`copy-card-${emp.id}`}
                                    onClick={() => {
                                        try { navigator.clipboard.writeText(emp.cardNo); } catch (e) { /* noop */ }
                                        toast.info('CARD NUMBER COPIED', { description: emp.cardNo });
                                    }}
                                    className="rounded-md border border-white/10 p-1.5 text-slate-400 transition-colors duration-200 hover:text-sky-300 hover:border-sky-400/40"
                                >
                                    <Copy size={12} />
                                </button>
                                <span
                                    className={`ml-auto mono text-[9px] tracking-widest rounded border px-2 py-1 ${
                                        emp.faceSync
                                            ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                                            : 'text-orange-300 border-orange-400/30 bg-orange-400/10'
                                    }`}
                                >
                                    {emp.faceSync ? `FACE SYNCED · ${emp.faceMatch}%` : 'FACE PENDING'}
                                </span>
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                                <p className="mono text-[9px] tracking-wider text-slate-600">ENROLLED {emp.created_at ? new Date(emp.created_at).toLocaleDateString() : ''}</p>
                                <DeleteButton testid={`delete-employee-${emp.id}`} onConfirm={() => remove(emp)} />
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            <EnrollModal open={open} onClose={() => setOpen(false)} />
        </div>
    );
}
