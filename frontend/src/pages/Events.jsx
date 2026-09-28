import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Download, ScanFace, CreditCard, Radio } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { useSecurity } from '../context/SecurityContext';
import { api } from '../context/AuthContext';

const METHOD_ICON = { FACE: ScanFace, CARD: CreditCard, REMOTE: Radio };

const sourceLabel = (e) => {
    const detail = String(e?.detail || '').toUpperCase();
    if (detail.includes('BUTTON')) return 'BUTTON';
    if (detail.includes('LOCK')) return 'MAGNET';
    if (e?.method === 'CARD' || e?.cardNo) return 'CARD';
    return 'CARD';
};

export default function Events() {
    const { events, live, setLive, doors } = useSecurity();
    const [q, setQ] = useState('');
    const [door, setDoor] = useState('all');
    const [result, setResult] = useState('all');
    const [method, setMethod] = useState('all');
    const [gatewayOnline, setGatewayOnline] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            try {
                const { data } = await api.get('/gateway/status');
                if (!cancelled) setGatewayOnline(Boolean(data.online));
            } catch {
                if (!cancelled) setGatewayOnline(false);
            }
        };
        check();
        const t = setInterval(check, 5000);
        return () => { cancelled = true; clearInterval(t); };
    }, []);

    const filtered = useMemo(
        () =>
            events.filter((e) => {
                if (door !== 'all' && e.door !== door) return false;
                if (result !== 'all' && e.result !== result) return false;
                if (method !== 'all' && e.method !== method) return false;
                if (q && !`${e.person} ${e.door} ${e.doorCode}`.toLowerCase().includes(q.toLowerCase())) return false;
                return true;
            }),
        [events, q, door, result, method],
    );

    const chip = (active) =>
        `mono text-[10px] tracking-widest rounded-full border px-3.5 py-1.5 transition-colors duration-200 ${
            active ? 'text-sky-300 border-sky-400/50 bg-sky-500/15' : 'text-slate-500 border-white/10 hover:text-slate-300 hover:border-white/20'
        }`;

    return (
        <div className="space-y-6" data-testid="events-page">
            <PageHeader eyebrow="AUDIT TRAIL // EVERY ACCESS ATTEMPT" title="Real-time Events Log">
                <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-2 rounded-full border px-4 py-2 mono text-[10px] tracking-widest ${
                        gatewayOnline
                            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                            : 'border-orange-400/30 bg-orange-400/10 text-orange-300'
                    }`}>
                        <span className={`h-2 w-2 rounded-full ${gatewayOnline ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                        {gatewayOnline ? 'STUDIO GATEWAY CONNECTED' : 'STUDIO GATEWAY OFFLINE'}
                    </span>
                    <button
                        data-testid="live-toggle"
                        onClick={() => setLive(!live)}
                        className={`flex items-center gap-2.5 rounded-full border px-4 py-2 transition-colors duration-200 ${
                            live ? 'border-red-400/40 bg-red-400/10' : 'border-white/10 bg-white/[0.03]'
                        }`}
                    >
                        <span className={`relative flex h-2 w-2`}>
                            {live && <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 node-ping" />}
                            <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-red-500' : 'bg-slate-600'}`} />
                        </span>
                        <span className={`mono text-[10px] tracking-[0.25em] ${live ? 'text-red-300' : 'text-slate-500'}`}>
                            {live ? 'STREAMING' : 'PAUSED'}
                        </span>
                    </button>
                    <button
                        data-testid="export-events-btn"
                        onClick={() => toast.info('EXPORT QUEUED', { description: 'events-floor04.csv will download when ready' })}
                        className="flex items-center gap-2 rounded-full border border-sky-500/40 px-4 py-2 mono text-[10px] tracking-widest text-sky-300 transition-colors duration-200 hover:bg-sky-500/10"
                    >
                        <Download size={13} /> EXPORT
                    </button>
                </div>
            </PageHeader>

            <div className="aegis-panel rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5">
                        <Search size={14} className="text-slate-500" />
                        <input
                            data-testid="events-search-input"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search person or door…"
                            className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
                        />
                    </div>
                    <select
                        data-testid="events-door-filter"
                        value={door}
                        onChange={(e) => setDoor(e.target.value)}
                        className="rounded-lg border border-white/10 bg-[#0f172a] px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-sky-400/60"
                    >
                        <option value="all">ALL DOORS</option>
                        {(doors || []).map((d) => (
                            <option key={d.id} value={d.name}>
                                {d.code} · {d.name}
                            </option>
                        ))}
                    </select>
                    <div className="flex gap-2">
                        {['all', 'granted', 'denied', 'status', 'alarm'].map((r) => (
                            <button key={r} data-testid={`filter-result-${r}`} onClick={() => setResult(r)} className={chip(result === r)}>
                                {r.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        {['all', 'FACE', 'CARD', 'REMOTE'].map((m) => (
                            <button key={m} data-testid={`filter-method-${m.toLowerCase()}`} onClick={() => setMethod(m)} className={chip(method === m)}>
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                <p className="mono text-[10px] tracking-widest text-slate-600">
                    SHOWING {filtered.length} OF {events.length} EVENTS
                </p>

                <div className="divide-y divide-white/[0.04] border-t border-white/5">
                    <AnimatePresence initial={false}>
                        {filtered.slice(0, 30).map((e) => {
                            const Icon = METHOD_ICON[e.method] || ScanFace;
                            return (
                                <motion.div
                                    key={e.id}
                                    data-testid={`event-row-${e.id}`}
                                    layout
                                    initial={{ opacity: 0, y: -14, backgroundColor: 'rgba(56,189,248,0.08)' }}
                                    animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(56,189,248,0)' }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.45 }}
                                    className="grid grid-cols-[86px_1fr_auto] sm:grid-cols-[96px_1.2fr_1.4fr_auto_auto] items-center gap-4 px-2 py-3.5"
                                >
                                    <span className="mono text-xs text-slate-400 tabular-nums">{dayjs(e.ts).format('HH:mm:ss')}</span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-200 truncate">{sourceLabel(e)}</p>
                                        <p className="mono text-[9px] text-slate-600 tracking-wider mt-0.5 sm:hidden">{e.doorCode}</p>
                                    </div>
                                    <div className="hidden sm:block min-w-0">
                                        <p className="mono text-[11px] text-slate-400 tracking-wider truncate">
                                            {e.doorCode} · {e.door?.toUpperCase()} — {e.zone}
                                        </p>
                                        {(e.cardNo || e.source_device) && (
                                            <p className="mono text-[9px] text-slate-600 tracking-wider mt-0.5 truncate">
                                                {e.cardNo ? `CARD ${e.cardNo}` : ''}{e.cardNo && e.source_device ? ' · ' : ''}{e.source_device || ''}
                                            </p>
                                        )}
                                    </div>
                                    <span className="hidden sm:flex items-center gap-1.5 mono text-[10px] tracking-widest text-slate-500">
                                        <Icon size={12} className="text-[#fee396]" />
                                        {e.method}
                                    </span>
                                    <div className="flex items-center gap-3 justify-end">
                                        <span className="mono text-[9px] tracking-wider text-slate-600 hidden lg:block">{e.detail}</span>
                                        <span
                                            className={`mono text-[10px] tracking-widest px-2.5 py-1 rounded border ${
                                                e.result === 'granted'
                                                    ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                                                    : e.result === 'denied'
                                                        ? 'text-red-300 border-red-400/30 bg-red-400/10'
                                                        : e.result === 'alarm'
                                                            ? 'text-orange-300 border-orange-400/30 bg-orange-400/10'
                                                            : 'text-sky-300 border-sky-400/30 bg-sky-400/10'
                                            }`}
                                        >
                                            {e.result.toUpperCase()}
                                        </span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                    {filtered.length === 0 && (
                        <p className="mono text-xs tracking-widest text-slate-600 text-center py-12">NO EVENTS MATCH CURRENT FILTERS</p>
                    )}
                </div>
            </div>
        </div>
    );
}
