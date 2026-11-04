import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Network, HardDrive, ScanFace, Nfc, RefreshCw, Plus, Trash2, X, Loader2, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { useSecurity } from '../context/SecurityContext';
import { api } from '../context/AuthContext';

const TYPE_META = {
    gateway: { label: 'GATEWAYS', icon: Network },
    nvr: { label: 'NVR RECORDERS', icon: HardDrive },
    face: { label: 'FACIAL SCANNERS', icon: ScanFace },
    card: { label: 'CARD READERS', icon: Nfc },
};

const STATUS = {
    online: { label: 'ONLINE', dot: 'bg-emerald-400', text: 'text-emerald-300' },
    degraded: { label: 'DEGRADED', dot: 'bg-[#ea7f2b]', text: 'text-orange-300' },
    offline: { label: 'OFFLINE', dot: 'bg-red-500', text: 'text-red-400' },
    unlinked: { label: 'NOT LINKED', dot: 'bg-orange-400', text: 'text-orange-300' },
};

function SignalBars({ value }) {
    const bars = Math.round((value || 0) / 20);
    return (
        <div className="flex items-end gap-0.5 h-3.5">
            {[1, 2, 3, 4, 5].map((b) => (
                <span key={b} className={`w-1 rounded-sm ${b <= bars ? 'bg-sky-400' : 'bg-slate-700'}`} style={{ height: `${b * 20}%` }} />
            ))}
        </div>
    );
}

function DeleteChip({ onConfirm, testid }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 2600);
        return () => clearTimeout(t);
    }, [armed]);
    return (
        <button
            data-testid={testid}
            onClick={() => (armed ? onConfirm() : setArmed(true))}
            className={`flex items-center gap-1 mono text-[10px] tracking-widest transition-colors duration-200 ${
                armed ? 'text-red-300' : 'text-slate-600 hover:text-red-300'
            }`}
        >
            <Trash2 size={12} />
            {armed ? 'SURE?' : ''}
        </button>
    );
}

