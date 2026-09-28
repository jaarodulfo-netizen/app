import { useEffect, useMemo, useState } from 'react';
import { Clock3, Fingerprint, Save, Users, ScanFace, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { useSecurity } from '@/context/SecurityContext';
import { api, useAuth } from '@/context/AuthContext';

function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Attendance() {
    const { devices } = useSecurity();
    const { user } = useAuth();
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [selected, setSelected] = useState('');
    const [configured, setConfigured] = useState(null);
    const [data, setData] = useState({ rows: [], summary: { present: 0, events: 0 } });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const facialDevices = useMemo(() => (devices || []).filter((d) => d.type === 'face'), [devices]);

    const load = async () => {
        setLoading(true);
        try {
            const [cfg, rows] = await Promise.all([
                api.get('/attendance/config'),
                api.get('/attendance', { params: { date } }),
            ]);
            setConfigured(cfg.data.device);
            setSelected(cfg.data.device_id || '');
            setData(rows.data);
        } catch (e) {
            toast.error('ATTENDANCE UNAVAILABLE', { description: e?.response?.data?.detail || 'Could not load attendance data' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]);

    const saveDevice = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            await api.put('/attendance/config', { device_id: selected });
            toast.success('ATTENDANCE FACIAL ASSIGNED');
            await load();
        } catch (e) {
            toast.error('COULD NOT SAVE', { description: e?.response?.data?.detail || 'Assignment failed' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-7" data-testid="attendance-page">
            <PageHeader
                eyebrow="TIME & ATTENDANCE"
                title="Attendance"
                description="Daily attendance from one dedicated facial terminal. First successful scan is First In; last successful scan is Last Out."
            />

            <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
                <div className="rounded-xl border border-sky-500/15 bg-[#09101d]/90 p-5">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="rounded-lg border border-sky-400/20 bg-sky-400/10 p-2.5 text-sky-300"><ScanFace size={20} /></div>
                        <div>
                            <p className="font-head font-bold text-slate-100">Dedicated Attendance Facial</p>
                            <p className="mono text-[10px] tracking-wider text-slate-500">ONLY ONE FACIAL TERMINAL CAN BE ASSIGNED</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                        <select
                            value={selected}
                            onChange={(e) => setSelected(e.target.value)}
                            disabled={user?.role !== 'commander'}
                            className="min-h-11 flex-1 rounded-lg border border-sky-500/15 bg-[#050811] px-3 text-sm text-slate-200 outline-none focus:border-sky-400/50"
                            data-testid="attendance-device-select"
                        >
                            <option value="">Select facial terminal…</option>
                            {facialDevices.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}{d.ip ? ` · ${d.ip}` : ''}</option>
                            ))}
                        </select>
                        {user?.role === 'commander' && (
                            <button
                                onClick={saveDevice}
                                disabled={!selected || saving}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 font-head text-xs font-bold tracking-wider text-sky-200 hover:bg-sky-400/15 disabled:opacity-40"
                            >
                                {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                                SAVE ASSIGNMENT
                            </button>
                        )}
                    </div>

                    <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.025] px-4 py-3">
                        <p className="mono text-[9px] tracking-[0.22em] text-slate-600">CURRENT TERMINAL</p>
                        <p className="mt-1 text-sm font-semibold text-slate-200">{configured?.name || 'Not assigned'}</p>
                        <p className="mono mt-1 text-[10px] text-slate-500">{configured?.ip || 'Assign a facial device to begin collecting attendance.'}</p>
                    </div>
                </div>

                <div className="rounded-xl border border-sky-500/15 bg-[#09101d]/90 p-5">
                    <p className="mono text-[9px] tracking-[0.22em] text-slate-600">ATTENDANCE DATE</p>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="mt-3 min-h-11 w-full rounded-lg border border-sky-500/15 bg-[#050811] px-3 text-sm text-slate-200 outline-none focus:border-sky-400/50"
                    />
                    <button
                        onClick={load}
                        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-bold text-slate-300 hover:bg-white/[0.07]"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        REFRESH
                    </button>
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
                    <div className="flex items-center gap-2 text-emerald-300"><Users size={17} /><span className="mono text-[10px] tracking-widest">PRESENT</span></div>
                    <p className="mt-2 font-head text-3xl font-black text-slate-100">{data.summary?.present || 0}</p>
                </div>
                <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-5">
                    <div className="flex items-center gap-2 text-sky-300"><Fingerprint size={17} /><span className="mono text-[10px] tracking-widest">FACIAL SCANS</span></div>
                    <p className="mt-2 font-head text-3xl font-black text-slate-100">{data.summary?.events || 0}</p>
                </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-sky-500/15 bg-[#09101d]/90">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                    <div className="flex items-center gap-2">
                        <Clock3 size={16} className="text-sky-300" />
                        <p className="font-head text-sm font-bold text-slate-100">Daily Attendance</p>
                    </div>
                    <p className="mono text-[9px] tracking-widest text-slate-600">FIRST PASS = IN · LAST PASS = OUT</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-white/5 bg-white/[0.02]">
                            <tr className="mono text-[9px] tracking-widest text-slate-600">
                                <th className="px-5 py-3 font-medium">EMPLOYEE</th>
                                <th className="px-5 py-3 font-medium">FIRST IN</th>
                                <th className="px-5 py-3 font-medium">LAST OUT</th>
                                <th className="px-5 py-3 font-medium">SCANS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && data.rows?.length === 0 && (
                                <tr><td colSpan="4" className="px-5 py-12 text-center mono text-[10px] tracking-wider text-slate-600">NO ATTENDANCE RECORDS FOR THIS DATE</td></tr>
                            )}
                            {(data.rows || []).map((row) => (
                                <tr key={row.person} className="border-b border-white/[0.04] last:border-0">
                                    <td className="px-5 py-4 text-sm font-semibold text-slate-200">{row.person}</td>
                                    <td className="px-5 py-4 mono text-xs text-emerald-300">{fmt(row.first_in)}</td>
                                    <td className="px-5 py-4 mono text-xs text-sky-300">{fmt(row.last_out)}</td>
                                    <td className="px-5 py-4 mono text-xs text-slate-400">{row.events}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
