import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, ScanFace, CreditCard, UserRound, DoorOpen, Clock } from 'lucide-react';
import dayjs from 'dayjs';
import { useSecurity } from '../context/SecurityContext';
import { fileUrl } from '../context/AuthContext';
import { findEmployeeForEvent, isCredentialAccessEvent } from './EventsFeed';

// Colores por resultado: verde = acceso concedido, rojo = denegado.
const TONE = {
    granted: {
        label: 'ACCESS GRANTED',
        Icon: CheckCircle2,
        text: 'text-emerald-300',
        border: 'border-emerald-400',
        ring: 'shadow-[0_0_0_4px_rgba(52,211,153,0.35),0_0_60px_rgba(52,211,153,0.35)]',
        panel: 'border-emerald-400/50 bg-emerald-500/[0.07]',
        badge: 'bg-emerald-500 text-emerald-950',
        thumb: 'border-emerald-400',
    },
    denied: {
        label: 'ACCESS DENIED',
        Icon: XCircle,
        text: 'text-red-300',
        border: 'border-red-500',
        ring: 'shadow-[0_0_0_4px_rgba(239,68,68,0.4),0_0_60px_rgba(239,68,68,0.4)]',
        panel: 'border-red-500/50 bg-red-500/[0.08]',
        badge: 'bg-red-500 text-red-950',
        thumb: 'border-red-500',
    },
};

const toneFor = (event) => (event?.result === 'granted' ? TONE.granted : TONE.denied);
const MethodIcon = ({ method, size }) =>
    String(method || '').toUpperCase() === 'CARD' ? <CreditCard size={size} /> : <ScanFace size={size} />;

function Face({ employee, iconSize, className = '' }) {
    if (employee?.photoPath) {
        return (
            <img
                src={fileUrl(employee.photoPath)}
                alt={employee.name || 'Employee'}
                className={`h-full w-full object-cover ${className}`}
            />
        );
    }
    return (
        <div className={`h-full w-full flex items-center justify-center bg-slate-900 ${className}`}>
            <UserRound size={iconSize} className="text-slate-500" />
        </div>
    );
}

function useNow(ms = 5000) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(t);
    }, [ms]);
    return now;
}

function ago(ts, now) {
    const s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 60) return `${s}s AGO`;
    if (s < 3600) return `${Math.floor(s / 60)}m AGO`;
    return dayjs(ts).format('DD MMM HH:mm');
}

/**
 * Actividad en vivo de las puertas: la ultima persona que paso, con su foto
 * en grande, en verde si se le concedio el acceso y en rojo si se le nego.
 */
