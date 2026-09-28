import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Mail, LogIn, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth, formatApiError } from '../context/AuthContext';

function ClearanceSplash({ name, role }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            className="fixed inset-0 z-[60] bg-[#050811] bg-grid flex flex-col items-center justify-center overflow-hidden"
            data-testid="clearance-splash"
        >
            <div className="pointer-events-none absolute -top-32 left-1/3 h-[420px] w-[420px] rounded-full bg-blue-700/15 blur-[130px]" />
            <div className="pointer-events-none absolute bottom-0 right-1/4 h-[360px] w-[360px] rounded-full bg-[#ea7f2b]/10 blur-[120px]" />

            <div className="relative h-64 w-64 sm:h-72 sm:w-72">
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0">
                    <div className="absolute inset-0 rounded-full border border-sky-500/25" />
                    <div className="absolute inset-8 rounded-full border border-sky-500/20" />
                    <div className="absolute inset-16 rounded-full border border-[#ea7f2b]/30" />
                    <div className="absolute inset-24 rounded-full border border-sky-500/15" />
                    <div
                        className="absolute inset-0 rounded-full radar-sweep"
                        style={{ background: 'conic-gradient(from 0deg, rgba(254,227,150,0.35), rgba(56,189,248,0.18) 55deg, transparent 90deg, transparent 360deg)' }}
                    />
                    <div className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-sky-500/20 to-transparent -translate-x-1/2" />
                    <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-sky-500/20 to-transparent -translate-y-1/2" />
                </motion.div>
                <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 flex items-center justify-center"
                >
                    <img src="/kerma-icon.png" alt="Kerma" className="h-20 w-20 rounded-full ring-2 ring-[#ea7f2b]/60 gold-glow object-cover" />
                </motion.div>
                {[
                    { top: '18%', left: '72%' },
                    { top: '64%', left: '22%' },
                    { top: '78%', left: '60%' },
                ].map((pos, i) => (
                    <motion.span
                        key={i}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: [0, 1, 0.4], scale: 1 }}
                        transition={{ delay: 0.8 + i * 0.3, duration: 0.5 }}
                        className="absolute h-1.5 w-1.5 rounded-full bg-[#fee396] gold-glow"
                        style={pos}
                    />
                ))}
            </div>

            <div className="mt-10 overflow-hidden">
                <motion.p
                    initial={{ y: '110%' }}
                    animate={{ y: 0 }}
                    transition={{ delay: 0.55, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="font-display font-extrabold text-2xl sm:text-4xl tracking-[0.12em] text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-white to-[#fee396]"
                >
                    CLEARANCE GRANTED
                </motion.p>
            </div>
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="mono text-[10px] sm:text-xs tracking-[0.35em] text-slate-400 mt-4"
            >
                {name?.toUpperCase()} · {(role || '').toUpperCase()} · SESSION ENCRYPTED
            </motion.p>
            <div className="mt-6 h-0.5 w-56 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-sky-500 via-cyan-400 to-[#ea7f2b]"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ delay: 0.4, duration: 1.8, ease: 'easeInOut' }}
                />
            </div>
        </motion.div>
    );
}

export default function Login() {
    const { login, commitSession } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [granted, setGranted] = useState(null);

    useEffect(() => {
        if (!granted) return;
        const t = setTimeout(() => commitSession(granted), 2600);
        return () => clearTimeout(t);
    }, [granted, commitSession]);

    const submit = async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const user = await login(email, password);
            setGranted(user);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050811] bg-grid noise-overlay flex items-center justify-center px-4 relative overflow-hidden" data-testid="login-page">
            <div className="pointer-events-none absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-blue-700/10 blur-[140px]" />
            <div className="pointer-events-none absolute -bottom-32 right-1/4 h-[380px] w-[380px] rounded-full bg-[#ea7f2b]/10 blur-[130px]" />

            <motion.div
                initial={{ opacity: 0, y: 28, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full max-w-md aegis-panel corner-frame rounded-2xl p-8 sm:p-10"
            >
                <img src="/kerma-logo.svg" alt="Kerma Games" className="h-10 w-auto" />
                <p className="mono text-[9px] tracking-[0.35em] text-sky-400/80 mt-2">SECURITY COMMAND OS</p>

                <h1 className="mt-8 font-display font-extrabold text-white text-2xl sm:text-3xl leading-tight tracking-wide">
                    {['AUTHORIZED PERSONNEL', 'ONLY.'].map((line, i) => (
                        <span key={line} className="block overflow-hidden pb-0.5">
                            <motion.span
                                className={`block ${i === 1 ? 'text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-[#fee396]' : ''}`}
                                initial={{ y: '110%' }}
                                animate={{ y: 0 }}
                                transition={{ delay: 0.25 + i * 0.14, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {line}
                            </motion.span>
                        </span>
                    ))}
                </h1>
                <p className="text-sm text-slate-500 mt-3">
                    Console access is restricted to <span className="text-gold mono text-xs">@kermagames.com</span> and{' '}
                    <span className="text-gold mono text-xs">@trivelta.com</span> credentials.
                </p>

                <form onSubmit={submit} className="mt-8 space-y-4">
                    <div>
                        <label className="mono text-[10px] tracking-widest text-slate-500">OFFICER EMAIL</label>
                        <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-4 focus-within:border-sky-400/60 transition-colors duration-200">
                            <Mail size={15} className="text-slate-500 shrink-0" />
                            <input
                                data-testid="login-email-input"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@kermagames.com"
                                className="w-full bg-transparent py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mono text-[10px] tracking-widest text-slate-500">PASSWORD</label>
                        <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-4 focus-within:border-sky-400/60 transition-colors duration-200">
                            <Lock size={15} className="text-slate-500 shrink-0" />
                            <input
                                data-testid="login-password-input"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••••••"
                                className="w-full bg-transparent py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
                            />
                        </div>
                    </div>

                    {error && (
                        <div data-testid="login-error" className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                            <ShieldAlert size={15} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="mono text-xs text-red-300">{error}</p>
                        </div>
                    )}

                    <button
                        data-testid="login-submit-btn"
                        type="submit"
                        disabled={busy}
                        className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                            busy ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-sky-500 text-[#04121f] hover:bg-cyan-400'
                        }`}
                    >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                        {busy ? 'VERIFYING CLEARANCE…' : 'ENTER CONSOLE'}
                    </button>
                </form>

                <p className="mono text-[9px] tracking-[0.25em] text-slate-600 text-center mt-8">KERMA SECURE v2.4.1 · ENCRYPTED SESSION</p>
            </motion.div>

            <AnimatePresence>{granted && <ClearanceSplash name={granted.name} role={granted.role} />}</AnimatePresence>
        </div>
    );
}
