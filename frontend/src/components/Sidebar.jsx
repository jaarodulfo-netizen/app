import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map, Video, Users, Cpu, Activity, Radio } from 'lucide-react';
import { Logo } from './Logo';

const NAV = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, testid: 'nav-dashboard' },
    { to: '/map', label: 'Floor Map & Doors', icon: Map, testid: 'nav-map' },
    { to: '/feeds', label: 'NVR Live Feeds', icon: Video, testid: 'nav-feeds' },
    { to: '/employees', label: 'Enrollment', icon: Users, testid: 'nav-employees' },
    { to: '/devices', label: 'Access Devices', icon: Cpu, testid: 'nav-devices' },
    { to: '/events', label: 'Events Log', icon: Activity, testid: 'nav-events' },
];

export function Sidebar() {
    return (
        <aside
            data-testid="sidebar"
            className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-sky-500/10 bg-[#070c18]/95 backdrop-blur-xl z-40"
        >
            <div className="flex items-center gap-3 px-6 pt-7 pb-6">
                <Logo size={40} />
                <div>
                    <p className="font-display font-bold text-lg tracking-[0.18em] text-white leading-none">AEGISNET</p>
                    <p className="mono text-[9px] tracking-[0.3em] text-sky-400/80 mt-1.5">SECURITY COMMAND OS</p>
                </div>
            </div>

            <div className="mx-6 mb-6 flex items-center gap-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 node-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="mono text-[10px] tracking-widest text-emerald-300">GATEWAY-01 · ONLINE</span>
            </div>

            <nav className="flex-1 px-4 space-y-1.5">
                {NAV.map((item) => (
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
                        <item.icon className="h-4.5 w-4.5 shrink-0" size={18} />
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
                        <div className="h-full w-[98%] rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" />
                    </div>
                    <p className="mono text-[10px] text-slate-500 mt-2 tracking-wider">940 MBPS · 22 NODES ROUTED</p>
                </div>
                <p className="mono text-[9px] text-slate-600 tracking-[0.25em] text-center">AEGISNET v2.4.1 · BUILD 8817</p>
            </div>
        </aside>
    );
}
