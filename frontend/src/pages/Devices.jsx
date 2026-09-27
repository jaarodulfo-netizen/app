import { useState } from 'react';
import { motion } from 'framer-motion';
import { Network, HardDrive, ScanFace, Nfc, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { DEVICES } from '../data/mockData';

const TYPE_META = {
    gateway: { label: 'GATEWAYS', icon: Network },
    nvr: { label: 'NVR RECORDERS', icon: HardDrive },
    face: { label: 'FACIAL SCANNERS', icon: ScanFace },
    card: { label: 'CARD READERS', icon: Nfc },
};

const STATUS = {
    online: { label: 'ONLINE', dot: 'bg-emerald-400', text: 'text-emerald-300' },
    degraded: { label: 'DEGRADED', dot: 'bg-orange-400', text: 'text-orange-300' },
    offline: { label: 'OFFLINE', dot: 'bg-red-500', text: 'text-red-400' },
};

function SignalBars({ value }) {
    const bars = Math.round(value / 20);
    return (
        <div className="flex items-end gap-0.5 h-3.5">
            {[1, 2, 3, 4, 5].map((b) => (
                <span key={b} className={`w-1 rounded-sm ${b <= bars ? 'bg-sky-400' : 'bg-slate-700'}`} style={{ height: `${b * 20}%` }} />
            ))}
        </div>
    );
}

function DeviceCard({ device, index }) {
    const [syncing, setSyncing] = useState(false);
    const s = STATUS[device.status];
    const sync = () => {
        if (device.status === 'offline') {
            toast.error('DEVICE UNREACHABLE', { description: `${device.name} is offline — check uplink` });
            return;
        }
        setSyncing(true);
        setTimeout(() => {
            setSyncing(false);
            toast.success('SYNC COMPLETE', { description: `${device.name} · config pushed in 0.8s` });
        }, 1300);
    };
    return (
        <motion.div
            data-testid={`device-${device.id}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.5 }}
            className="aegis-panel rounded-xl p-5 transition-colors duration-300 hover:border-sky-400/40"
        >
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-head font-bold tracking-wide text-slate-100 truncate">{device.name}</p>
                <span className={`flex items-center gap-1.5 mono text-[9px] tracking-widest ${s.text} shrink-0`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${device.status !== 'offline' ? 'node-ping' : ''}`} />
                    {s.label}
                </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-y-2 mono text-[11px]">
                <span className="text-slate-600">IP</span>
                <span className="text-sky-200 text-right">{device.ip}</span>
                <span className="text-slate-600">FIRMWARE</span>
                <span className="text-slate-300 text-right">{device.fw}</span>
            </div>
            <p className="mono text-[9px] tracking-wider text-slate-500 mt-3 truncate">{device.detail}</p>
            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                <SignalBars value={device.signal} />
                <button
                    data-testid={`sync-device-${device.id}`}
                    onClick={sync}
                    className="flex items-center gap-1.5 mono text-[10px] tracking-widest text-sky-400 transition-colors duration-200 hover:text-cyan-300"
                >
                    <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? 'SYNCING…' : 'SYNC NOW'}
                </button>
            </div>
        </motion.div>
    );
}

export default function Devices() {
    const groups = Object.keys(TYPE_META).map((type) => ({
        type,
        items: DEVICES.filter((d) => d.type === type),
    }));

    return (
        <div className="space-y-8" data-testid="devices-page">
            <PageHeader eyebrow="HARDWARE MESH // 12 NODES" title="Access Devices">
                <span className="mono text-[10px] tracking-widest text-emerald-300 border border-emerald-400/30 bg-emerald-400/10 rounded-full px-4 py-2">
                    11 ONLINE · 1 OFFLINE
                </span>
            </PageHeader>

            {groups.map((g) => {
                const Meta = TYPE_META[g.type];
                return (
                <section key={g.type}>
                    <div className="flex items-center gap-2.5 mb-4">
                        <Meta.icon size={16} className="text-sky-400" />
                        <h2 className="font-head font-bold tracking-[0.2em] text-slate-200 text-sm">{Meta.label}</h2>
                        <span className="mono text-[10px] text-slate-600">· {g.items.filter((d) => d.status === 'online').length}/{g.items.length} UP</span>
                        <div className="flex-1 h-px bg-gradient-to-r from-sky-500/25 to-transparent ml-3" />
                    </div>
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                        {g.items.map((d, i) => (
                            <DeviceCard key={d.id} device={d} index={i} />
                        ))}
                    </div>
                </section>
                );
            })}
        </div>
    );
}
