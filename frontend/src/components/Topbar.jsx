import { NavLink } from 'react-router-dom';
import { Search, Bell, Building2, LayoutDashboard, Map, Video, Users, Cpu, Activity } from 'lucide-react';
import dayjs from 'dayjs';
import { useNow } from '../context/SecurityContext';

const MOBILE_NAV = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/map', label: 'Map', icon: Map },
    { to: '/feeds', label: 'Feeds', icon: Video },
    { to: '/employees', label: 'People', icon: Users },
    { to: '/devices', label: 'Devices', icon: Cpu },
    { to: '/events', label: 'Events', icon: Activity },
];

export function Topbar() {
    const now = useNow(1000);
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
                        className="relative flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 transition-colors duration-200 hover:bg-amber-400/20"
                    >
                        <Bell size={14} className="text-amber-300" />
                        <span className="mono text-xs text-amber-200">02</span>
                    </button>
                    <div className="hidden xl:flex items-center gap-3 border-l border-white/10 pl-5">
                        <img
                            src="https://images.unsplash.com/photo-1560250097-0b93528c311a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBjb3Jwb3JhdGUlMjBlbXBsb3llZSUyMHBvcnRyYWl0JTIwaGVhZHNob3QlMjBhdmF0YXJ8ZW58MHx8fHwxNzkwNTQwMDcxfDA&ixlib=rb-4.1.0&q=85"
                            alt="Officer"
                            className="h-9 w-9 rounded-full object-cover ring-2 ring-sky-500/40"
                        />
                        <div>
                            <p className="text-xs font-semibold text-slate-200 leading-none">M. Vance</p>
                            <p className="mono text-[9px] text-sky-400 tracking-widest mt-1">SHIFT COMMANDER</p>
                        </div>
                    </div>
                </div>
            </div>

            <nav className="lg:hidden flex gap-2 overflow-x-auto px-5 pb-3">
                {MOBILE_NAV.map((item) => (
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
