import { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, Fingerprint, RefreshCw, Save, ScanFace, TimerReset, Users, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { useSecurity } from '@/context/SecurityContext';
import { api, fileUrl, useAuth } from '@/context/AuthContext';
import { buildAttendanceRoster, secondsToHHMM } from '@/lib/attendanceRoster';

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

function monthRange(base = new Date()) {
    return [
        localDateString(new Date(base.getFullYear(), base.getMonth(), 1)),
        localDateString(new Date(base.getFullYear(), base.getMonth() + 1, 0)),
    ];
}
function previousMonthRange(base = new Date()) {
    return monthRange(new Date(base.getFullYear(), base.getMonth() - 1, 1));
}

function csvCell(value) {
    const raw = String(value ?? '');
    // Prevent spreadsheet apps interpreting employee names as formulas.
    const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
}

function FacePhoto({ employee }) {
    if (!employee?.photoPath) {
        const initials = String(employee?.name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
        return <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-700/50 flex items-center justify-center font-bold text-sky-200" title="No photograph saved in V2">{initials || '?'}</div>;
    }
    return <img src={fileUrl(employee.photoPath)} alt={employee.name} className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-sky-500/25" loading="lazy" />;
}

export default function Attendance() {
    const { devices, employees, refreshEmployees } = useSecurity();
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
    const [rosterSearch, setRosterSearch] = useState('');
    const [rosterFilter, setRosterFilter] = useState('all');
    const [expandedEmployeeId, setExpandedEmployeeId] = useState(null);
    const loadedPeriod = report?.start === reportStart && report?.end === reportEnd;
    const periodRows = useMemo(() => loadedPeriod ? (report.rows || []) : [], [loadedPeriod, report.rows]);
    const roster = useMemo(() => buildAttendanceRoster(employees || [], periodRows), [employees, periodRows]);
    const visibleRoster = useMemo(() => roster.people.filter(item => {
        const e = item.employee;
        const searchText = `${e.name || ''} ${e.personId || ''} ${e.cardNo || ''} ${e.role || ''}`.toLocaleLowerCase();
        const matchesName = searchText.includes(rosterSearch.trim().toLocaleLowerCase());
        const matchesStatus = rosterFilter === 'all' || (rosterFilter === 'with' && item.shiftCount > 0)
            || (rosterFilter === 'without' && item.shiftCount === 0)
            || (rosterFilter === 'review' && item.requiresReview > 0);
        return matchesName && matchesStatus;
    }), [roster.people, rosterSearch, rosterFilter]);

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
        refreshEmployees?.().catch(() => toast.error('EMPLOYEE REGISTRY UNAVAILABLE'));
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

    const exportRosterCsv = async () => {
        let current = report;
        if (current?.start !== reportStart || current?.end !== reportEnd) {
            try {
                const res = await api.get('/attendance/report', { params: { start: reportStart, end: reportEnd } });
                current = res.data;
                setReport(current);
            } catch (err) {
                toast.error('EXPORT FAILED', { description: err?.response?.data?.detail || 'Could not load period' });
                return;
            }
        }
        const employeeData = buildAttendanceRoster(employees || [], current?.rows || []);
        const headers = [
            'Person ID', 'Employee', 'Position', 'Photo in V2', 'Period Start', 'Period End',
            'Days with Scans', 'Shift Sessions', 'Worked Hours (Provisional if Not Verified)',
            'Regular Hours', 'Recorded Unpaid Breaks (Only Explicit Punches)',
            'Potential Overtime (Not Approved)', 'Scans', 'Needs Review', 'Status'
        ];
        const rows = employeeData.people.map(p => [
            p.employee.personId || p.employee.cardNo || '', p.employee.name, p.employee.role || '',
            p.employee.photoPath ? 'YES' : 'NO', reportStart, reportEnd, p.dayCount, p.shiftCount,
            secondsToHHMM(p.workedSeconds), secondsToHHMM(p.regularSeconds),
            secondsToHHMM(p.breakSeconds), secondsToHHMM(p.overtimeSeconds), p.scanCount,
            p.requiresReview, !p.shiftCount ? 'NO SCANS' : p.requiresReview ? 'REVIEW REQUIRED' : 'PUNCHES VERIFIED'
        ]);
        const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `kerma-payroll-attendance-roster-${reportStart}-to-${reportEnd}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('PERSONNEL PAYROLL-HOURS CSV EXPORTED');
    };

    const exportCsv = async () => {
        let exportData = report;
        if (exportData?.start !== reportStart || exportData?.end !== reportEnd) {
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
            'Potential Overtime',
            'Breaks',
            'Break Count',
            'Verified Punches',
            'Review Reason',
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
            r.breaks || '00:00',
            r.break_count || 0,
            r.punches_confirmed ? 'YES' : 'NO',
            r.warning || '',
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
                description="Attendance Main punch records, shift A/B/C, confirmed breaks and provisional overtime. Overnight Shift C remains on its starting date."
            />

            <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
                <div className="rounded-xl border border-sky-500/15 bg-[#09101d]/90 p-5">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="rounded-lg border border-sky-400/20 bg-sky-400/10 p-2.5 text-sky-300"><ScanFace size={20} /></div>
                        <div>
                            <p className="font-head font-bold text-slate-100">Dedicated Attendance Facial</p>
                            <p className="mono text-[10px] tracking-wider text-slate-500">ONLY EXPLICIT IN / OUT / BREAK PUNCHES ARE CONFIRMED</p>
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
                    <div className="flex items-center gap-2 text-[#fee396]"><TimerReset size={17} /><span className="mono text-[10px] tracking-widest">POTENTIAL OVERTIME</span></div>
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
                    <p className="mono text-[9px] tracking-widest text-slate-600">REGULAR REFERENCE 08:00 · OT SUBJECT TO APPROVAL</p>
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
                                <th className="px-4 py-3 font-medium">POTENTIAL OT</th>
                                <th className="px-4 py-3 font-medium">BREAKS</th>
                                <th className="px-4 py-3 font-medium">SCANS</th>
                                <th className="px-4 py-3 font-medium">STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && data.rows?.length === 0 && (
                                <tr><td colSpan="11" className="px-5 py-12 text-center mono text-[10px] tracking-wider text-slate-600">NO ATTENDANCE RECORDS FOR THIS SHIFT DATE</td></tr>
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
                                    <td className="px-4 py-4 mono text-xs text-slate-400">{row.breaks || '00:00'}</td>
                                    <td className="px-4 py-4 mono text-xs text-slate-400">{row.events}</td>
                                    <td className="px-4 py-4">
                                        <span className={`mono rounded border px-2 py-1 text-[9px] tracking-widest ${
                                            row.status === 'complete'
                                                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                                                : row.status === 'open'
                                                    ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                                                    : 'border-orange-400/30 bg-orange-400/10 text-orange-300'
                                        }`}>{String(row.status || '').toUpperCase()}</span>
                                        {!row.punches_confirmed && <div title={row.warning || ''} className="mt-1 text-[9px] text-amber-300">REVIEW PUNCHES</div>}
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
                        <p className="mt-1 text-xs text-slate-500">Reports by week, half-month, month, or custom range. Unclassified scans are marked for review, never silently treated as confirmed exits or breaks.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button onClick={() => applyRange(weekRange())} className="rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 py-2 mono text-[10px] tracking-wider text-sky-300 hover:bg-sky-400/10">THIS WEEK</button>
                            <button onClick={() => applyRange(semiMonthRange(new Date(), 1))} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 mono text-[10px] tracking-wider text-slate-300 hover:bg-white/[0.06]">1–15</button>
                            <button onClick={() => applyRange(semiMonthRange(new Date(), 2))} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 mono text-[10px] tracking-wider text-slate-300 hover:bg-white/[0.06]">16–END</button>
                            <button onClick={() => applyRange(monthRange())} className="rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 py-2 mono text-[10px] tracking-wider text-sky-300 hover:bg-sky-400/10">THIS MONTH</button>
                            <button onClick={() => applyRange(previousMonthRange())} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 mono text-[10px] tracking-wider text-slate-300 hover:bg-white/[0.06]">LAST MONTH</button>
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

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">PERIOD</p><p className="mt-1 text-sm text-slate-200">{fmtDate(reportStart)} → {fmtDate(reportEnd)}</p></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">SHIFT RECORDS</p><p className="mt-1 font-head text-xl font-bold text-slate-100">{report.summary?.present || 0}</p></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">REGULAR</p><p className="mt-1 font-head text-xl font-bold text-emerald-300">{report.summary?.regular || '00:00'}</p></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">POTENTIAL OVERTIME</p><p className="mt-1 font-head text-xl font-bold text-[#fee396]">{report.summary?.overtime || '00:00'}</p></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">CONFIRMED BREAKS</p><p className="mt-1 font-head text-xl font-bold text-sky-300">{report.summary?.breaks || '00:00'}</p></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><p className="mono text-[9px] tracking-widest text-slate-600">NEEDS REVIEW</p><p className="mt-1 font-head text-xl font-bold text-amber-300">{report.summary?.needs_review || 0}</p></div>
                </div>
                <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full min-w-[1080px] text-left">
                        <thead className="border-b border-white/10 bg-white/[0.03]">
                            <tr className="mono text-[9px] tracking-wider text-slate-400">
                                {['DATE','EMPLOYEE','SHIFT','FIRST IN','LAST OUT','BREAKS','WORKED','REGULAR','POTENTIAL OT','SCANS','STATUS'].map(h => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {(report.rows || []).map((row, idx) => (
                                <tr key={`${row.person}-${row.shift_date}-${idx}`} className="border-b border-white/[0.04] text-xs text-slate-300">
                                    <td className="px-3 py-3 whitespace-nowrap">{row.shift_date}</td>
                                    <td className="px-3 py-3 font-semibold">{row.person}</td>
                                    <td className="px-3 py-3">{row.shift}</td>
                                    <td className="px-3 py-3">{fmt(row.first_in)}</td>
                                    <td className="px-3 py-3">{fmt(row.last_out)}</td>
                                    <td className="px-3 py-3">{row.breaks || '00:00'}</td>
                                    <td className="px-3 py-3">{row.worked}</td>
                                    <td className="px-3 py-3">{row.regular}</td>
                                    <td className="px-3 py-3">{row.overtime}</td>
                                    <td className="px-3 py-3">{row.events}</td>
                                    <td title={row.warning || ''} className={`px-3 py-3 ${row.punches_confirmed ? 'text-emerald-300' : 'text-amber-300'}`}>{row.punches_confirmed ? 'CONFIRMED' : 'REVIEW'}</td>
                                </tr>
                            ))}
                            {!reportLoading && !(report.rows || []).length && (
                                <tr><td colSpan="11" className="px-3 py-8 text-center text-xs text-slate-500">No attendance punches for this range. Check that Attendance Main is connected.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-[11px] text-amber-200/90">Payroll caution: generic successful facial scans are not proof of a check-out or break. Potential overtime is calculated relative to eight hours and requires review/approval.</p>
            </section>

            <section className="rounded-xl border border-sky-500/15 bg-[#09101d]/90 p-5" data-testid="attendance-employee-roster">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Users size={18} className="text-sky-300" />
                            <h2 className="font-head text-lg font-bold text-slate-100">Personnel Attendance &amp; Payroll Hours</h2>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-400">
                            All employees previously enrolled in V2 appear here, including those with zero scans.
                            Each profile uses the original employee photo on file. Select a person for their daily punch details.
                        </p>
                        <p className="mt-1 mono text-[10px] text-slate-500">PERIOD: {reportStart} → {reportEnd} · {roster.people.length} ENROLLED STAFF · {roster.people.filter(p => p.shiftCount > 0).length} WITH SCANS</p>
                    </div>
                    <button type="button" onClick={exportRosterCsv} disabled={!loadedPeriod || employees === null}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 font-head text-xs font-bold text-sky-200 hover:bg-sky-400/15 disabled:opacity-40">
                        <Download size={15} /> EXPORT PAYROLL HOURS CSV
                    </button>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                    <label className="relative min-w-[230px] flex-1">
                        <Search size={15} className="absolute left-3 top-3 text-slate-500" />
                        <input type="search" value={rosterSearch} onChange={e => setRosterSearch(e.target.value)}
                            placeholder="Search employee, card or Person ID"
                            className="min-h-10 w-full rounded-lg border border-white/10 bg-[#050811] pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-sky-400/50" />
                    </label>
                    <select value={rosterFilter} onChange={e => setRosterFilter(e.target.value)}
                        className="min-h-10 rounded-lg border border-white/10 bg-[#050811] px-3 text-xs text-slate-200">
                        <option value="all">ALL ENROLLED</option>
                        <option value="with">WITH SCANS</option>
                        <option value="without">NO SCANS</option>
                        <option value="review">NEEDS REVIEW</option>
                    </select>
                </div>
                {!loadedPeriod && <p className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 text-xs text-amber-200">Date range has changed. Press LOAD above to refresh before reviewing payroll.</p>}
                {employees === null && <p className="mt-5 text-xs text-slate-400">Loading enrolled employees…</p>}
                {employees !== null && loadedPeriod && visibleRoster.length === 0 && (
                    <p className="mt-5 rounded-lg border border-white/10 p-5 text-xs text-slate-400">No employees match this search or attendance filter.</p>
                )}
                {employees !== null && loadedPeriod && (
                    <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {visibleRoster.map(item => {
                            const emp = item.employee;
                            const expanded = expandedEmployeeId === emp.id;
                            return (
                                <article key={emp.id} className="overflow-hidden rounded-lg border border-white/10 bg-[#050811]/80">
                                    <button type="button" onClick={() => setExpandedEmployeeId(expanded ? null : emp.id)}
                                        aria-expanded={expanded}
                                        className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-white/[0.03]">
                                        <FacePhoto employee={emp} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-slate-100">{emp.name}</p>
                                            <p className="mt-1 truncate mono text-[10px] text-slate-400">{emp.role || emp.level || 'EMPLOYEE'} · ID {emp.personId || emp.cardNo || '—'}</p>
                                            <p className={`mt-1 mono text-[9px] ${emp.photoPath ? 'text-sky-300' : 'text-amber-300'}`}>
                                                {emp.photoPath ? 'PHOTO IN V2 (NOT PROOF OF FACIAL ENROLLMENT)' : 'NO PHOTO IN V2'}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className={`mono text-[10px] ${item.shiftCount === 0 ? 'text-slate-400' : item.requiresReview ? 'text-amber-300' : 'text-emerald-300'}`}>
                                                {!item.shiftCount ? 'NO SCANS' : item.requiresReview ? 'REVIEW' : 'PUNCHES VERIFIED'}
                                            </p>
                                            {expanded ? <ChevronUp size={16} className="ml-auto mt-2 text-slate-500" /> : <ChevronDown size={16} className="ml-auto mt-2 text-slate-500" />}
                                        </div>
                                    </button>
                                    <div className="grid grid-cols-4 gap-2 border-t border-white/5 px-4 py-3 text-center">
                                        <div><p className="mono text-[9px] text-slate-500">DAYS</p><p className="mt-1 text-sm font-bold text-white">{item.dayCount}</p></div>
                                        <div><p className="mono text-[9px] text-slate-500">WORKED*</p><p className="mt-1 text-sm font-bold text-white">{secondsToHHMM(item.workedSeconds)}</p></div>
                                        <div><p className="mono text-[9px] text-slate-500">BREAKS</p><p className="mt-1 text-sm font-bold text-sky-200">{secondsToHHMM(item.breakSeconds)}</p></div>
                                        <div><p className="mono text-[9px] text-slate-500">POT. OT</p><p className="mt-1 text-sm font-bold text-amber-200">{secondsToHHMM(item.overtimeSeconds)}</p></div>
                                    </div>
                                    {expanded && (
                                        <div className="space-y-3 border-t border-white/10 px-4 py-4">
                                            {!item.rows.length && <p className="text-xs text-amber-200">No attendance events for this employee during the selected payroll period. This is not proof of absence: confirm device connectivity and enrollment.</p>}
                                            {item.rows.map((shift, idx) => (
                                                <div key={`${shift.shift_date}-${shift.shift}-${idx}`} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                                        <strong className="text-slate-100">{shift.shift_date} · Shift {shift.shift}</strong>
                                                        <span title={shift.warning || ''} className={shift.punches_confirmed ? 'text-emerald-300' : 'text-amber-300'}>
                                                            {shift.punches_confirmed ? 'CONFIRMED PUNCHES' : 'REVIEW REQUIRED'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-xs text-slate-400">
                                                        IN {fmt(shift.first_in)} · OUT {fmt(shift.last_out)} ·
                                                        BREAK {shift.breaks || '00:00'} · WORKED {shift.worked} · POTENTIAL OT {shift.overtime}
                                                    </p>
                                                    {(shift.punches || []).length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {shift.punches.map((p, n) => (
                                                                <span key={n} className="rounded border border-white/10 px-2 py-1 mono text-[10px] text-slate-300">
                                                                    {fmt(p.time)} · {String(p.type || 'unclassified').replace(/_/g, ' ').toUpperCase()}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {shift.warning && <p className="mt-2 text-[11px] text-amber-300">{shift.warning}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
                {loadedPeriod && roster.unmatched.length > 0 && (
                    <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200">
                        {roster.unmatched.length} session(s) could not be linked safely to a V2 employee. They remain in the period report and CSV for review.
                    </p>
                )}
                <p className="mt-4 text-[11px] leading-5 text-slate-500">
                    *Worked hours can be provisional when the Hikvision event does not identify explicit IN/OUT punches.
                    This is an attendance-hours report, not a salary or payroll payment calculation. Monetary payroll requires configured pay rates, paid/unpaid break policy and overtime approvals.
                </p>
            </section>
        </div>
    );
}
