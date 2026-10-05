import { AnimatePresence, motion } from 'framer-motion';
import { ScanFace, CreditCard } from 'lucide-react';
import dayjs from 'dayjs';
import { useSecurity } from '../context/SecurityContext';
import { fileUrl } from '../context/AuthContext';

const METHOD_ICON = { FACE: ScanFace, CARD: CreditCard };

const normalize = (value) => String(value ?? '').trim().toLowerCase();

export const isCredentialAccessEvent = (e) => {
    const method = String(e?.method || '').toUpperCase();
    const detail = String(e?.detail || '').toUpperCase();

    if (!['FACE', 'CARD'].includes(method)) return false;
    if (detail.includes('BUTTON') || detail.includes('MAGNET') || detail.includes('LOCK')) return false;

    return true;
};

export const findEmployeeForEvent = (event, employees = []) => {
    const eventPersonIds = [
        event?.personId,
        event?.employeeNo,
        event?.employeeNoString,
    ].map(normalize).filter(Boolean);

    const eventCard = normalize(event?.cardNo);
    const eventName = normalize(event?.person);

    return (employees || []).find((emp) => {
        const employeeIds = [emp?.personId, emp?.employeeNo, emp?.employeeNoString, emp?.id]
            .map(normalize)
            .filter(Boolean);

        if (eventPersonIds.some((id) => employeeIds.includes(id))) return true;

        const cards = [
            ...(Array.isArray(emp?.cardNos) ? emp.cardNos : []),
            emp?.cardNo,
        ].map(normalize).filter(Boolean);

        if (eventCard && cards.includes(eventCard)) return true;
        if (eventName && normalize(emp?.name) === eventName) return true;

        return false;
    });
};

function EventAvatar({ event, employee, large = false }) {
    const size = large ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-11 w-11';
    if (employee?.photoPath) {
        return (
            <img
                src={fileUrl(employee.photoPath)}
                alt={employee.name || event.person || 'Employee'}
                className={`${size} shrink-0 rounded-xl object-cover ring-1 ring-sky-400/30`}
            />
        );
    }

    const name = employee?.name || event?.person || 'Unknown';
    const initials = name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

    return (
        <div className={`${size} shrink-0 rounded-xl border border-sky-500/25 bg-gradient-to-br from-blue-600/30 to-cyan-500/10 flex items-center justify-center`}>
            <span className={`font-display font-bold text-sky-200 ${large ? 'text-xl' : 'text-xs'}`}>{initials || '—'}</span>
        </div>
    );
}

const resultClass = (result) => {
    if (result === 'granted') return 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10';
    if (result === 'denied') return 'text-red-300 border-red-400/40 bg-red-400/10';
    return 'text-sky-300 border-sky-400/30 bg-sky-400/10';
};

const cardFrame = (result, latest) => {
    if (result === 'granted') {
        return latest
            ? 'border-emerald-400/70 bg-emerald-400/[0.07] shadow-[0_0_32px_rgba(52,211,153,0.10)]'
            : 'border-emerald-400/25 bg-emerald-400/[0.025]';
    }
    if (result === 'denied') {
        return latest
            ? 'border-red-400/70 bg-red-400/[0.07] shadow-[0_0_32px_rgba(248,113,113,0.10)]'
            : 'border-red-400/25 bg-red-400/[0.025]';
    }
    return 'border-white/[0.07] bg-white/[0.015]';
};

export function EventsFeed({ limit = 6 }) {
    const { events, employees } = useSecurity();
    const accessEvents = (events || []).filter(isCredentialAccessEvent).slice(0, limit);

    if (accessEvents.length === 0) {
        return (
            <div data-testid="events-feed" className="px-5 py-10 text-center">
                <p className="mono text-[10px] tracking-[0.25em] text-slate-600">AWAITING CARD OR FACIAL ACCESS…</p>
            </div>
        );
    }

    return (
        <div data-testid="events-feed" className="p-3 sm:p-4 space-y-3">
            <AnimatePresence initial={false}>
                {accessEvents.map((e, index) => {
                    const latest = index === 0;
                    const Icon = METHOD_ICON[String(e.method || '').toUpperCase()] || ScanFace;
                    const employee = findEmployeeForEvent(e, employees || []);
                    const displayName = employee?.name || e.person || 'UNKNOWN PERSON';

                    return (
                        <motion.div
                            key={e.id}
                            layout
                            initial={{ opacity: 0, y: -14 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className={`rounded-xl border transition-all ${cardFrame(e.result, latest)} ${latest ? 'p-5 sm:p-6' : 'p-3.5 sm:p-4'}`}
                        >
                            {latest ? (
                                <div className="flex items-center gap-4 sm:gap-5">
                                    <EventAvatar event={e} employee={employee} large />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`mono text-[10px] tracking-[0.18em] px-2.5 py-1 rounded border ${resultClass(e.result)}`}>
                                                {String(e.result || 'status').toUpperCase()}
                                            </span>
                                            <span className="flex items-center gap-1.5 mono text-[10px] tracking-widest text-slate-500">
                                                <Icon size={12} className="text-[#fee396]" />
                                                {String(e.method || '').toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="mt-3 font-display text-xl sm:text-2xl font-bold text-white truncate">{displayName}</p>
                                        <p className="mt-2 mono text-[11px] sm:text-xs tracking-wider text-slate-300 truncate">
                                            {e.doorCode ? `${e.doorCode} · ` : ''}{e.door || 'UNKNOWN DOOR'}
                                        </p>
                                        <p className="mt-1 mono text-[10px] tracking-widest text-slate-500 tabular-nums">
                                            {dayjs(e.ts).format('HH:mm:ss')}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3">
                                    <EventAvatar event={e} employee={employee} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-200 truncate">{displayName}</p>
                                        <p className="mono text-[10px] text-slate-500 tracking-wider truncate">
                                            {e.doorCode ? `${e.doorCode} · ` : ''}{e.door || 'UNKNOWN DOOR'} · {String(e.method || '').toUpperCase()}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`mono text-[9px] tracking-wider px-2 py-1 rounded border ${resultClass(e.result)}`}>
                                            {String(e.result || 'status').toUpperCase()}
                                        </span>
                                        <p className="mt-1.5 mono text-[9px] text-slate-600 tabular-nums">{dayjs(e.ts).format('HH:mm:ss')}</p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
