import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, animate } from 'framer-motion';
import { Users, DoorOpen, Video, AlertTriangle, ArrowRight, ScanFace, Activity } from 'lucide-react';
import { useSecurity } from '../context/SecurityContext';
import { FloorPlan } from '../components/FloorPlan';
import { EventsFeed } from '../components/EventsFeed';
import { CAMERAS, DEVICES, MARQUEE_ITEMS } from '../data/mockData';

function AnimatedNumber({ value, pad = 0 }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        const c = animate(0, value, { duration: 1.5, ease: 'easeOut', onUpdate: (v) => setDisplay(Math.round(v)) });
        return () => c.stop();
    }, [value]);
    return <span className="tabular-nums">{String(display).padStart(pad, '0')}</span>;
}

const STATS = [
    { id: 'people', label: 'PEOPLE INSIDE', value: 142, total: 200, icon: Users, accent: 'text-sky-300', bar: 'from-sky-500 to-cyan-400', pct: 71 },
    { id: 'doors', label: 'DOORS ONLINE', value: 18, total: 20, icon: DoorOpen, accent: 'text-emerald-300', bar: 'from-emerald-500 to-teal-400', pct: 90 },
    { id: 'cams', label: 'NVR CAMERAS LIVE', value: 4, total: 6, icon: Video, accent: 'text-sky-300', bar: 'from-sky-500 to-blue-500', pct: 67 },
    { id: 'alerts', label: 'CRITICAL ALERTS', value: 2, total: null, icon: AlertTriangle, accent: 'text-red-400', bar: 'from-red-500 to-[#ea7f2b]', pct: 100, pad: 2 },
];

