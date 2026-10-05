import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, animate } from 'framer-motion';
import { Users, DoorOpen, Video, AlertTriangle, ArrowRight, ScanFace, Cctv, WifiOff, HardDrive, Network, Nfc } from 'lucide-react';
import { useSecurity } from '../context/SecurityContext';
import { LiveAccessPhotoFeed } from '../components/LiveAccessPhotoFeed';
import { MARQUEE_FALLBACK } from '../data/mockData';

function AnimatedNumber({ value, pad = 0 }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        const c = animate(0, value, { duration: 1.2, ease: 'easeOut', onUpdate: (v) => setDisplay(Math.round(v)) });
        return () => c.stop();
    }, [value]);
    return <span className="tabular-nums">{String(display).padStart(pad, '0')}</span>;
}

export default function Dashboard() {
    const { doors, employees, cameras, devices } = useSecurity();
    const navigate = useNavigate();

    const enrolled = employees?.length ?? 0;
    const doorsOnline = doors.filter((d) => d.status !== 'alarm').length;
    const camList = cameras || [];
    const camsLive = camList.filter((c) => c.status === 'live').length;
    const alarms = doors.filter((d) => d.status === 'alarm').length;
    const devList = devices || [];
    const devOnline = devList.filter((d) => d.status === 'online').length;
    const problemDevices = devList
        .filter((d) => d.status !== 'online')
        .sort((a, b) => {
            const rank = { offline: 0, degraded: 1 };
            return (rank[a.status] ?? 2) - (rank[b.status] ?? 2);
        });

    const deviceIcon = (type) => {
        if (type === 'nvr') return HardDrive;
        if (type === 'gateway') return Network;
        if (type === 'face') return ScanFace;
        if (type === 'card') return Nfc;
        return WifiOff;
    };

    const STATS = [
        { id: 'people', label: 'ENROLLED PERSONNEL', value: enrolled, icon: Users, accent: 'text-sky-300', bar: 'from-sky-500 to-cyan-400', pct: enrolled ? 100 : 0 },
        { id: 'doors', label: 'DOORS ONLINE', value: doorsOnline, total: doors.length, icon: DoorOpen, accent: 'text-emerald-300', bar: 'from-emerald-500 to-teal-400', pct: Math.round((doorsOnline / doors.length) * 100) },
        { id: 'cams', label: 'CAMERAS LIVE', value: camsLive, total: camList.length || null, icon: Video, accent: 'text-sky-300', bar: 'from-sky-500 to-blue-500', pct: camList.length ? Math.round((camsLive / camList.length) * 100) : 0 },
        { id: 'alerts', label: 'CRITICAL ALERTS', value: alarms, icon: AlertTriangle, accent: 'text-red-400', bar: 'from-red-500 to-[#ea7f2b]', pct: alarms ? 100 : 0, pad: 2 },
    ];

    const marqueeItems =
        devList.length || enrolled || camList.length
            ? [
                  `${devOnline}/${devList.length} HARDWARE NODES ONLINE`,
                  `${enrolled} CREDENTIALS ENROLLED`,
                  `${camsLive}/${camList.length} CHANNELS STREAMING`,
                  'PERIMETER ARMED · LEVEL 2',
                  'SYSTEM NOMINAL',
                  'ALL TELEMETRY ENCRYPTED',
              ]
            : MARQUEE_FALLBACK;

    const previewCams = camList.filter((c) => c.img).slice(0, 4);

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
                            {s.total != null && <span className="text-lg text-slate-600 font-head font-semibold"> / {s.total}</span>}
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
                            <WifiOff size={15} className={problemDevices.length ? 'text-red-400' : 'text-emerald-400'} />
                            <div>
                                <p className="mono text-[9px] tracking-[0.28em] text-slate-600">SYSTEM HEALTH</p>
                                <h2 className="font-head font-bold tracking-wider text-slate-100">DEVICES REQUIRING ATTENTION</h2>
                            </div>
                        </div>
                        <Link to="/devices" className="mono text-[10px] tracking-widest text-sky-400 hover:text-[#fee396] transition-colors duration-200">
                            MANAGE DEVICES →
                        </Link>
                    </div>

                    {problemDevices.length === 0 ? (
                        <div className="px-6 py-12 flex flex-col items-center justify-center text-center">
                            <div className="h-12 w-12 rounded-full border border-emerald-400/25 bg-emerald-400/10 flex items-center justify-center">
                                <Network size={22} className="text-emerald-300" />
                            </div>
                            <p className="mt-4 font-head font-bold tracking-wider text-emerald-300">ALL REGISTERED DEVICES ONLINE</p>
                            <p className="mt-2 mono text-[10px] tracking-widest text-slate-600">
                                {devOnline}/{devList.length} HARDWARE NODES REPORTING NORMALLY
                            </p>
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 gap-3 p-4">
                            {problemDevices.slice(0, 8).map((d) => {
                                const DeviceIcon = deviceIcon(d.type);
                                const offline = d.status === 'offline';
                                return (
                                    <Link
                                        key={d.id}
                                        to="/devices"
                                        className={`group rounded-xl border p-4 transition-colors duration-200 ${
                                            offline
                                                ? 'border-red-400/35 bg-red-500/[0.06] hover:border-red-400/60'
                                                : 'border-orange-400/30 bg-orange-400/[0.05] hover:border-orange-400/55'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`h-10 w-10 rounded-lg border flex items-center justify-center shrink-0 ${
                                                offline
                                                    ? 'border-red-400/30 bg-red-500/10'
                                                    : 'border-orange-400/30 bg-orange-400/10'
                                            }`}>
                                                <DeviceIcon size={18} className={offline ? 'text-red-300' : 'text-orange-300'} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-slate-100 truncate">{d.name}</p>
                                                    <span className={`mono text-[9px] tracking-widest shrink-0 ${offline ? 'text-red-300' : 'text-orange-300'}`}>
                                                        {String(d.status || 'unknown').toUpperCase()}
                                                    </span>
                                                </div>
                                                <p className="mt-1 mono text-[10px] tracking-wider text-slate-500 truncate">
                                                    {String(d.type || 'device').toUpperCase()} · {d.ip || 'NO IP'}
                                                </p>
                                                <p className="mt-2 mono text-[9px] tracking-wider text-slate-600 truncate">
                                                    {d.detail || (offline ? 'DEVICE IS NOT RESPONDING' : 'DEVICE REPORTING DEGRADED HEALTH')}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.7 }}
                    className="space-y-6"
                >
                    <div className="aegis-panel rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="mono text-[9px] tracking-[0.28em] text-sky-400">CREDENTIAL ACTIVITY</p>
                                <h2 className="mt-1 font-head font-bold tracking-wider text-slate-100">LIVE ACCESS</h2>
                            </div>
                            <Link
                                to="/events"
                                className="mono text-[10px] tracking-widest text-sky-400 hover:text-[#fee396] transition-colors duration-200"
                            >
                                FULL LOG →
                            </Link>
                        </div>
                        <LiveAccessPhotoFeed limit={5} />
                    </div>

                    <div className="aegis-panel rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-head font-bold tracking-wider text-slate-100">GATEWAY MESH</h2>
                            <Link to="/devices" className="mono text-[10px] tracking-widest text-sky-400 hover:text-[#fee396] transition-colors duration-200">
                                MANAGE →
                            </Link>
                        </div>
                        {devList.length === 0 ? (
                            <p className="mono text-[10px] tracking-widest text-slate-600 py-3">
                                NO DEVICES REGISTERED · <Link to="/devices" className="text-sky-400 hover:text-[#fee396]">ADD YOUR FIRST NVR →</Link>
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {devList.slice(0, 4).map((d) => (
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
                        )}
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
                {previewCams.length === 0 ? (
                    <Link
                        to="/feeds"
                        data-testid="empty-cams-cta"
                        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-sky-500/25 py-12 transition-colors duration-200 hover:border-[#ea7f2b]/50 hover:bg-[#ea7f2b]/5"
                    >
                        <Cctv size={26} className="text-sky-500/60" />
                        <p className="mono text-[10px] tracking-[0.25em] text-slate-500">NO CAMERAS REGISTERED · ADD YOUR NVR CHANNELS</p>
                    </Link>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {previewCams.map((cam) => (
                            <Link key={cam.id} to="/feeds" data-testid={`mini-cam-${cam.code?.toLowerCase()}`} className="group relative aspect-video overflow-hidden rounded-lg border border-white/5 scanlines">
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
                )}
            </motion.section>

            {/* MARQUEE */}
            <div className="overflow-hidden rounded-xl border border-[#ea7f2b]/15 bg-[#070c18]/80 py-3">
                <div className="marquee-track">
                    {[...marqueeItems, ...marqueeItems].map((item, i) => (
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
