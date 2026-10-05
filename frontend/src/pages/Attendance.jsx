import { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, Fingerprint, RefreshCw, Save, ScanFace, TimerReset, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { useSecurity } from '@/context/SecurityContext';
import { api, useAuth } from '@/context/AuthContext';

function localDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(value) {
    if (!value) return '—';
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: '2-digit' });
}

function weekRange(base = new Date()) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const weekday = d.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = new Date(d);
    start.setDate(d.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return [localDateString(start), localDateString(end)];
}

function semiMonthRange(base = new Date(), half = null) {
    const year = base.getFullYear();
    const month = base.getMonth();
    const selectedHalf = half || (base.getDate() <= 15 ? 1 : 2);
    if (selectedHalf === 1) {
        return [localDateString(new Date(year, month, 1)), localDateString(new Date(year, month, 15))];
    }
    return [
        localDateString(new Date(year, month, 16)),
        localDateString(new Date(year, month + 1, 0)),
    ];
}

function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function Attendance() {
    const { devices } = useSecurity();
    const { user } = useAuth();
    const [date, setDate] = useState(() => localDateString());
    const [selected, setSelected] = useState('');
    const [configured, setConfigured] = useState(null);
    const [data, setData] = useState({ rows: [], summary: { present: 0, events: 0, worked: '00:00', overtime: '00:00' } });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const initialRange = weekRange();
    const [reportStart, setReportStart] = useState(initialRange[0]);
    const [reportEnd, setReportEnd] = useState(initialRange[1]);
    const [report, setReport] = useState({ rows: [], summary: {} });
    const [reportLoading, setReportLoading] = useState(false);

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

    const loadReport = async (start = reportStart, end = reportEnd) => {
        setReportLoading(true);
        try {
            const { data: result } = await api.get('/attendance/report', { params: { start, end } });
            setReport(result);
        } catch (e) {
            toast.error('REPORT UNAVAILABLE', { description: e?.response?.data?.detail || 'Could not load payroll attendance report' });
        } finally {
            setReportLoading(false);
        }
    };

    useEffect(() => {
        load();
        const timer = setInterval(() => {
            load();
        }, 15000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]);

    useEffect(() => {
        loadReport(initialRange[0], initialRange[1]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const applyRange = (range) => {
        setReportStart(range[0]);
        setReportEnd(range[1]);
        loadReport(range[0], range[1]);
    };

    const exportCsv = async () => {
        let exportData = report;
        if (!exportData?.rows?.length) {
            try {
                const { data: result } = await api.get('/attendance/report', { params: { start: reportStart, end: reportEnd } });
                exportData = result;
                setReport(result);
            } catch (e) {
                toast.error('EXPORT FAILED', { description: e?.response?.data?.detail || 'Could not build attendance report' });
                return;
            }
        }

        const headers = [
            'Shift Date',
            'Employee',
            'Shift',
            'Scheduled Start',
            'Scheduled End',
            'First In',
            'Last Out',
            'Worked',
            'Regular',
            'Overtime',
            'Scans',
            'Status',
        ];
        const rows = (exportData.rows || []).map((r) => [
            r.shift_date,
            r.person,
            r.shift,
            fmt(r.scheduled_start),
            fmt(r.scheduled_end),
            fmt(r.first_in),
            fmt(r.last_out),
            r.worked,
            r.regular,
            r.overtime,
            r.events,
            String(r.status || '').toUpperCase(),
        ]);
        const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kerma-attendance-${reportStart}-to-${reportEnd}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('ATTENDANCE CSV EXPORTED');
    };

    const shiftBadge = (shift) => {
        const cls = shift === 'A'
            ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
            : shift === 'B'
                ? 'border-[#ea7f2b]/30 bg-[#ea7f2b]/10 text-[#fee396]'
                : 'border-violet-400/30 bg-violet-400/10 text-violet-300';
        return <span className={`mono rounded border px-2 py-1 text-[9px] tracking-widest ${cls}`}>SHIFT {shift}</span>;
    };

    return (
        <div className="space-y-7" data-testid="attendance-page">
            <PageHeader
                eyebrow="TIME & ATTENDANCE // PAYROLL"
                title="Attendance"
                description="Dedicated Hikvision facial attendance with shift-aware First In / Last Out, regular hours and overtime. Overnight Shift C stays attached to the date the shift started."
            />

            <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
                <div className="rounded-xl border border-sky-500/15 bg-[#09101d]/90 p-5">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="rounded-lg border border-sky-400/20 bg-sky-400/10 p-2.5 text-sky-300"><ScanFace size={20} /></div>
                        <div>
                            <p className="font-head font-bold text-slate-100">Dedicated Attendance Facial</p>
                            <p className="mono text-[10px] tracking-wider text-slate-500">FIRST SUCCESSFUL FACE PASS = IN · LAST PASS IN THE SHIFT SESSION = OUT</p>
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
                    <p className="mono text-[9px] tracking-[0.22em] text-slate-600">SHIFT SCHEDULE</p>
                    <div className="mt-3 grid gap-2">
                        <div className="flex items-center justify-between rounded-lg border border-sky-400/15 bg-sky-400/[0.04] px-3 py-2"><span className="mono text-xs text-sky-300">A</span><span className="mono text-xs text-slate-300">07:00 → 15:00</span></div>
                        <div className="flex items-center justify-between rounded-lg border border-[#ea7f2b]/15 bg-[#ea7f2b]/[0.04] px-3 py-2"><span className="mono text-xs text-[#fee396]">B</span><span className="mono text-xs text-slate-300">15:00 → 23:00</span></div>
                        <div className="flex items-center justify-between rounded-lg border border-violet-400/15 bg-violet-400/[0.04] px-3 py-2"><span className="mono text-xs text-violet-300">C</span><span className="mono text-xs text-slate-300">23:00 → 07:00 +1 DAY</span></div>
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-slate-500">A night employee who clocks in before 23:00 and clocks out the next morning remains on the same Shift C payroll day.</p>
                </div>
            </section>

            <section className="rounded-xl border border-sky-500/15 bg-[#09101d]/90 p-5">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <p className="mono text-[9px] tracking-[0.22em] text-slate-600">DAILY SHIFT DATE</p>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="mt-2 min-h-10 rounded-lg border border-sky-500/15 bg-[#050811] px-3 text-sm text-slate-200 outline-none focus:border-sky-400/50"
                        />
                    </div>
                    <button
                        onClick={load}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-slate-300 hover:bg-white/[0.07]"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        REFRESH
                    </button>
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
                    <div className="flex items-center gap-2 text-emerald-300"><Users size={17} /><span className="mono text-[10px] tracking-widest">SHIFT RECORDS</span></div>
                    <p className="mt-2 font-head text-3xl font-black text-slate-100">{data.summary?.present || 0}</p>
                </div>
                <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-5">
                    <div className="flex items-center gap-2 text-sky-300"><Clock3 size={17} /><span className="mono text-[10px] tracking-widest">WORKED HOURS</span></div>
                    <p className="mt-2 font-head text-3xl font-black text-slate-100">{data.summary?.worked || '00:00'}</p>
                </div>
                <div className="rounded-xl border border-[#ea7f2b]/15 bg-[#ea7f2b]/[0.04] p-5">
                    <div className="flex items-center gap-2 text-[#fee396]"><TimerReset size={17} /><span className="mono text-[10px] tracking-widest">OVERTIME</span></div>
                    <p className="mt-2 font-head text-3xl font-black text-slate-100">{data.summary?.overtime || '00:00'}</p>
                </div>
                <div className="rounded-xl border border-violet-400/15 bg-violet-400/[0.04] p-5">
                    <div className="flex items-center gap-2 text-violet-300"><Fingerprint size={17} /><span className="mono text-[10px] tracking-widest">FACIAL SCANS</span></div>
                    <p className="mt-2 font-head text-3xl font-black text-slate-100">{data.summary?.events || 0}</p>
                </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-sky-500/15 bg-[#09101d]/90">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                    <div className="flex items-center gap-2">
                        <Clock3 size={16} className="text-sky-300" />
                        <p className="font-head text-sm font-bold text-slate-100">Daily Payroll Attendance</p>
                    </div>
                    <p className="mono text-[9px] tracking-widest text-slate-600">REGULAR MAX 08:00 · EXCESS = OVERTIME</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-white/5 bg-white/[0.02]">
                            <tr className="mono text-[9px] tracking-widest text-slate-600">
                                <th className="px-4 py-3 font-medium">EMPLOYEE</th>
                                <th className="px-4 py-3 font-medium">SHIFT</th>
                                <th className="px-4 py-3 font-medium">SCHEDULED</th>
                                <th className="px-4 py-3 font-medium">FIRST IN</th>
                                <th className="px-4 py-3 font-medium">LAST OUT</th>
                                <th className="px-4 py-3 font-medium">WORKED</th>
                                <th className="px-4 py-3 font-medium">REGULAR</th>
                                <th className="px-4 py-3 font-medium">OT</th>
                                <th className="px-4 py-3 font-medium">SCANS</th>
                                <th className="px-4 py-3 font-medium">STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && data.rows?.length === 0 && (
                                <tr><td colSpan="10" className="px-5 py-12 text-center mono text-[10px] tracking-wider text-slate-600">NO ATTENDANCE RECORDS FOR THIS SHIFT DATE</td></tr>
                            )}
                            {(data.rows || []).map((row) => (
                                <tr key={`${row.person}-${row.shift_date}-${row.shift}`} className="border-b border-white/[0.04] last:border-0">
                                    <td className="px-4 py-4 text-sm font-semibold text-slate-200">{row.person}</td>
                                    <td className="px-4 py-4">{shiftBadge(row.shift)}</td>
                                    <td className="px-4 py-4 mono text-xs text-slate-400">{fmt(row.scheduled_start)}–{fmt(row.scheduled_end)}</td>
                                    <td className="px-4 py-4 mono text-xs text-emerald-300">{fmt(row.first_in)}</td>
                                    <td className="px-4 py-4 mono text-xs text-sky-300">{fmt(row.last_out)}</td>
                                    <td className="px-4 py-4 mono text-xs text-slate-200">{row.worked}</td>
                                    <td className="px-4 py-4 mono text-xs text-emerald-300">{row.regular}</td>
                                    <td className="px-4 py-4 mono text-xs text-[#fee396]">{row.overtime}</td>
                                    <td className="px-4 py-4 mono text-xs text-slate-400">{row.events}</td>
                                    <td className="px-4 py-4">
                                        <span className={`mono rounded border px-2 py-1 text-[9px] tracking-widest ${
                                            row.status === 'complete'
                                                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                                                : row.status === 'open'
                                                    ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                                                    : 'border-orange-400/30 bg-orange-400/10 text-orange-300'
                                        }`}>{String(row.status || '').toUpperCase()}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-xl border border-[#ea7f2b]/20 bg-[#09101d]/90 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <p className="font-head text-sm font-bold text-slate-100">Payroll Period Report</p>
                        <p className="mt-1 text-xs text-slate-500">Export by Monday–Sunday week, first half (1–15), second half (16–month end), or any custom range.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button onClick={() => applyRange(weekRange())} className="rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 py-2 mono text-[10px] tracking-wider text-sky-300 hover:bg-sky-400/10">THIS WEEK</button>
                            <button onClick={() => applyRange(semiMonthRange(new Date(), 1))} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 mono text-[10px] tracking-wider text-slate-300 hover:bg-white/[0.06]">1–15</button>
                            <button onClick={() => applyRange(semiMonthRange(new Date(), 2))} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 mono text-[10px] tracking-wider text-slate-300 hover:bg-white/[0.06]">16–END</button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                        <label className="block">
                            <span className="mono text-[9px] tracking-widest text-slate-600">FROM</span>
                            <input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} className="mt-1 block min-h-10 rounded-lg border border-white/10 bg-[#050811] px-3 text-sm text-slate-200" />
                        </label>
                        <label className="block">
                            <span className="mono text-[9px] tracking-widest text-slate-600">TO</span>
                            <input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} className="mt-1 block min-h-10 rounded-lg border border-white/10 bg-[#050811] px-3 text-sm text-slate-200" />
                        </label>
                        <button onClick={() => loadReport()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-slate-300 hover:bg-white/[0.07]">
                            <RefreshCw size={14} className={reportLoading ? 'animate-spin' : ''} /> LOAD
                        </button>
                        <button onClick={exportCsv} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#ea7f2b]/30 bg-[#ea7f2b]/10 px-4 text-xs font-bold text-[#fee396] hover:bg-[#ea7f2b]/15">
                            <Download size={14} /> EXPORT CSV
                        </button>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">PERIOD</p><p className="mt-1 text-sm text-slate-200">{fmtDate(reportStart)} → {fmtDate(reportEnd)}</p></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">SHIFT RECORDS</p><p className="mt-1 font-head text-xl font-bold text-slate-100">{report.summary?.present || 0}</p></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">REGULAR</p><p className="mt-1 font-head text-xl font-bold text-emerald-300">{report.summary?.regular || '00:00'}</p></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">OVERTIME</p><p className="mt-1 font-head text-xl font-bold text-[#fee396]">{report.summary?.overtime || '00:00'}</p></div>
                </div>
            </section>
        </div>
    );
}
