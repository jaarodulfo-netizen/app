import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, Radio } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useSecurity } from '../context/SecurityContext';

dayjs.extend(relativeTime);

export function EventsFeed({ limit = 9 }) {
    const { events } = useSecurity();
    return (
        <div data-testid="events-feed" className="divide-y divide-white/[0.04]">
            <AnimatePresence initial={false}>
                {events.slice(0, limit).map((e) => (
                    <motion.div
                        key={e.id}
                        layout
                        initial={{ opacity: 0, y: -18, backgroundColor: 'rgba(56,189,248,0.09)' }}
                        animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(56,189,248,0)' }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.55, ease: 'easeOut' }}
                        className="flex items-center gap-3.5 px-5 py-3.5"
                    >
                        {e.method === 'REMOTE' ? (
                            <Radio size={16} className="shrink-0 text-sky-400" />
                        ) : e.result === 'granted' ? (
                            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                        ) : (
                            <XCircle size={16} className="shrink-0 text-red-400" />
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-200 truncate">{e.person}</p>
                            <p className="mono text-[10px] text-slate-500 tracking-wider mt-0.5 truncate">
                                {e.doorCode} · {e.door?.toUpperCase()} — {e.zone}
                            </p>
                        </div>
                        <div className="text-right shrink-0">
                            <span
                                className={`mono text-[10px] tracking-widest px-2 py-1 rounded border ${
                                    e.result === 'granted'
                                        ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                                        : 'text-red-300 border-red-400/30 bg-red-400/10'
                                }`}
                            >
                                {e.result === 'granted' ? 'GRANTED' : 'DENIED'}
                            </span>
                            <p className="mono text-[10px] text-slate-500 mt-1.5">{dayjs(e.ts).fromNow()}</p>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