export function AccessSpotlight({ history = 8 }) {
    const { events, employees } = useSecurity();
    const now = useNow();
    const access = (events || [])
        .filter((e) => isCredentialAccessEvent(e) && (e.result === 'granted' || e.result === 'denied'))
        .slice(0, history + 1);
    const [latest, ...recent] = access;

    if (!latest) {
        return (
            <section className="aegis-panel rounded-2xl p-6" data-testid="access-spotlight">
                <p className="mono text-[9px] tracking-[0.28em] text-sky-400">LIVE DOOR ACTIVITY</p>
                <div className="mt-4 rounded-xl border border-dashed border-sky-500/20 py-16 text-center">
                    <UserRound size={34} className="mx-auto text-sky-400/40" />
                    <p className="mt-3 mono text-[10px] tracking-[0.22em] text-slate-600">WAITING FOR CARD / FACE ACCESS</p>
                </div>
            </section>
        );
    }

    const employee = findEmployeeForEvent(latest, employees || []);
    const tone = toneFor(latest);
    const fresh = now - latest.ts < 60_000;

    return (
        <section className="aegis-panel rounded-2xl p-5 sm:p-6" data-testid="access-spotlight">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                    <p className="mono text-[10px] tracking-[0.28em] text-sky-400">LIVE DOOR ACTIVITY</p>
                </div>
                <Link to="/events" className="mono text-[10px] tracking-widest text-sky-400 hover:text-[#fee396] transition-colors duration-200">
                    FULL LOG →
                </Link>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                {/* Ultimo acceso, en grande */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={latest.id}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className={`rounded-2xl border-2 p-4 sm:p-5 transition-opacity ${tone.panel} ${fresh ? '' : 'opacity-75'}`}
                        data-testid="access-spotlight-latest"
                        data-result={latest.result}
                    >
                        <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-stretch">
                            <div className={`relative shrink-0 h-52 w-52 sm:h-60 sm:w-60 overflow-hidden rounded-2xl border-4 ${tone.border} ${fresh ? tone.ring : ''}`}>
                                <Face employee={employee} iconSize={72} />
                                <span className={`absolute left-2 top-2 flex items-center gap-1 rounded-md px-2 py-1 mono text-[10px] font-bold tracking-widest ${tone.badge}`}>
                                    <MethodIcon method={latest.method} size={12} />
                                    {String(latest.method || '').toUpperCase()}
                                </span>
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col justify-center text-center sm:text-left">
                                <div className={`flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1 ${tone.text}`}>
                                    <tone.Icon size={30} strokeWidth={2.5} />
                                    <span className="font-head text-xl sm:text-2xl font-bold tracking-wider whitespace-nowrap">{tone.label}</span>
                                </div>
                                <p className="mt-3 text-xl sm:text-2xl font-semibold text-white break-words">
                                    {employee?.name || latest.person || 'UNKNOWN PERSON'}
                                </p>
                                {employee?.level && (
                                    <p className="mt-1 mono text-[11px] tracking-widest text-slate-400">{employee.level}</p>
                                )}
                                <p className="mt-4 flex items-center justify-center sm:justify-start gap-2 text-sm text-slate-200">
                                    <DoorOpen size={16} className="text-slate-400" />
                                    {latest.doorCode ? `${latest.doorCode} · ` : ''}{latest.door || 'UNKNOWN DOOR'}
                                </p>
                                <p className="mt-2 flex items-center justify-center sm:justify-start gap-2 mono text-xs tracking-widest text-slate-400 tabular-nums">
                                    <Clock size={14} />
                                    {dayjs(latest.ts).format('HH:mm:ss')} · {ago(latest.ts, now)}
                                </p>
                                {latest.result !== 'granted' && latest.detail && (
                                    <p className="mt-3 text-xs text-red-200/80 break-words">{latest.detail}</p>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Accesos anteriores */}
                <div className="min-w-0">
                    <p className="mono text-[9px] tracking-[0.28em] text-slate-500 mb-3">PREVIOUS ACCESSES</p>
                    {recent.length === 0 ? (
                        <p className="mono text-[10px] tracking-widest text-slate-600">NO EARLIER ACTIVITY</p>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                            <AnimatePresence initial={false}>
                                {recent.map((event) => {
                                    const emp = findEmployeeForEvent(event, employees || []);
                                    const t = toneFor(event);
                                    return (
                                        <motion.div
                                            key={event.id}
                                            layout
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="min-w-0"
                                            data-result={event.result}
                                        >
                                            <div className={`relative aspect-square overflow-hidden rounded-xl border-[3px] ${t.thumb}`}>
                                                <Face employee={emp} iconSize={30} />
                                                <span className={`absolute right-1.5 top-1.5 rounded-full ${t.badge}`}>
                                                    <t.Icon size={16} />
                                                </span>
                                            </div>
                                            <p className="mt-1.5 truncate text-xs font-medium text-slate-100">
                                                {emp?.name || event.person || 'UNKNOWN'}
                                            </p>
                                            <p className="truncate mono text-[9px] tracking-wider text-slate-500">
                                                {event.doorCode || event.door || '—'} · {dayjs(event.ts).format('HH:mm:ss')}
                                            </p>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
