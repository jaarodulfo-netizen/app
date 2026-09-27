import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Copy, ShieldCheck, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { PageHeader } from '../components/PageHeader';
import { api, useAuth, formatApiError } from '../context/AuthContext';

export default function Officers() {
    const { user } = useAuth();
    const [officers, setOfficers] = useState([]);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState(null);

    const load = () => api.get('/auth/officers').then((r) => setOfficers(r.data)).catch(() => {});
    useEffect(() => {
        if (user?.role === 'commander') load();
    }, [user]);

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
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                        {officers.map((o) => (
                            <div key={o.id} data-testid={`officer-row-${o.email}`} className="flex items-center gap-4 px-5 py-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600/40 to-[#ea7f2b]/20 ring-1 ring-sky-500/30 shrink-0">
                                    <span className="font-display font-bold text-xs text-sky-200">
                                        {o.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-100 truncate">{o.name}</p>
                                    <p className="mono text-[11px] text-slate-500 truncate">{o.email}</p>
                                </div>
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
                                        o.must_change_password
                                            ? 'text-orange-300 border-orange-400/30 bg-orange-400/10'
                                            : 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                                    }`}
                                >
                                    {o.must_change_password ? 'ROTATION PENDING' : 'ACTIVE'}
                                </span>
                                <span className="mono text-[10px] text-slate-600 shrink-0 hidden lg:block">
                                    {o.created_at ? dayjs(o.created_at).format('DD MMM YYYY') : '—'}
                                </span>
                            </div>
                        ))}
                        {officers.length === 0 && <p className="mono text-xs tracking-widest text-slate-600 text-center py-12">NO ACCOUNTS YET</p>}
                    </div>
                    <div className="px-5 py-4 border-t border-white/5 flex items-center gap-2">
                        <ShieldCheck size={13} className="text-emerald-400" />
                        <p className="mono text-[9px] tracking-widest text-slate-600">DOMAIN LOCKED · BRUTE-FORCE LOCKOUT AFTER 5 FAILURES · 12H SESSIONS</p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
