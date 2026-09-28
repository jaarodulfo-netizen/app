import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map, Video, Users, Cpu, Activity, Radio, ShieldCheck, Clock3 } from 'lucide-react';
import { api, useAuth } from '../context/AuthContext';

const NAV = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, testid: 'nav-dashboard' },
    { to: '/map', label: 'Floor Map & Doors', icon: Map, testid: 'nav-map' },
    { to: '/feeds', label: 'NVR Live Feeds', icon: Video, testid: 'nav-feeds' },
    { to: '/employees', label: 'Enrollment', icon: Users, testid: 'nav-employees' },
    { to: '/devices', label: 'Access Devices', icon: Cpu, testid: 'nav-devices' },
    { to: '/events', label: 'Events Log', icon: Activity, testid: 'nav-events' },
    { to: '/attendance', label: 'Attendance', icon: Clock3, testid: 'nav-attendance' },
    { to: '/officers', label: 'Officers', icon: ShieldCheck, testid: 'nav-officers', commanderOnly: true },
];

export function Sidebar() {
    const { user } = useAuth();
    const [gatewayOnline, setGatewayOnline] = useState(false);
    const items = NAV.filter((n) => !n.commanderOnly || user?.role === 'commander');

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            try {
                const { data } = await api.get('/gateway/status');
                if (mounted) setGatewayOnline(Boolean(data.online));
            } catch {
                if (mounted) setGatewayOnline(false);
            }
        };
        check();
        const t = setInterval(check, 5000);
        return () => { mounted = false; clearInterval(t); };
    }, []);

    return (
        <aside
            data-testid="sidebar"
            className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-sky-500/10 bg-[#070c18]/95 backdrop-blur-xl z-40"
        >
            <div className="relative flex flex-col gap-2.5 px-6 pt-7 pb-6">
                <div className="pointer-events-none absolute -top-6 -left-6 h-28 w-28 rounded-full bg-[#ea7f2b]/15 blur-2xl" />
                <img src="/kerma-logo.svg" alt="Kerma Games" data-testid="brand-logo" className="h-11 w-auto self-start relative" />
                <p className="mono text-[9px] tracking-[0.3em] text-sky-400/80">SECURITY COMMAND OS</p>
                <div className="h-px w-full bg-gradient-to-r from-[#ea7f2b]/60 via-[#fee396]/30 to-transparent" />
            </div>

            <div className={`mx-6 mb-6 flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${
                gatewayOnline
                    ? 'border-emerald-400/20 bg-emerald-400/5'
                    : 'border-orange-400/20 bg-orange-400/5'
            }`}>
                <span className="relative flex h-2 w-2">
                    {gatewayOnline && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 node-ping" />}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${gatewayOnline ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                </span>
                <span className={`mono text-[10px] tracking-widest ${gatewayOnline ? 'text-emerald-300' : 'text-orange-300'}`}>
                    STUDIO GATEWAY · {gatewayOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
            </div>

            <nav className="flex-1 px-4 space-y-1.5">
                {items.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        data-testid={item.testid}
                        className={({ isActive }) =>
                            `group flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-head font-semibold tracking-wide transition-colors duration-200 border ${
                                isActive
                                    ? 'bg-sky-500/10 text-sky-300 border-sky-500/30 shadow-[0_0_18px_rgba(14,165,233,0.12)]'
                                    : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/[0.04]'
                            }`
                        }
                    >
                        <item.icon size={18} className="shrink-0" />
                        {item.label}
                    </NavLink>
                ))}
            </nav>

            <div className="px-6 pb-7 space-y-4">
                <div className="rounded-lg border border-sky-500/15 bg-[#0b1220]/80 p-4">
                    <div className="flex items-center gap-2 text-sky-300">
                        <Radio size={14} />
                        <span className="mono text-[10px] tracking-widest">UPLINK STABLE</span>
                    </div>
                    <div className="mt-3 h-1 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full w-[98%] rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-[#ea7f2b]" />
                    </div>
                    <p className="mono text-[10px] text-slate-500 mt-2 tracking-wider">940 MBPS · 22 NODES ROUTED</p>
                </div>
                <p className="mono text-[9px] text-slate-600 tracking-[0.25em] text-center">KERMA SECURE v2.4.1 · BUILD 8817</p>
            </div>
        </aside>
    );
}