export default function Dashboard() {
    const { doors } = useSecurity();
    const navigate = useNavigate();

    return (
        <div className="space-y-6" data-testid="dashboard-page">
            {/* HERO */}
            <section className="aegis-panel corner-frame relative overflow-hidden rounded-2xl bg-grid px-6 sm:px-10 py-10 sm:py-14">
                <div className="pointer-events-none absolute -left-24 -bottom-28 h-80 w-80 rounded-full bg-[#ea7f2b]/10 blur-[110px]" />
                <div className="absolute -right-24 -top-24 h-96 w-96 opacity-70 pointer-events-none hidden sm:block">
                    <div className="absolute inset-0 rounded-full border border-sky-500/20" />
                    <div className="absolute inset-10 rounded-full border border-sky-500/15" />
                    <div className="absolute inset-20 rounded-full border border-[#ea7f2b]/20" />
                    <div
                        className="absolute inset-0 rounded-full radar-sweep"
                        style={{ background: 'conic-gradient(from 0deg, rgba(56,189,248,0.22), transparent 70deg, transparent 360deg)' }}
                    />
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fee396] gold-glow" />
                </div>

                <p className="mono text-[10px] sm:text-xs tracking-[0.4em] rise-in">
                    <span className="text-gold">KERMA GAMES</span> <span className="text-sky-400">// COMMAND DASHBOARD</span>
                </p>
                <h1 className="mt-5 font-display font-extrabold text-white text-3xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-wide">
                    {['EVERY DOOR. EVERY CAMERA.', 'ONE COMMAND SURFACE.'].map((line, i) => (
                        <span key={line} className="block overflow-hidden pb-1">
                            <motion.span
                                className={`block ${i === 1 ? 'text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-cyan-300 to-[#fee396]' : ''}`}
                                initial={{ y: '110%' }}
                                animate={{ y: 0 }}
                                transition={{ delay: 0.2 + i * 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {line}
                            </motion.span>
                        </span>
                    ))}
                </h1>
                <motion.p
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.7 }}
                    className="mt-5 max-w-xl text-sm sm:text-base text-slate-400"
                >
                    Live gateway telemetry, biometric enrollment and NVR video for HQ North Tower — synchronized in real time.
                </motion.p>
                <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.75, duration: 0.7 }}
                    className="mt-8 flex flex-wrap items-center gap-3"
                >
                    <Link
                        to="/map"
                        data-testid="hero-open-map-btn"
                        className="group flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 font-head font-bold tracking-wide text-sm text-[#04121f] transition-colors duration-200 hover:bg-cyan-400"
                    >
                        OPEN FLOOR MAP
                        <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                    <Link
                        to="/employees"
                        data-testid="hero-enroll-btn"
                        className="flex items-center gap-2 rounded-full border border-[#ea7f2b]/50 px-6 py-3 font-head font-bold tracking-wide text-sm text-[#fee396] transition-colors duration-200 hover:bg-[#ea7f2b]/10"
                    >
                        <ScanFace size={16} />
                        ENROLL EMPLOYEE
                    </Link>
                    <div className="hidden md:flex items-center gap-5 ml-4 mono text-[10px] tracking-widest text-slate-500">
                        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GATEWAY ONLINE</span>
                        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500 rec-blink" /> NVR REC</span>
                        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#ea7f2b]" /> PERIMETER ARMED</span>
                    </div>
                </motion.div>
            </section>

            {/* STATS */}
            <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {STATS.map((s, i) => (
                    <motion.div
                        key={s.id}
                        data-testid={`stat-${s.id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="aegis-panel rounded-xl p-5 transition-colors duration-300 hover:border-[#ea7f2b]/40"
                    >
                        <div className="flex items-center justify-between">
                            <p className="mono text-[10px] tracking-[0.25em] text-slate-500">{s.label}</p>
                            <s.icon size={16} className={s.accent} />
                        </div>
                        <p className={`mt-4 font-display text-3xl sm:text-4xl font-bold ${s.accent}`}>
                            <AnimatedNumber value={s.value} pad={s.pad || 0} />
                            {s.total && <span className="text-lg text-slate-600 font-head font-semibold"> / {s.total}</span>}
                        </p>
                        <div className="mt-4 h-1 rounded-full bg-slate-800 overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full bg-gradient-to-r ${s.bar}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${s.pct}%` }}
                                transition={{ delay: 0.5 + i * 0.08, duration: 1, ease: 'easeOut' }}
                            />
                        </div>
                    </motion.div>
                ))}
            </section>

            {/* MAIN GRID */}
            <section className="grid lg:grid-cols-3 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.7 }}
                    className="lg:col-span-2 aegis-panel rounded-xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                        <div className="flex items-center gap-2.5">
                            <Activity size={15} className="text-sky-400" />
                            <h2 className="font-head font-bold tracking-wider text-slate-100">LIVE ACCESS EVENTS</h2>
                        </div>
                        <Link to="/events" data-testid="view-all-events-link" className="mono text-[10px] tracking-widest text-sky-400 hover:text-[#fee396] transition-colors duration-200">
                            FULL LOG →
                        </Link>
                    </div>
                    <EventsFeed limit={8} />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.7 }}
                    className="space-y-6"
                >
                    <div className="aegis-panel rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-head font-bold tracking-wider text-slate-100">FLOOR 04 · DOOR GRID</h2>
                            <button
                                data-testid="mini-map-open-btn"
                                onClick={() => navigate('/map')}
                                className="mono text-[10px] tracking-widest text-sky-400 hover:text-[#fee396] transition-colors duration-200"
                            >
                                EXPAND →
                            </button>
                        </div>
                        <FloorPlan doors={doors} compact onSelect={() => navigate('/map')} />
                    </div>

                    <div className="aegis-panel rounded-xl p-5">
                        <h2 className="font-head font-bold tracking-wider text-slate-100 mb-4">GATEWAY MESH</h2>
                        <div className="space-y-3">
                            {DEVICES.slice(0, 4).map((d) => (
                                <div key={d.id} className="flex items-center gap-3">
                                    <span
                                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                            d.status === 'online' ? 'bg-emerald-400' : d.status === 'degraded' ? 'bg-[#ea7f2b]' : 'bg-red-500'
                                        }`}
                                    />
                                    <span className="text-xs text-slate-300 flex-1 truncate">{d.name}</span>
                                    <span className="mono text-[10px] text-slate-500">{d.status === 'offline' ? 'DOWN' : `${d.signal}%`}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* CAMERA STRIP */}
            <motion.section
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.7 }}
                className="aegis-panel rounded-xl p-5"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-head font-bold tracking-wider text-slate-100">NVR QUICK VIEW</h2>
                    <Link to="/feeds" data-testid="view-feeds-link" className="mono text-[10px] tracking-widest text-sky-400 hover:text-[#fee396] transition-colors duration-200">
                        ALL CHANNELS →
                    </Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {CAMERAS.slice(0, 4).map((cam) => (
                        <Link key={cam.id} to="/feeds" data-testid={`mini-cam-${cam.code.toLowerCase()}`} className="group relative aspect-video overflow-hidden rounded-lg border border-white/5 scanlines">
                            <img
                                src={cam.img}
                                alt={cam.label}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                style={{ filter: 'grayscale(45%) contrast(1.12) brightness(0.78) saturate(0.75)' }}
                            />
                            <div className="absolute inset-0 bg-sky-900/20 mix-blend-overlay" />
                            <span className="absolute left-2 top-2 flex items-center gap-1.5 mono text-[9px] tracking-widest text-red-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 rec-blink" /> REC
                            </span>
                            <span className="absolute bottom-2 left-2 mono text-[9px] tracking-widest text-sky-200/90">{cam.code}</span>
                        </Link>
                    ))}
                </div>
            </motion.section>

            {/* MARQUEE */}
            <div className="overflow-hidden rounded-xl border border-[#ea7f2b]/15 bg-[#070c18]/80 py-3">
                <div className="marquee-track">
                    {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
                        <span key={i} className="flex items-center mono text-[10px] tracking-[0.3em] text-slate-500">
                            <span className="px-6">{item}</span>
                            <span className="h-1 w-1 rounded-full bg-[#ea7f2b]/60" />
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
