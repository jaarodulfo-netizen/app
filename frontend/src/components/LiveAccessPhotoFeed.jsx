import { AnimatePresence, motion } from 'framer-motion';
import { ScanFace, CreditCard, UserRound } from 'lucide-react';
import dayjs from 'dayjs';
import { useSecurity } from '../context/SecurityContext';
import { fileUrl } from '../context/AuthContext';
import { findEmployeeForEvent, isCredentialAccessEvent } from './EventsFeed';

const iconFor = (method) => String(method || '').toUpperCase() === 'CARD' ? CreditCard : ScanFace;

function Photo({ employee, event }) {
    if (employee?.photoPath) {
        return (
            <img
                src={fileUrl(employee.photoPath)}
                alt={employee.name || event.person || 'Employee'}
                className="h-full w-full object-cover"
            />
        );
    }

    return (
        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-sky-500/15 to-blue-700/10">
            <UserRound size={28} className="text-sky-300/60" />
        </div>
    );
}

export function LiveAccessPhotoFeed({ limit = 5 }) {
    const { events, employees } = useSecurity();
    const accessEvents = (events || []).filter(isCredentialAccessEvent).slice(0, limit);

    if (!accessEvents.length) {
        return (
            <div className="rounded-lg border border-dashed border-sky-500/20 py-12 text-center">
                <UserRound size={26} className="mx-auto text-sky-400/40" />
                <p className="mt-3 mono text-[10px] tracking-[0.22em] text-slate-600">WAITING FOR CARD / FACE ACCESS</p>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="live-access-photo-feed">
            <AnimatePresence initial={false}>
                {accessEvents.map((event, index) => {
                    const employee = findEmployeeForEvent(event, employees || []);
                    const Icon = iconFor(event.method);
                    const granted = event.result === 'granted';

                    return (
                        <motion.div
                            key={event.id}
                            layout
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.35 }}
                            className={`overflow-hidden rounded-xl border ${granted ? 'border-emerald-400/35 bg-emerald-400/[0.04]' : event.result === 'denied' ? 'border-red-400/35 bg-red-400/[0.04]' : 'border-white/[0.08] bg-white/[0.02]'}`}
                        >
                            <div className={`grid ${index === 0 ? 'grid-cols-[112px_1fr]' : 'grid-cols-[76px_1fr]'} min-h-[88px]`}>
                                <div className={`relative overflow-hidden ${index === 0 ? 'min-h-[126px]' : 'min-h-[88px]'}`}>
                                    <Photo employee={employee} event={event} />
                                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
                                    <span className="absolute bottom-2 left-2 flex items-center gap-1 mono text-[8px] tracking-widest text-white/80">
                                        <Icon size={10} />
                                        {String(event.method || '').toUpperCase()}
                                    </span>
                                </div>
                                <div className="min-w-0 p-3.5 flex flex-col justify-center">
                                    {index === 0 && (
                                        <span className={`mb-2 w-fit rounded border px-2 py-0.5 mono text-[8px] tracking-[0.16em] ${granted ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-red-400/40 bg-red-400/10 text-red-300'}`}>
                                            {String(event.result || 'status').toUpperCase()}
                                        </span>
                                    )}
                                    <p className={`font-semibold text-white truncate ${index === 0 ? 'text-base' : 'text-sm'}`}>
                                        {employee?.name || event.person || 'UNKNOWN PERSON'}
                                    </p>
                                    <p className="mt-1 mono text-[9px] tracking-wider text-slate-400 truncate">
                                        {event.doorCode ? `${event.doorCode} · ` : ''}{event.door || 'UNKNOWN DOOR'}
                                    </p>
                                    <p className="mt-1 mono text-[9px] tracking-widest text-slate-600 tabular-nums">
                                        {dayjs(event.ts).format('HH:mm:ss')}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
