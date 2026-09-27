import { NavLink } from 'react-router-dom';
import { Search, Bell, Building2, LayoutDashboard, Map, Video, Users, Cpu, Activity, LogOut, ShieldCheck } from 'lucide-react';
import dayjs from 'dayjs';
import { useNow } from '../context/SecurityContext';
import { useAuth } from '../context/AuthContext';

const MOBILE_NAV = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/map', label: 'Map', icon: Map },
    { to: '/feeds', label: 'Feeds', icon: Video },
    { to: '/employees', label: 'People', icon: Users },
    { to: '/devices', label: 'Devices', icon: Cpu },
    { to: '/events', label: 'Events', icon: Activity },
    { to: '/officers', label: 'Officers', icon: ShieldCheck, commanderOnly: true },
];

export function Topbar() {
    const now = useNow(1000);
    const { user, logout } = useAuth();
    const initials = user?.name ? user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '—';
    const mobileItems = MOBILE_NAV.filter((n) => !n.commanderOnly || user?.role === 'commander');

    return (
        <header data-testid="topbar" className="sticky top-0 z-30 border-b border-sky-500/10 bg-[#050811]/85 backdrop-blur-xl">
            <div className="flex items-center gap-4 px-5 sm:px-8 h-16">
                <div className="flex items-center gap-2.5 rounded-full border border-sky-500/20 bg-sky-500/5 px-4 py-1.5">
                    <Building2 size={14} className="text-sky-400" />
                    <span className="mono text-[10px] sm:text-xs tracking-widest text-sky-200">HQ NORTH TOWER · FLOOR 04</span>
                </div>

                <div className="hidden md:flex flex-1 max-w-md items-center gap-2 rounded-full border border-white/5 bg-white/[0.03] px-4 py-2 ml-2">
                    <Search size={14} className="text-slate-500" />
                    <input
                        data-testid="global-search-input"
                        placeholder="Search doors, people, devices…"
                        className="w-full bg-transparent text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none"
                    />
                </div>

                <div className="ml-auto flex items-center gap-3 sm:gap-5">
                    <div className="hidden sm:flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 node-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                        </span>
                        <span className="mono text-[10px] tracking-[0.25em] text-red-400">LIVE</span>
                    </div>
                    <span data-testid="topbar-clock" className="mono text-sm text-slate-300 tabular-nums tracking-wider">
                        {dayjs(now).format('HH:mm:ss')}
                    </span>
                    <button
                        data-testid="alerts-pill"
                        className="relative flex items-center gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-3.5 py-1.5 transition-colors duration-200 hover:bg-orange-500/20"
                    >
                        <Bell size={14} className="text-[#fee396]" />
                        <span className="mono text-xs text-gold">02</span>
                    </button>
                    <div className="hidden xl:flex items-center gap-3 border-l border-white/10 pl-5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-600/50 to-[#ea7f2b]/40 ring-2 ring-[#ea7f2b]/60">
                            <span className="font-display font-bold text-[11px] text-white">{initials}</span>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-slate-200 leading-none">{user?.name}</p>
                            <p className="mono text-[9px] text-gold tracking-widest mt-1">{user?.role === 'commander' ? 'COMMANDER' : 'OFFICER'}</p>
                        </div>
                    </div>
                    <button
                        data-testid="logout-btn"
                        onClick={logout}
                        title="End session"
                        className="flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 mono text-[10px] tracking-widest text-slate-400 transition-colors duration-200 hover:text-red-300 hover:border-red-400/40"
                    >
                        <LogOut size={13} />
                        <span className="hidden sm:inline">LOGOUT</span>
                    </button>
                </div>
            </div>

            <nav className="lg:hidden flex gap-2 overflow-x-auto px-5 pb-3">
                {mobileItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            `flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-head font-semibold border ${
                                isActive ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' : 'text-slate-400 border-white/5'
                            }`
                        }
                    >
                        <item.icon size={13} />
                        {item.label}
                    </NavLink>
                ))}
            </nav>
        </header>
    );
}
