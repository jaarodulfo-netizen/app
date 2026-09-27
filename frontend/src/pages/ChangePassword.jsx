import { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuth, formatApiError } from '../context/AuthContext';

export default function ChangePassword() {
    const { user, setUser } = useAuth();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (next.length < 10) return setError('New password must be at least 10 characters.');
        if (next !== confirm) return setError('New passwords do not match.');
        setBusy(true);
        try {
            const { data } = await api.post('/auth/change-password', { current_password: current, new_password: next });
            setUser(data.user);
            toast.success('CREDENTIALS ROTATED', { description: 'Your new password is now active' });
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050811] bg-grid noise-overlay flex items-center justify-center px-4 relative overflow-hidden" data-testid="change-password-page">
            <div className="pointer-events-none absolute -top-40 right-1/4 h-[420px] w-[420px] rounded-full bg-[#ea7f2b]/10 blur-[130px]" />
            <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full max-w-md aegis-panel corner-frame rounded-2xl p-8 sm:p-10"
            >
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#ea7f2b]/40 bg-[#ea7f2b]/10">
                    <KeyRound size={24} className="text-gold" />
                </div>
                <p className="mono text-[10px] tracking-[0.35em] text-gold mt-6">FIRST LOGIN · ROTATION REQUIRED</p>
                <h1 className="font-display font-extrabold text-white text-2xl sm:text-3xl tracking-wide mt-2">Set your password</h1>
                <p className="text-sm text-slate-500 mt-3">
                    {user?.name}, your account uses a temporary password. Choose a new one to activate your console clearance.
                </p>

                <form onSubmit={submit} className="mt-8 space-y-4">
                    {[
                        { label: 'TEMPORARY PASSWORD', value: current, set: setCurrent, testid: 'changepw-current-input' },
                        { label: 'NEW PASSWORD · MIN 10 CHARS', value: next, set: setNext, testid: 'changepw-new-input' },
                        { label: 'CONFIRM NEW PASSWORD', value: confirm, set: setConfirm, testid: 'changepw-confirm-input' },
                    ].map((f) => (
                        <div key={f.testid}>
                            <label className="mono text-[10px] tracking-widest text-slate-500">{f.label}</label>
                            <input
                                data-testid={f.testid}
                                type="password"
                                required
                                value={f.value}
                                onChange={(e) => f.set(e.target.value)}
                                className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60 transition-colors duration-200"
                            />
                        </div>
                    ))}

                    {error && (
                        <div data-testid="changepw-error" className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                            <ShieldAlert size={15} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="mono text-xs text-red-300">{error}</p>
                        </div>
                    )}

                    <button
                        data-testid="changepw-submit-btn"
                        type="submit"
                        disabled={busy}
                        className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                            busy ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-[#fee396] to-[#ea7f2b] text-[#2b1608] hover:opacity-90'
                        }`}
                    >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        {busy ? 'ROTATING…' : 'ACTIVATE CLEARANCE'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
