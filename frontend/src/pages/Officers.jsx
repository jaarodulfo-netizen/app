import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserPlus, Copy, ShieldCheck, Loader2, ShieldAlert, ChevronDown, MonitorSmartphone, Globe, Clock, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PageHeader } from '../components/PageHeader';
import { api, useAuth, formatApiError } from '../context/AuthContext';

dayjs.extend(relativeTime);

function SessionList({ officerId }) {
    const [sessions, setSessions] = useState(null);

    useEffect(() => {
        api.get(`/auth/officers/${officerId}/sessions`)
            .then((r) => setSessions(r.data))
            .catch(() => setSessions([]));
    }, [officerId]);

    if (sessions === null) {
        return (
            <div className="flex items-center gap-2 px-5 py-4">
                <Loader2 size={14} className="animate-spin text-sky-400" />
                <span className="mono text-[10px] tracking-widest text-slate-500">LOADING SESSIONS…</span>
            </div>
        );
    }
    if (sessions.length === 0) {
        return <p className="mono text-[10px] tracking-widest text-slate-600 px-5 py-4">NO SESSIONS RECORDED YET</p>;
    }
    return (
        <div className="divide-y divide-white/[0.04]">
            {sessions.map((s) => (
                <div key={s.id} data-testid={`session-row-${s.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-5 py-3.5 bg-black/20">
                    <span className={`flex items-center gap-2 mono text-[10px] tracking-widest ${s.active ? 'text-emerald-300' : 'text-slate-500'}`}>
                        <span className={`relative flex h-1.5 w-1.5`}>
                            {s.active && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 node-ping" />}
                            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.active ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        </span>
                        {s.active ? 'ACTIVE NOW' : 'ENDED'}
                    </span>
                    <span className="flex items-center gap-1.5 mono text-[10px] text-slate-400">
                        <MonitorSmartphone size={12} className="text-sky-400" /> {s.agent}
                    </span>
                    <span className="flex items-center gap-1.5 mono text-[10px] text-slate-400">
                        <Globe size={12} className="text-sky-400" /> {s.ip}
                    </span>
                    <span className="flex items-center gap-1.5 mono text-[10px] text-slate-500">
                        <Clock size={12} /> SIGNED IN {dayjs(s.created_at).fromNow().toUpperCase()} · LAST ACTIVE {dayjs(s.last_seen).fromNow().toUpperCase()}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default function Officers() {
    const { user } = useAuth();
    const [officers, setOfficers] = useState([]);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [deleteArmed, setDeleteArmed] = useState(null);

    const load = () => api.get('/auth/officers').then((r) => setOfficers(r.data)).catch(() => {});
    useEffect(() => {
        if (user?.role === 'commander') {
            load();
            const t = setInterval(load, 15000);
            return () => clearInterval(t);
        }
    }, [user]);

    const toggleActive = async (o) => {
        try {
            await api.patch(`/auth/officers/${o.id}`, { active: !o.is_active });
            toast.success(o.is_active ? 'ACCOUNT DEACTIVATED' : 'ACCOUNT REACTIVATED', {
                description: o.is_active ? `${o.email} · all sessions revoked` : `${o.email} can sign in again`,
            });
            load();
        } catch (err) {
            toast.error('ACTION BLOCKED', { description: formatApiError(err.response?.data?.detail) });
        }
    };

    const removeOfficer = async (o) => {
        try {
            await api.delete(`/auth/officers/${o.id}`);
            toast.success('ACCOUNT DELETED', { description: o.email });
            setDeleteArmed(null);
            load();
        } catch (err) {
            toast.error('ACTION BLOCKED', { description: formatApiError(err.response?.data?.detail) });
            setDeleteArmed(null);
        }
    };

    if (user?.role !== 'commander') {
        return (
            <div className="aegis-panel rounded-xl p-12 text-center" data-testid="officers-restricted">
                <ShieldAlert size={32} className="text-red-400 mx-auto" />
                <p className="font-display text-white font-bold mt-4">COMMANDER CLEARANCE REQUIRED</p>
                <p className="text-sm text-slate-500 mt-2">Only commanders can manage officer accounts.</p>
            </div>
        );
    }

    const create = async (e) => {
        e.preventDefault();
        setError('');
        setCreated(null);
        setBusy(true);
        try {
            const { data } = await api.post('/auth/officers', { email, name });
            setCreated(data);
            setName('');
            setEmail('');
            load();
            toast.success('OFFICER ACCOUNT CREATED', { description: `${data.email} · temporary password generated` });
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="officers-page">
            <PageHeader eyebrow="TEAM CLEARANCES // COMMANDER ONLY" title="Officer Accounts" />

            <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="aegis-panel rounded-xl p-6">
                    <h2 className="font-head font-bold tracking-wider text-slate-100">ISSUE NEW CLEARANCE</h2>
                    <p className="text-xs text-slate-500 mt-1.5">A temporary password is generated — the officer must rotate it on first login.</p>
                    <form onSubmit={create} className="mt-5 space-y-4">
                        <div>
                            <label className="mono text-[10px] tracking-widest text-slate-500">FULL NAME</label>
                            <input
                                data-testid="officer-name-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder="e.g. Maria Torres"
                                className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200"
                            />
                        </div>
                        <div>
                            <label className="mono text-[10px] tracking-widest text-slate-500">CORPORATE EMAIL</label>
                            <input
                                data-testid="officer-email-input"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="name@kermagames.com"
                                className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200"
                            />
                            <p className="mono text-[9px] tracking-wider text-slate-600 mt-2">ONLY @KERMAGAMES.COM / @TRIVELTA.COM</p>
                        </div>
                        {error && (
                            <div data-testid="officer-create-error" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                                <p className="mono text-xs text-red-300">{error}</p>
                            </div>
                        )}
                        <button
                            data-testid="officer-create-btn"
                            type="submit"
                            disabled={busy}
                            className={`flex w-full items-center justify-center gap-2 rounded-full py-3 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                                busy ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-sky-500 text-[#04121f] hover:bg-cyan-400'
                            }`}
                        >
                            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                            {busy ? 'GENERATING…' : 'CREATE & GENERATE PASSWORD'}
                        </button>
                    </form>

                    {created && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-5 rounded-xl border border-[#ea7f2b]/40 bg-[#ea7f2b]/10 p-4"
                            data-testid="temp-password-reveal"
                        >
                            <p className="mono text-[10px] tracking-widest text-gold">TEMPORARY PASSWORD · SHOWN ONCE</p>
                            <div className="mt-2.5 flex items-center gap-2">
                                <code className="mono text-sm text-white bg-black/40 rounded-lg px-3 py-2 flex-1 select-all">{created.temp_password}</code>
                                <button
                                    data-testid="temp-password-copy-btn"
                                    onClick={() => {
                                        try { navigator.clipboard.writeText(created.temp_password); } catch (e) { /* noop */ }
                                        toast.info('TEMP PASSWORD COPIED');
                                    }}
                                    className="rounded-lg border border-[#ea7f2b]/40 p-2 text-gold transition-colors duration-200 hover:bg-[#ea7f2b]/20"
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                            <p className="mono text-[9px] tracking-wider text-slate-400 mt-2.5">SHARE SECURELY WITH {created.email.toUpperCase()}</p>
                        </motion.div>
                    )}
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="aegis-panel rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                        <h2 className="font-head font-bold tracking-wider text-slate-100">ACTIVE ACCOUNTS · {officers.length}</h2>
                        <span className="mono text-[9px] tracking-widest text-slate-600">AUTO-REFRESH 15S</span>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                        {officers.map((o) => (
                            <div key={o.id}>
                                <button
                                    data-testid={`officer-row-${o.email}`}
                                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-white/[0.03]"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600/40 to-[#ea7f2b]/20 ring-1 ring-sky-500/30 shrink-0">
                                        <span className="font-display font-bold text-xs text-sky-200">
                                            {o.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-100 truncate">{o.name}</p>
                                        <p className="mono text-[11px] text-slate-500 truncate">{o.email}</p>
                                    </div>
                                    <div className="hidden md:block text-right shrink-0">
                                        <p className="mono text-[9px] tracking-widest text-slate-600">LAST LOGIN</p>
                                        <p className="mono text-[11px] text-slate-300 mt-0.5">{o.last_login ? dayjs(o.last_login).fromNow() : 'never'}</p>
                                    </div>
                                    <span
                                        data-testid={`session-count-${o.email}`}
                                        className={`mono text-[9px] tracking-widest rounded border px-2 py-1 shrink-0 ${
                                            o.active_sessions > 0
                                                ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                                                : 'text-slate-500 border-white/10'
                                        }`}
                                    >
                                        {o.active_sessions > 0 ? `${o.active_sessions} LIVE` : 'IDLE'}
                                    </span>
                                    <span
                                        className={`mono text-[9px] tracking-widest rounded border px-2 py-1 shrink-0 ${
                                            o.role === 'commander'
                                                ? 'text-gold border-[#ea7f2b]/40 bg-[#ea7f2b]/10'
                                                : 'text-sky-300 border-sky-500/25 bg-sky-500/5'
                                        }`}
                                    >
                                        {o.role.toUpperCase()}
                                    </span>
                                    <span
                                        className={`mono text-[9px] tracking-widest rounded border px-2 py-1 shrink-0 hidden sm:block ${
                                            !o.is_active
                                                ? 'text-red-300 border-red-400/30 bg-red-400/10'
                                                : o.must_change_password
                                                  ? 'text-orange-300 border-orange-400/30 bg-orange-400/10'
                                                  : 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                                        }`}
                                    >
                                        {!o.is_active ? 'DISABLED' : o.must_change_password ? 'ROTATION PENDING' : 'ACTIVE'}
                                    </span>
                                    {o.id !== user?.id && (
                                        <span className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                data-testid={`toggle-officer-${o.email}`}
                                                onClick={() => toggleActive(o)}
                                                title={o.is_active ? 'Deactivate account' : 'Reactivate account'}
                                                className={`rounded-md border p-1.5 transition-colors duration-200 ${
                                                    o.is_active
                                                        ? 'border-white/10 text-slate-500 hover:text-orange-300 hover:border-orange-400/40'
                                                        : 'border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10'
                                                }`}
                                            >
                                                <Power size={12} />
                                            </button>
                                            <button
                                                data-testid={`delete-officer-${o.email}`}
                                                onClick={() => {
                                                    if (deleteArmed === o.id) {
                                                        removeOfficer(o);
                                                    } else {
                                                        setDeleteArmed(o.id);
                                                        setTimeout(() => setDeleteArmed((c) => (c === o.id ? null : c)), 2600);
                                                    }
                                                }}
                                                title="Delete account"
                                                className={`rounded-md border p-1.5 transition-colors duration-200 ${
                                                    deleteArmed === o.id
                                                        ? 'border-red-500/60 bg-red-500/15 text-red-300'
                                                        : 'border-white/10 text-slate-500 hover:text-red-300 hover:border-red-400/40'
                                                }`}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </span>
                                    )}
                                    <ChevronDown size={14} className={`text-slate-500 shrink-0 transition-transform duration-300 ${expanded === o.id ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence initial={false}>
                                    {expanded === o.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                            className="overflow-hidden border-t border-white/5"
                                        >
                                            <SessionList officerId={o.id} />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                        {officers.length === 0 && <p className="mono text-xs tracking-widest text-slate-600 text-center py-12">NO ACCOUNTS YET</p>}
                    </div>
                    <div className="px-5 py-4 border-t border-white/5 flex items-center gap-2">
                        <ShieldCheck size={13} className="text-emerald-400" />
                        <p className="mono text-[9px] tracking-widest text-slate-600">DOMAIN LOCKED · BRUTE-FORCE LOCKOUT AFTER 5 FAILURES · 12H SESSIONS · LIVE = ACTIVE IN LAST 30 MIN</p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