function DeviceCard({ device, index, onDelete, onNvrSynced, onInventoryRefreshed }) {
    const [syncing, setSyncing] = useState(false);
    // Old manual AC rows may still have status="online" from the legacy
    // Register Device form, even though they have no physical Gateway ID.
    const unlinkedPhysical = (device.type === 'card' || device.type === 'face') && !device.gatewayDeviceId;
    const s = unlinkedPhysical ? STATUS.unlinked : (STATUS[device.status] || STATUS.offline);
    const sync = async () => {
        if (device.type !== 'nvr') {
            await onInventoryRefreshed?.();
            return;
        }
        setSyncing(true);
        try {
            const { data } = await api.post(`/devices/${device.id}/sync-nvr-channels`);
            await onNvrSynced?.();
            toast.success('NVR CHANNELS SYNCED', { description: `${device.name} · ${data.count || 0} channels imported` });
        } catch (err) {
            toast.error('NVR SYNC FAILED', { description: err?.response?.data?.detail || 'Local gateway could not read the NVR channels' });
        } finally {
            setSyncing(false);
        }
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
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-y-2 mono text-[11px]">
                <span className="text-slate-600">IP</span>
                <span className="text-sky-200 text-right">{device.ip || '—'}</span>
                <span className="text-slate-600">FIRMWARE</span>
                <span className="text-slate-300 text-right">{device.fw || '—'}</span>
            </div>
            {device.detail && <p className="mono text-[9px] tracking-wider text-slate-500 mt-3 truncate">{device.detail}</p>}
            {(device.type === 'card' || device.type === 'face') && (
                <div className="mt-3 text-[10px] text-sky-200">
                    {device.gatewayDeviceId ? `GATEWAY ID: ${device.gatewayDeviceId} · ${(device.doors || []).length} OUTPUTS`
                        : 'NOT LINKED TO GATEWAY — configure the physical device there and reconnect the Gateway'}
                </div>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                <SignalBars value={device.signal} />
                <div className="flex items-center gap-4">
                    <button
                        data-testid={`sync-device-${device.id}`}
                        onClick={sync}
                        className="flex items-center gap-1.5 mono text-[10px] tracking-widest text-sky-400 transition-colors duration-200 hover:text-cyan-300"
                    >
                        <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'SYNCING…' : device.type === 'nvr' ? 'SYNC NVR CHANNELS' : 'REFRESH INVENTORY'}
                    </button>
                    <DeleteChip testid={`delete-device-${device.id}`} onConfirm={() => onDelete(device)} />
                </div>
            </div>
        </motion.div>
    );
}

function AddDeviceModal({ open, onClose }) {
    const { addDevice, refreshPhysicalInventory } = useSecurity();
    const [type, setType] = useState('nvr');
    const [controllerId, setControllerId] = useState('');
    const [credentialSet, setCredentialSet] = useState('A');
    const [controllerDoors, setControllerDoors] = useState([1, 2, 3, 4]);
    const [sdkPort, setSdkPort] = useState('8000');
    const [name, setName] = useState('');
    const [ip, setIp] = useState('');
    const [fw, setFw] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (type === 'card') {
                const { data } = await api.post('/devices/provision-controller', {
                    name: name.trim(),
                    gatewayDeviceId: controllerId.trim() || name.trim().toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '').slice(0, 80),
                    ip: ip.trim(),
                    doors: controllerDoors,
                    credentialSet,
                    sdkPort: Number(sdkPort),
                });
                if (!data?.gatewayConfirmed) throw new Error('Gateway did not confirm configuration');
                await refreshPhysicalInventory();
                toast.success('AC REGISTERED THROUGH WINDOWS GATEWAY', {
                    description: 'Configuration acknowledged. Verify the physical controller and each door before granting access.',
                });
            } else {
                await addDevice({ type, name: name.trim(), ip: ip.trim(), fw: fw.trim(), detail: '' });
                toast.success('DEVICE REGISTERED', { description: name });
            }
            setName(''); setIp(''); setFw(''); setType('nvr');
            setControllerId(''); setControllerDoors([1, 2, 3, 4]); setCredentialSet('A'); setSdkPort('8000');
            onClose();
        } catch (err) {
            toast.error('REGISTER FAILED', {
                description: err?.response?.data?.detail || err?.message || 'Could not save device — try again',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        data-testid="add-device-modal"
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-full max-w-md rounded-2xl border border-sky-500/25 bg-[#0b1220] p-6 sm:p-8"
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="mono text-[10px] tracking-[0.35em] text-sky-400">HARDWARE MESH</p>
                                <h2 className="font-display text-xl font-bold text-white mt-2">Register Device</h2>
                            </div>
                            <button data-testid="add-device-close-btn" onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors duration-200">
                                <X size={15} />
                            </button>
                        </div>
                        <form onSubmit={submit} className="mt-6 space-y-4">
                            <div>
                                <label className="mono text-[10px] tracking-widest text-slate-500">DEVICE TYPE</label>
                                <select data-testid="device-type-select" value={type} onChange={(e) => setType(e.target.value)}
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#0f172a] px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-400/60 transition-colors duration-200">
                                    <option value="nvr">NVR RECORDER</option>
                                    <option value="gateway">GATEWAY</option>
                                    <option value="face">FACIAL SCANNER</option>
                                    <option value="card">ACCESS CONTROLLER (AC)</option>
                                </select>
                            </div>
                            <div>
                                <label className="mono text-[10px] tracking-widest text-slate-500">NAME</label>
                                <input data-testid="device-name-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. NVR Principal · Planta 4"
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mono text-[10px] tracking-widest text-slate-500">IP ADDRESS</label>
                                    <input data-testid="device-ip-input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.4.0.21"
                                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 mono text-xs text-sky-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                                </div>
                                <div>
                                    <label className="mono text-[10px] tracking-widest text-slate-500">FIRMWARE</label>
                                    <input data-testid="device-fw-input" value={fw} onChange={(e) => setFw(e.target.value)} placeholder="v6.0.3"
                                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 mono text-xs text-sky-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 transition-colors duration-200" />
                                </div>
                            </div>
                            {type === 'card' && (
                                <div className="space-y-3 rounded-xl border border-sky-400/25 bg-sky-500/[0.04] p-3">
                                    <p className="text-sm font-semibold text-sky-200">REGISTER AC DIRECTLY IN WINDOWS GATEWAY</p>
                                    <p className="text-xs text-slate-400">No local JSON edits. Requires one-time Gateway V4 support. Uses an existing credential set stored on the Windows PC — passwords never enter Railway.</p>
                                    <div>
                                        <label className="mono text-[10px] text-slate-400">STABLE GATEWAY DEVICE ID</label>
                                        <input data-testid="ac-gateway-device-id" value={controllerId}
                                            onChange={e => setControllerId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                            placeholder="Optional — generated from the AC name"
                                            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f172a] p-2.5 font-mono text-xs text-sky-100" />
                                        <p className="mt-1 text-[10px] text-slate-500">Leave blank for an automatic stable ID; use a specific ID only if your inventory requires it.</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="text-xs text-slate-400">SDK PORT
                                            <input value={sdkPort} type="number" min="1" max="65535" onChange={e => setSdkPort(e.target.value)}
                                                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f172a] p-2.5 text-slate-200" />
                                        </label>
                                        <label className="text-xs text-slate-400">LOCAL CREDENTIAL SET
                                            <select value={credentialSet} onChange={e => setCredentialSet(e.target.value)}
                                                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f172a] p-2.5 text-slate-200">
                                                {['A','B','C','D'].map(x => <option key={x} value={x}>{x}</option>)}
                                            </select>
                                        </label>
                                    </div>
                                    <p className="text-xs text-slate-400">PHYSICAL DOOR OUTPUTS</p>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[1, 2, 3, 4].map(number => (
                                            <label key={number} className="flex items-center gap-1.5 text-xs text-slate-200">
                                                <input type="checkbox" checked={controllerDoors.includes(number)} onChange={() =>
                                                    setControllerDoors(prev => prev.includes(number)
                                                        ? prev.filter(n => n !== number) : [...prev, number].sort())} />
                                                {number}
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-orange-200">No employee will automatically receive access to the new controller.</p>
                                </div>
                            )}
                            {type === 'face' && (
                                <p className="text-xs text-orange-200">Facial scanner onboarding still requires the local Gateway inventory configuration.</p>
                            )}
                            <button data-testid="add-device-submit-btn" type="submit" disabled={saving}
                                className={`flex w-full items-center justify-center gap-2 rounded-full py-3 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                                    saving ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-sky-500 text-[#04121f] hover:bg-cyan-400'
                                }`}>
                                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                {saving ? 'REGISTERING…' : type === 'card' ? 'REGISTER AC IN GATEWAY' : 'REGISTER DEVICE'}
                            </button>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default function Devices() {
    const { devices, deleteDevice, refreshCameras, refreshPhysicalInventory } = useSecurity();
    const [refreshing, setRefreshing] = useState(false);
    const refreshGateway = async () => {
        setRefreshing(true);
        try {
            const inventory = await refreshPhysicalInventory();
            const count = inventory.devices.filter((device) =>
                device.gatewayDeviceId && ['card', 'face'].includes(device.type)).length;
            toast.info('GATEWAY INVENTORY REFRESHED', {
                description: `${count} linked access devices. If the new AC is missing, enable it in Windows Gateway and reconnect that Gateway so it reports its inventory.`,
            });
        } catch (err) {
            toast.error('REFRESH FAILED', { description: err?.response?.data?.detail || err?.message });
        } finally {
            setRefreshing(false);
        }
    };
    const [addOpen, setAddOpen] = useState(false);
    const list = devices || [];
    const online = list.filter((d) => d.status === 'online').length;

    const remove = async (dev) => {
        try {
            await deleteDevice(dev.id);
            toast.success('DEVICE REMOVED', { description: dev.name });
        } catch (e) {
            toast.error('DELETE FAILED', { description: 'Could not remove device — try again' });
        }
    };

    const groups = Object.keys(TYPE_META)
        .map((type) => ({ type, items: list.filter((d) => d.type === type) }))
        .filter((g) => g.items.length > 0);

    return (
        <div className="space-y-8" data-testid="devices-page">
            <PageHeader eyebrow={devices === null ? 'HARDWARE MESH // SYNCING…' : `HARDWARE MESH // ${list.length} NODES`} title="Access Devices">
                <div className="flex items-center gap-3">
                    {list.length > 0 && (
                        <span className="mono text-[10px] tracking-widest text-emerald-300 border border-emerald-400/30 bg-emerald-400/10 rounded-full px-4 py-2">
                            {online} ONLINE · {list.length - online} OFFLINE
                        </span>
                    )}
                    <button type="button" onClick={refreshGateway} disabled={refreshing}
                        data-testid="refresh-gateway-inventory"
                        className="flex items-center gap-2 rounded-full border border-sky-400/30 px-4 py-2 text-xs text-sky-200 disabled:opacity-50">
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> REFRESH INVENTORY
                    </button>
                    <button
                        data-testid="add-device-open-btn"
                        onClick={() => setAddOpen(true)}
                        className="flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 font-head font-bold tracking-widest text-sm text-[#04121f] transition-colors duration-200 hover:bg-cyan-400"
                    >
                        <Plus size={15} /> ADD DEVICE
                    </button>
                </div>
            </PageHeader>

            {devices === null ? (
                <p className="mono text-xs tracking-widest text-slate-600 py-16 text-center">SCANNING HARDWARE MESH…</p>
            ) : list.length === 0 ? (
                <button
                    data-testid="empty-devices-cta"
                    onClick={() => setAddOpen(true)}
                    className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sky-500/25 py-20 transition-colors duration-200 hover:border-[#ea7f2b]/50 hover:bg-[#ea7f2b]/5"
                >
                    <Cpu size={28} className="text-sky-500/60" />
                    <p className="mono text-[10px] tracking-[0.25em] text-slate-500">NO DEVICES REGISTERED · ADD YOUR FIRST NVR OR GATEWAY</p>
                </button>
            ) : (
                groups.map((g) => {
                    const Meta = TYPE_META[g.type];
                    return (
                        <section key={g.type}>
                            <div className="flex items-center gap-2.5 mb-4">
                                <Meta.icon size={16} className="text-sky-400" />
                                <h2 className="font-head font-bold tracking-[0.2em] text-slate-200 text-sm">{Meta.label}</h2>
                                <span className="mono text-[10px] text-slate-600">
                                    · {g.items.filter((d) => d.status === 'online').length}/{g.items.length} UP
                                </span>
                                <div className="flex-1 h-px bg-gradient-to-r from-sky-500/25 to-transparent ml-3" />
                            </div>
                            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                                {g.items.map((d, i) => (
                                    <DeviceCard key={d.id} device={d} index={i} onDelete={remove} onNvrSynced={refreshCameras} onInventoryRefreshed={refreshGateway} />
                                ))}
                            </div>
                        </section>
                    );
                })
            )}

            <AddDeviceModal open={addOpen} onClose={() => setAddOpen(false)} />
        </div>
    );
}
