import { AnimatePresence, motion } from 'framer-motion';
import { ScanFace, CreditCard, Radio } from 'lucide-react';
import dayjs from 'dayjs';
import { useSecurity } from '../context/SecurityContext';

const METHOD_ICON = { FACE: ScanFace, CARD: CreditCard, REMOTE: Radio };

const sourceLabel = (e) => {
    const detail = String(e?.detail || '').toUpperCase();
    if (detail.includes('BUTTON')) return 'BUTTON';
    if (detail.includes('LOCK')) return 'MAGNET';
    if (e?.method === 'CARD' || e?.cardNo) return e?.person || 'CARD';
    return e?.person || 'CARD';
};

const resultClass = (result) => {
    if (result === 'granted') return 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10';
    if (result === 'denied') return 'text-red-300 border-red-400/30 bg-red-400/10';
    if (result === 'alarm') return 'text-orange-300 border-orange-400/30 bg-orange-400/10';
    return 'text-sky-300 border-sky-400/30 bg-sky-400/10';
};

export function EventsFeed({ limit = 9 }) {
    const { events } = useSecurity();

    if (events.length === 0) {
        return (
            <div data-testid="events-feed" className="px-5 py-10 text-center">
                <p className="mono text-[10px] tracking-[0.25em] text-slate-600">AWAITING FIRST ACCESS EVENT…</p>
            </div>
        );
    }

    return (
        <div data-testid="events-feed" className="divide-y divide-white/[0.04]">
            <AnimatePresence initial={false}>
                {events.slice(0, limit).map((e) => {
                    const Icon = METHOD_ICON[e.method] || ScanFace;
                    return (
                        <motion.div
                            key={e.id}
                            layout
                            initial={{ opacity: 0, y: -14, backgroundColor: 'rgba(56,189,248,0.08)' }}
                            animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(56,189,248,0)' }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.45 }}
                            className="grid grid-cols-[86px_1fr_auto] sm:grid-cols-[96px_1.2fr_1.4fr_auto_auto] items-center gap-4 px-5 py-3.5"
                        >
                            <span className="mono text-xs text-slate-400 tabular-nums">
                                {dayjs(e.ts).format('HH:mm:ss')}
                            </span>

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
                                        {e.cardNo ? `CARD ${e.cardNo}` : ''}
                                        {e.cardNo && e.source_device ? ' · ' : ''}
                                        {e.source_device || ''}
                                    </p>
                                )}
                            </div>

                            <span className="hidden sm:flex items-center gap-1.5 mono text-[10px] tracking-widest text-slate-500">
                                <Icon size={12} className="text-[#fee396]" />
                                {e.method}
                            </span>

                            <div className="flex items-center gap-3 justify-end">
                                <span className="mono text-[9px] tracking-wider text-slate-600 hidden xl:block">{e.detail}</span>
                                <span className={`mono text-[10px] tracking-widest px-2.5 py-1 rounded border ${resultClass(e.result)}`}>
                                    {String(e.result || 'status').toUpperCase()}
                                </span>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
