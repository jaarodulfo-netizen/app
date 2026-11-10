import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Network, HardDrive, ScanFace, Nfc, RefreshCw, Plus, Trash2, X, Loader2, Cpu, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { useSecurity } from '../context/SecurityContext';
import { api } from '../context/AuthContext';
import { IVMS_ACCESS_DEVICES, IVMS_CONTROLLER_SNAPSHOT_DATE } from '../constants/ivmsControllerInventory';

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

function DeviceCard({ device, index, onDelete, onNvrSynced, onInventoryRefreshed, onRegisterNewController }) {
    const [syncing, setSyncing] = useState(false);
    // Old manual AC rows may still have status="online" from the legacy
    // Register Device form, even though they have no physical Gateway ID.
    const unlinkedPhysical = (device.type === 'card' || device.type === 'face') && (!device.gatewayDeviceId || device.gatewayRegistered !== true);
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
                    {!unlinkedPhysical ? `GATEWAY ID: ${device.gatewayDeviceId} · ${(device.doors || []).length} OUTPUTS`
                        : 'NOT LINKED — cloud inventory only; not a confirmed physical device'}
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
                    {unlinkedPhysical && device.type === 'card' && (
                        <button type="button" onClick={() => onRegisterNewController?.(device)}
                            className="flex items-center gap-1.5 mono text-[10px] tracking-widest text-orange-300 hover:text-orange-100"
                            data-testid={`register-new-ac-${device.id}`}>
                            <Plus size={12} /> REGISTER IF NEW AC
                        </button>
                    )}
                    <DeleteChip testid={`delete-device-${device.id}`} onConfirm={() => onDelete(device)} />
                </div>
            </div>
        </motion.div>
    );
}

function AddDeviceModal({ open, onClose, initialDevice }) {
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
    const [confirmedNewController, setConfirmedNewController] = useState(false);
    const [acStagingReady, setAcStagingReady] = useState(null);
    const [controllerInventory, setControllerInventory] = useState(null);
    const [inventoryError, setInventoryError] = useState('');

    useEffect(() => {
        if (!open || type !== 'card') return;
        let active = true;
        setControllerInventory(null);
        setInventoryError('');
        // Use the read-only cloud inventory before offering a NEW controller
        // registration. Cloud IPs are display metadata, not proof of LAN identity.
        api.get('/devices/reconciliation')
            .then(({ data }) => {
                if (active) setControllerInventory([
                    ...(data?.linked || []),
                    ...(data?.pending || []),
                ].filter(device => device.type === 'card'));
            })
            .catch(() => {
                if (active) setInventoryError('CLOUD INVENTORY UNAVAILABLE — check RECONCILE before trying a new AC.');
            });
        return () => { active = false; };
    }, [open, type]);

    // Match the same effective ID the server will receive. An optional blank
    // ID still generates a stable ID from the name, which may already exist.
    const effectiveControllerId = controllerId.trim() || name.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '').slice(0, 80);
    const existingCloudControllers = (controllerInventory || []).filter(device =>
        (ip.trim() && device.displayIp?.trim() === ip.trim()) ||
        (effectiveControllerId && device.gatewayDeviceId === effectiveControllerId) ||
        (name.trim() && device.name?.trim().toLowerCase() === name.trim().toLowerCase())
    );

    useEffect(() => {
        if (!open) return;
        let mounted = true;
        setAcStagingReady(null);
        api.get('/gateway/status')
            .then(({ data }) => { if (mounted) setAcStagingReady(data?.online === true && data?.acStagingReady === true); })
            .catch(() => { if (mounted) setAcStagingReady(false); });
        return () => { mounted = false; };
    }, [open]);

    useEffect(() => {
        if (open && initialDevice?.type === 'card') {
            setType('card');
            setName(initialDevice.name || '');
            setIp(initialDevice.displayIp || initialDevice.ip || '');
            setControllerId('');
            setConfirmedNewController(false);
        }
    }, [open, initialDevice]);

    const submit = async (e) => {
        e.preventDefault();
        if (type === 'card' && (inventoryError || controllerInventory === null)) {
            toast.error('INVENTORY CHECK REQUIRED', { description: inventoryError || 'Cloud controller inventory has not finished loading.' });
            return;
        }
        if (type === 'card' && existingCloudControllers.length > 0) {
            toast.warning('EXISTING AC FOUND — DO NOT REGISTER A DUPLICATE', {
                description: 'Use Enrollment → Access Levels to assign the doors of this existing AC, or reconcile its Gateway identity first.',
            });
            return;
        }
        if (type === 'card' && !acStagingReady) {
            toast.error('AC-ONLY ADD-ON NOT READY', { description: 'Install and start the isolated V5 AC-only Gateway add-on first. Existing access systems were not modified.' });
            return;
        }
        if (type === 'card' && !confirmedNewController) {
            toast.warning('HARDWARE IDENTITY NOT CONFIRMED', {
                description: 'Confirm that this is a new, separate physical AC, not an existing controller with a reassigned IP.',
            });
            return;
        }
        setSaving(true);
        try {
            if (type === 'card') {
                const { data } = await api.post('/devices/provision-controller', {
                    name: name.trim(),
                    gatewayDeviceId: effectiveControllerId,
                    ip: ip.trim(),
                    doors: controllerDoors,
                    credentialSet,
                    sdkPort: Number(sdkPort),
                });
                if (!data?.gatewayConfirmed || data?.restartRequired !== true) throw new Error('Gateway did not confirm safe staged AC configuration');
                await refreshPhysicalInventory();
                toast.warning('AC SAVED — CONTROLLED GATEWAY RESTART REQUIRED', {
                    duration: 14000,
                    description: 'Config backed up and SDK login verified. The new AC is NOT active yet. Restart Windows Gateway in a supervised maintenance window, then refresh inventory.',
                });
            } else {
                await addDevice({ type, name: name.trim(), ip: ip.trim(), fw: fw.trim(), detail: '' });
                toast.success('DEVICE REGISTERED', { description: name });
            }
            setName(''); setIp(''); setFw(''); setType('nvr');
            setControllerId(''); setControllerDoors([1, 2, 3, 4]); setCredentialSet('A'); setSdkPort('8000'); setConfirmedNewController(false);
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
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        data-testid="add-device-modal" role="dialog" aria-modal="true" aria-labelledby="register-device-title"
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="relative flex w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-sky-500/25 bg-[#0b1220] p-4 sm:p-6"
                    >
                        <div className="flex shrink-0 items-start justify-between">
                            <div>
                                <p className="mono text-[10px] tracking-[0.35em] text-sky-400">HARDWARE MESH</p>
                                <h2 id="register-device-title" className="font-display text-xl font-bold text-white mt-2">Register Device</h2>
                            </div>
                            <button data-testid="add-device-close-btn" onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors duration-200">
                                <X size={15} />
                            </button>
                        </div>
                        <form onSubmit={submit} className="mt-4 flex min-h-0 flex-1 flex-col">
                            <div data-testid="add-device-scroll-area" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-4 pr-1 touch-pan-y">
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
                                    <p className="text-xs text-slate-400">Add NEW ACs without editing Windows JSON: one-time isolated V5 AC-only add-on required. Your existing engine, SDK, card sync and doors are unchanged. New AC becomes active only after a supervised Gateway restart.</p>
                                    {controllerInventory === null && !inventoryError && (
                                        <p className="text-xs text-slate-400">Checking existing cloud AC IDs and IPs…</p>
                                    )}
                                    {inventoryError && <p className="text-xs text-orange-300">{inventoryError}</p>}
                                    {existingCloudControllers.length > 0 && (
                                        <div data-testid="existing-ac-cloud-match" className="rounded-lg border border-orange-400/40 bg-orange-400/5 p-3 space-y-2">
                                            <p className="text-xs font-bold text-orange-200">EXISTING ACCESS CONTROLLER FOUND</p>
                                            {existingCloudControllers.map(existing => (
                                                <p key={existing.id} className="mono text-[10px] text-orange-100">
                                                    {existing.name} · {existing.gatewayDeviceId || 'NOT LINKED'} · {existing.displayIp || 'NO IP'}
                                                    {existing.linked ? ' · GATEWAY LINKED' : ' · CLOUD ONLY'}
                                                </p>
                                            ))}
                                            <p className="text-[11px] text-slate-300">
                                                This is a cloud inventory match, not proof of which physical device owns this IP.
                                                Do not create another AC with the same address. For a linked existing AC,
                                                open Enrollment → Access Levels and select its verified door outputs.
                                                If NOT LINKED, investigate its real Gateway ID in RECONCILE before assigning access.
                                            </p>
                                            <Link to="/employees?accessLevels=1" onClick={onClose}
                                                data-testid="existing-ac-access-levels-link"
                                                className="inline-flex rounded-lg border border-sky-400/30 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/10">
                                                OPEN ACCESS LEVELS
                                            </Link>
                                        </div>
                                    )}
                                    {acStagingReady === null ? (
                                        <p className="text-xs text-slate-400">Checking Windows AC-only staging capability…</p>
                                    ) : acStagingReady === false ? (
                                        <p data-testid="ac-addon-not-ready" className="rounded-lg border border-orange-400/25 p-2 text-xs text-orange-200">AC-ONLY ADD-ON NOT READY. Install V5 on the existing Windows Gateway once, restart it, then reopen this form. No provisioning request will be sent before that.</p>
                                    ) : (
                                        <p data-testid="ac-addon-ready" className="text-xs text-emerald-300">AC-ONLY ADD-ON READY · new AC will be staged pending supervised restart</p>
                                    )}
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
                                    <label className="flex items-start gap-2 rounded-lg border border-orange-400/30 p-2.5 text-xs text-orange-200">
                                        <input type="checkbox" checked={confirmedNewController}
                                            onChange={e => setConfirmedNewController(e.target.checked)}
                                            className="mt-0.5" />
                                        I confirm this is a NEW physical AC, not an existing controller whose IP or name changed. No employee gets access automatically.
                                    </label>
                                </div>
                            )}
                            {type === 'face' && (
                                <p className="text-xs text-orange-200">Facial scanner onboarding still requires the local Gateway inventory configuration.</p>
                            )}
                            </div>
                            <div className="shrink-0 border-t border-white/10 bg-[#0b1220] pt-3">
                            <button data-testid="add-device-submit-btn" type="submit" disabled={saving || (type === 'card' && (!acStagingReady || !confirmedNewController || controllerDoors.length === 0 || controllerInventory === null || !!inventoryError || existingCloudControllers.length > 0))}
                                className={`flex w-full items-center justify-center gap-2 rounded-full py-3 font-head font-bold tracking-widest text-sm transition-colors duration-200 ${
                                    saving ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-sky-500 text-[#04121f] hover:bg-cyan-400'
                                }`}>
                                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                {saving ? 'STAGING…' : type === 'card' ? 'SAVE NEW AC TO GATEWAY' : 'REGISTER DEVICE'}
                            </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}


// Read-only site inventory audit. iVMS screenshot metadata is not a verified
// Gateway identity, cannot grant rights and must not rewrite Windows device IPs.
function IvmsControllerSnapshot({ report, localDevices }) {
    const cloudControllers = [...(report?.linked || []), ...(report?.pending || [])]
        .filter(device => device.type === 'card');
    const folded = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    return (
        <div data-testid="ivms-current-ac-inventory" className="rounded-xl border border-sky-400/20 bg-sky-500/[0.035] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="mono text-[10px] tracking-widest text-sky-200">iVMS CURRENT IP REFERENCE · {IVMS_CONTROLLER_SNAPSHOT_DATE}</p>
                <span className="mono text-[10px] text-slate-400">7 ACCESS CONTROLLERS · 2 DOOR STATIONS</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
                Operator-supplied iVMS snapshot after network re-IP. Comparison is read-only.
                A matching name/IP in the cloud is NOT proof that the Windows Gateway owns that physical controller.
                Do not change Person IDs, Gateway IDs, door rights or passwords based only on this table.
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.035] mono text-[9px] tracking-wider text-slate-400">
                        <tr>
                            <th className="px-3 py-2">iVMS NAME</th>
                            <th className="px-3 py-2">EXPECTED IP</th>
                            <th className="px-3 py-2">DEVICE TYPE</th>
                            <th className="px-3 py-2">APP RECORD</th>
                            <th className="px-3 py-2">WINDOWS CONFIG</th>
                        </tr>
                    </thead>
                    <tbody>
                        {IVMS_ACCESS_DEVICES.map(item => {
                            const ipMatches = cloudControllers.filter(d => d.displayIp === item.ip);
                            const nameHints = cloudControllers.filter(d =>
                                folded(d.name) === folded(item.name) ||
                                item.previousCloudNames.some(alias => folded(d.name) === folded(alias)));
                            const cloudMatch = ipMatches.length === 1 ? ipMatches[0] : null;
                            const legacyHint = ipMatches.length === 0 && nameHints.length === 1 ? nameHints[0] : null;
                            const windows = localDevices?.filter(d => d.ip === item.ip) || [];
                            const windowsMatch = windows.length === 1 ? windows[0] : null;
                            const cloudStatus = item.kind === 'door-station'
                                ? 'NOT A DS-K2804 AC'
                                : ipMatches.length > 1 ? 'DUPLICATE CLOUD IP — REVIEW'
                                : cloudMatch ? (cloudMatch.linked ? 'CLOUD LINKED · VERIFY GATEWAY IP' : 'CLOUD ONLY · NOT LINKED')
                                : legacyHint ? `POSSIBLE OLD RECORD · ${legacyHint.displayIp || 'NO IP'}`
                                : 'NO MATCHING CLOUD IP';
                            const windowsStatus = !localDevices
                                ? 'LOCAL CONFIG UNAVAILABLE'
                                : windows.length > 1 ? 'DUPLICATE LOCAL IP'
                                : windowsMatch ? `${windowsMatch.gatewayDeviceId} · ${windowsMatch.enabled ? 'CONFIGURED' : 'DISABLED'}`
                                : 'NOT IN LOCAL CONFIG';
                            return (
                                <tr key={item.ip} data-testid={item.name === '1-AC3' ? 'ivms-ac-1-ac3' : undefined}
                                    className={`border-t border-white/5 ${item.name === '1-AC3' ? 'bg-orange-400/[0.08]' : ''}`}>
                                    <td className="px-3 py-2 font-semibold text-slate-200">{item.name}</td>
                                    <td className="px-3 py-2 font-mono text-sky-200">{item.ip}</td>
                                    <td className="px-3 py-2 text-slate-400">{item.kind === 'controller' ? 'ACCESS CONTROLLER' : 'DOOR STATION'}</td>
                                    <td className={`px-3 py-2 text-[11px] ${cloudMatch?.linked ? 'text-sky-300' : 'text-orange-200'}`}>{cloudStatus}</td>
                                    <td className="px-3 py-2 text-[11px] text-slate-400">{windowsStatus}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="mt-3 text-[11px] text-orange-200">
                1-AC3 · 192.168.3.222: The employee permissions cannot be sent until the
                Windows Gateway confirms a real controller ID and door outputs, followed by an
                authorized Access Level assignment and hardware read-back. iVMS ONLINE alone is insufficient.
                MG-AC1 and MG-AC2 are door stations, not 4-door card controllers.
            </p>
        </div>
    );
}

function InventoryReconciliationModal({ open, onClose, onRegisterController }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [localDevices, setLocalDevices] = useState(null);
    const [localStatus, setLocalStatus] = useState('');

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setError('');
        setLocalDevices(null);
        setLocalStatus('Checking actual Windows Gateway inventory…');
        api.get('/devices/gateway-local-inventory')
            .then(({ data }) => { if (!cancelled) { setLocalDevices(data.devices || []); setLocalStatus(''); } })
            .catch(err => {
                if (!cancelled) setLocalStatus(
                    err?.response?.status === 412
                        ? 'V5 AC-only module not installed. Actual Windows IP assignments are not available yet.'
                        : (err?.response?.data?.detail || 'Could not reach local Gateway configuration')
                );
            });
        api.get('/devices/reconciliation')
            .then(({ data }) => { if (!cancelled) setReport(data); })
            .catch(err => { if (!cancelled) setError(err?.response?.data?.detail || 'Could not read reconciliation report'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" data-testid="device-reconciliation-modal">
            <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl border border-sky-400/30 bg-[#0b1220] p-5 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="mono text-[10px] tracking-[0.25em] text-sky-400">HARDWARE IDENTITY AUDIT · READ ONLY</p>
                        <h2 className="mt-2 text-xl font-bold text-slate-100">Reconcile Gateway Inventory</h2>
                        <p className="mt-1 text-xs text-slate-400">Compares cloud records with device identities confirmed by the Windows Gateway. It does NOT modify IDs, IPs, cards, doors or access levels.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-400"><X size={17} /></button>
                </div>
                {loading && <p className="mt-8 text-sky-300">Reading confirmed inventory…</p>}
                {error && <p className="mt-5 text-red-300">{typeof error === 'string' ? error : 'Inventory report failed'}</p>}
                {report && !loading && (
                    <div className="mt-5 space-y-5">
                        <div className="grid grid-cols-3 gap-3">
                            {[['GATEWAY LINKED', report.summary.linked], ['PENDING LINK', report.summary.pending], ['DUPLICATE IP GROUPS', report.summary.duplicateIpGroups]].map(([label, value]) =>
                                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <div className="text-xl font-bold text-sky-200">{value}</div>
                                    <div className="mono text-[9px] text-slate-400">{label}</div>
                                </div>
                            )}
                        </div>
                        <div className="rounded-lg border border-orange-400/25 bg-orange-400/5 px-4 py-3 text-xs text-orange-100">
                            Cloud IPs are display records, not verified Windows endpoints. With V5, Windows inventory is read directly without PowerShell. A duplicate IP will block creation; do not erase or rename existing doors automatically. V5 does not reconfigure existing facial IPs.
                        </div>
                        <div>
                            <p className="mono text-[10px] tracking-widest text-emerald-300">LIVE WINDOWS CONFIG — READ ONLY</p>
                            {localStatus && <p className="mt-2 text-xs text-orange-300">{localStatus}</p>}
                            {localDevices && (
                                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-white/10">
                                    {localDevices.map(item => (
                                        <div key={item.gatewayDeviceId} className="flex flex-wrap justify-between gap-2 border-b border-white/5 px-3 py-2 text-xs">
                                            <span className="text-slate-200">{item.name} <span className="text-slate-500">[{item.gatewayDeviceId}]</span></span>
                                            <span className="font-mono text-sky-200">{item.ip || 'NO IP'} · {item.role}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <IvmsControllerSnapshot report={report} localDevices={localDevices} />
                        {(report.duplicateIps || []).length > 0 && (
                            <div className="space-y-2">
                                <p className="mono text-[10px] tracking-widest text-orange-300">IP ADDRESS CONFLICTS — DO NOT AUTO-LINK</p>
                                {report.duplicateIps.map(conflict => (
                                    <div key={conflict.displayIp} className="rounded-lg border border-orange-400/20 p-3 text-xs">
                                        <span className="font-mono text-orange-200">{conflict.displayIp}</span>
                                        <span className="ml-3 text-slate-300">{conflict.devices.map(d => d.name + (d.linked ? ' [Gateway]' : ' [Cloud only]')).join(' · ')}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div>
                            <p className="mono text-[10px] tracking-widest text-sky-300">PENDING CLOUD RECORDS — {report.pending.length}</p>
                            <div className="mt-2 space-y-2">
                                {report.pending.map(item => (
                                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-400/20 bg-white/[0.02] px-3 py-3">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-200">{item.name}</p>
                                            <p className="mono text-[10px] text-slate-400">{item.displayIp || 'NO IP'} · {item.type === 'card' ? 'ACCESS CONTROLLER' : 'FACIAL'} · NOT LINKED</p>
                                            {!!item.possibleMatches?.length && (
                                                <p className="mt-1 text-xs text-orange-300">Possible name match (NOT verified): {item.possibleMatches.map(d => d.name + ' [' + d.gatewayDeviceId + ']').join(', ')}</p>
                                            )}
                                            {!!localDevices?.find(d => d.ip && d.ip === item.displayIp) && (
                                                <p className="mt-1 text-xs text-orange-200" data-testid="local-ip-collision">
                                                    WINDOWS IP CONFLICT: {localDevices.find(d => d.ip === item.displayIp)?.name} [{localDevices.find(d => d.ip === item.displayIp)?.gatewayDeviceId}] already uses {item.displayIp}. Do not register a duplicate.
                                                </p>
                                            )}
                                        </div>
                                        {item.type === 'card' ? (
                                            <button type="button" disabled={!!localDevices?.some(d => d.ip && d.ip === item.displayIp)}
                                                onClick={() => onRegisterController(item)}
                                                className="rounded-lg border border-sky-400/35 px-3 py-2 text-[11px] text-sky-200 disabled:cursor-not-allowed disabled:opacity-40">
                                                REGISTER ONLY IF NEW AC
                                            </button>
                                        ) : (
                                            <span className="text-[11px] text-slate-400">FACIAL: REQUIRES VERIFIED HARDWARE ID</span>
                                        )}
                                    </div>
                                ))}
                                {!report.pending.length && <p className="p-3 text-xs text-emerald-200">No pending records.</p>}
                            </div>
                        </div>
                        <div>
                            <p className="mono text-[10px] tracking-widest text-emerald-300">REGISTERED BY GATEWAY — {report.linked.length}</p>
                            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-white/10">
                                {report.linked.map(item => (
                                    <div key={item.id} className="flex justify-between gap-2 border-b border-white/5 px-3 py-2 text-xs">
                                        <span className="text-slate-200">{item.name} <span className="text-slate-500">({item.gatewayDeviceId})</span></span>
                                        <span className="font-mono text-slate-400">{item.displayIp || 'NO IP'} · {item.gatewayOnline ? 'GATEWAY ONLINE' : 'NOT CONFIRMED ONLINE'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function Devices() {
    const { devices, deleteDevice, refreshCameras, refreshPhysicalInventory } = useSecurity();
    const [refreshing, setRefreshing] = useState(false);
    const [reconcileOpen, setReconcileOpen] = useState(false);
    const [controllerToRegister, setControllerToRegister] = useState(null);
    const refreshGateway = async () => {
        setRefreshing(true);
        try {
            const inventory = await refreshPhysicalInventory();
            const physical = inventory.devices.filter(device => ['card', 'face'].includes(device.type));
            const linked = physical.filter(device => device.gatewayRegistered === true && !!device.gatewayDeviceId);
            const pending = physical.length - linked.length;
            toast.info('INVENTORY VIEW REFRESHED', {
                description: `${linked.length} Gateway-linked · ${pending} cloud records not linked. Refresh only reads inventory. For a truly NEW AC, use RECONCILE → REGISTER ONLY IF NEW AC. Existing renamed/re-IP'd devices need identity verification.`,
            });
        } catch (err) {
            toast.error('REFRESH FAILED', { description: err?.response?.data?.detail || err?.message });
        } finally {
            setRefreshing(false);
        }
    };
    const [addOpen, setAddOpen] = useState(false);
    const list = devices || [];
    const online = list.filter((d) =>
        d.type === 'card' || d.type === 'face'
            ? d.gatewayRegistered === true && d.gatewayOnline === true
            : d.status === 'online'
    ).length;

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
                    <button type="button" onClick={() => setReconcileOpen(true)}
                        data-testid="reconcile-inventory-open"
                        className="flex items-center gap-2 rounded-full border border-orange-400/30 px-4 py-2.5 text-xs text-orange-200">
                        <ShieldAlert size={15} /> RECONCILE
                    </button>
                    <button
                        data-testid="add-device-open-btn"
                        onClick={() => { setControllerToRegister(null); setAddOpen(true); }}
                        className="flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 font-head font-bold tracking-widest text-sm text-[#04121f] transition-colors duration-200 hover:bg-cyan-400"
                    >
                        <Plus size={15} /> ADD DEVICE
                    </button>
                </div>
            </PageHeader>

            <div className="rounded-xl border border-orange-400/20 bg-orange-400/[0.035] px-4 py-3 text-xs text-slate-300"
                data-testid="device-reip-reference-notice">
                The studio's AC IPs changed. Older cloud device cards can still display the previous addresses.
                Open <button type="button" onClick={() => setReconcileOpen(true)}
                    className="font-semibold text-sky-300 underline underline-offset-2">RECONCILE</button>
                {' '}to compare all 7 updated iVMS controller IPs and the 2 separate door stations.
                This comparison does not write to the local Gateway or change employee permissions.
            </div>

            {devices === null ? (
                <p className="mono text-xs tracking-widest text-slate-600 py-16 text-center">SCANNING HARDWARE MESH…</p>
            ) : list.length === 0 ? (
                <button
                    data-testid="empty-devices-cta"
                    onClick={() => { setControllerToRegister(null); setAddOpen(true); }}
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
                                    · {g.items.filter(d => (d.type === 'card' || d.type === 'face')
                                        ? d.gatewayRegistered === true && d.gatewayOnline === true
                                        : d.status === 'online').length}/{g.items.length} UP
                                </span>
                                <div className="flex-1 h-px bg-gradient-to-r from-sky-500/25 to-transparent ml-3" />
                            </div>
                            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                                {g.items.map((d, i) => (
                                    <DeviceCard key={d.id} device={d} index={i} onDelete={remove} onNvrSynced={refreshCameras}
                                        onInventoryRefreshed={refreshGateway}
                                        onRegisterNewController={(device) => {
                                            setControllerToRegister({ ...device, displayIp: device.ip });
                                            setAddOpen(true);
                                        }} />
                                ))}
                            </div>
                        </section>
                    );
                })
            )}

            <InventoryReconciliationModal open={reconcileOpen} onClose={() => setReconcileOpen(false)}
                onRegisterController={(device) => {
                    setControllerToRegister(device);
                    setReconcileOpen(false);
                    setAddOpen(true);
                }} />
            <AddDeviceModal open={addOpen} initialDevice={controllerToRegister}
                onClose={() => { setAddOpen(false); setControllerToRegister(null); }} />
        </div>
    );
}
