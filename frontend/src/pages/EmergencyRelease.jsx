import { useCallback, useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleHelp, ClipboardCheck, DoorOpen, Loader2, LockKeyhole, Radio, ShieldAlert, Siren, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, formatApiError, useAuth } from '../context/AuthContext';

const responseError = (error) => formatApiError(error?.response?.data?.detail || error?.message);
const when = (date) => date ? new Date(date).toLocaleString('es-MX') : '—';
const statusLabel = {
    SIMULATED_NO_HARDWARE_COMMAND: 'Simulado · sin apertura física',
    GATEWAY_ACKNOWLEDGED_NOT_PHYSICALLY_VERIFIED: 'Gateway respondió · sin verificar físicamente',
    FAILED_OR_UNKNOWN: 'Falló / estado desconocido',
};

export default function EmergencyRelease() {
    const { user } = useAuth();
    const commander = user?.role === 'commander';
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(null);
    const [modal, setModal] = useState(false);
    const [phrase, setPhrase] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [error, setError] = useState('');

    const refresh = useCallback(async () => {
        if (!commander) return;
        try {
            const { data } = await api.get('/emergency/status');
            setStatus(data);
            setError('');
        } catch (err) {
            setError(responseError(err));
        } finally {
            setLoading(false);
        }
    }, [commander]);

    useEffect(() => {
        if (!commander) { setLoading(false); return undefined; }
        refresh();
        const handle = setInterval(refresh, 5000);
        return () => clearInterval(handle);
    }, [commander, refresh]);

    const doors = status?.doors || [];
    const selected = doors.filter((d) => d.eligible);
    const invalid = selected.some((d) => !d.linked);
    const canActivate = Boolean(status?.armed && selected.length && !invalid && !busy);
    const canSimulate = Boolean(selected.length && !invalid && !busy);

    const configure = async (door, eligible) => {
        if (busy || editing) return;
        setEditing(door.id);
        try {
            await api.put(`/emergency/doors/${door.id}`, { eligible });
            toast.success(eligible ? 'Salida incluida en el protocolo' : 'Salida retirada del protocolo');
            await refresh();
        } catch (err) {
            toast.error('No se pudo actualizar la configuración', { description: responseError(err) });
        } finally {
            setEditing(null);
        }
    };

    const simulate = async () => {
        if (!canSimulate) return;
        setBusy(true);
        setLastResult(null);
        try {
            const { data } = await api.post('/emergency/simulate');
            setLastResult(data);
            toast.success('Simulacro registrado · no se enviaron comandos físicos');
            await refresh();
        } catch (err) {
            toast.error('No se pudo registrar el simulacro', { description: responseError(err) });
        } finally {
            setBusy(false);
        }
    };

    const activate = async () => {
        if (!canActivate || !accepted || phrase.trim() !== 'LIBERAR') return;
        setBusy(true);
        setModal(false);
        setLastResult(null);
        setPhrase('');
        setAccepted(false);
        try {
            const { data } = await api.post('/emergency/activate', { confirmation: 'LIBERAR' });
            setLastResult(data);
            if (data.ok) {
                toast.warning('Gateway respondió · verificar físicamente cada salida');
            } else {
                toast.error('Atención: algunas salidas no confirmaron la orden');
            }
            await refresh();
        } catch (err) {
            toast.error('No se pudo confirmar la liberación', { description: responseError(err) });
            setError(responseError(err));
        } finally {
            setBusy(false);
        }
    };

    if (!commander) {
        return (
            <div className="mx-auto max-w-3xl rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center">
                <LockKeyhole size={34} className="mx-auto text-rose-400" />
                <h1 className="mt-4 text-2xl font-bold text-white">Acceso restringido</h1>
                <p className="mt-2 text-sm text-slate-400">Solo el rol Commander puede configurar o solicitar la apertura de emergencia.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="emergency-release-page">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="mono text-[10px] tracking-[0.25em] text-rose-400">KERMA GAMES / SECURITY V2</p>
                    <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
                        <Siren className="text-rose-400" size={30} /> Emergency Door Release
                    </h1>
                    <p className="mt-2 text-sm text-slate-400">Liberación remota de las salidas de evacuación designadas.</p>
                </div>
                <div className={`rounded-xl border px-4 py-3 mono text-xs font-bold tracking-widest ${status?.armed ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                    {status?.armed ? 'MODO REAL HABILITADO' : 'MODO SEGURO · REAL DESHABILITADO'}
                </div>
            </div>

            {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200" role="alert">{error}</div>}
            <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
                <section className="rounded-2xl border border-rose-500/35 bg-gradient-to-b from-[#231018] to-[#0b101c] p-6 sm:p-8">
                    <div className="flex items-center gap-2 text-rose-200">
                        <AlertOctagon size={19} />
                        <span className="mono text-xs font-bold tracking-widest">ACTIVACIÓN DE EMERGENCIA</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">Activa únicamente las puertas seleccionadas para evacuación. La aplicación no controla el sistema cableado de alarma contra incendios.</p>
                    <button
                        data-testid="emergency-activate-button"
                        type="button"
                        onClick={() => { setPhrase(''); setAccepted(false); setModal(true); }}
                        disabled={!canActivate}
                        className="mt-7 flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border-4 border-rose-300/35 bg-gradient-to-b from-red-500 to-red-800 px-4 text-white shadow-[0_0_40px_rgba(239,68,68,0.18)] transition-transform hover:scale-[1.01] focus-visible:outline focus-visible:outline-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {busy ? <Loader2 className="animate-spin" size={32} /> : <Siren size={37} />}
                        <span className="text-lg font-black tracking-widest sm:text-xl">LIBERAR PUERTAS</span>
                        <span className="text-xs font-semibold">EMERGENCY RELEASE</span>
                    </button>
                    <p className="mt-3 text-center text-xs text-slate-400">
                        {!status?.armed ? 'Deshabilitado hasta autorizar la puesta en servicio física.' : selected.length === 0 ? 'Seleccione las salidas de evacuación.' : 'Se requiere confirmación expresa para activar.'}
                    </p>
                    <button
                        data-testid="emergency-simulate-button"
                        type="button"
                        disabled={!canSimulate}
                        onClick={simulate}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-5 py-3 font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
                    >
                        {busy ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
                        EJECUTAR SIMULACRO (SIN ABRIR)
                    </button>
                    <p className="mt-4 text-xs leading-relaxed text-amber-200/90"><AlertTriangle size={15} className="mr-1 inline" /> Nunca sustituye el sistema local independiente de evacuación. Un ACK del Gateway no demuestra liberación física.</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-6">
                    <h2 className="text-lg font-semibold text-white">Estado del sistema</h2>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-xs text-slate-500">Salidas seleccionadas</p>
                            <p className="mt-2 text-3xl font-black text-white">{loading ? '—' : selected.length}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-xs text-slate-500">Gateway</p>
                            <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                                {status?.gatewayOnline ? <><Radio size={16} className="text-emerald-400" /><span className="text-emerald-300">En línea</span></> : <><WifiOff size={16} className="text-amber-400" /><span className="text-amber-300">Sin conexión</span></>}
                            </div>
                        </div>
                    </div>
                    <div className="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                        <div className="flex gap-3">
                            <CircleHelp size={18} className="shrink-0 text-amber-300" />
                            <p className="text-xs leading-relaxed text-slate-300">Tras una activación real, Seguridad/EHS debe comprobar físicamente las salidas, atender cualquier fallo y restablecer los controladores conforme al procedimiento local. Este módulo <strong>no vuelve a bloquear puertas automáticamente</strong>.</p>
                        </div>
                    </div>
                </section>
            </div>

            {lastResult && (
                <section className="rounded-xl border border-sky-500/25 bg-[#0b1220] p-5" aria-live="polite">
                    <h2 className="flex items-center gap-2 font-semibold text-white">
                        {lastResult.mode === 'simulation' ? <CheckCircle2 size={19} className="text-emerald-300" /> : <ShieldAlert size={19} className="text-amber-300" />}
                        {lastResult.mode === 'simulation' ? 'Simulacro terminado — ninguna puerta fue accionada' : 'Orden enviada — comprobación física requerida'}
                    </h2>
                    <p className="mt-2 mono text-[10px] text-slate-500">Incidente {lastResult.incidentId}</p>
                    <div className="mt-4 space-y-2">
                        {lastResult.results?.map((r) => (
                            <div key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-2 text-sm">
                                <span className="text-slate-200">{r.name}</span>
                                <span className={r.result === 'FAILED_OR_UNKNOWN' ? 'text-rose-300' : 'text-amber-200'}>{statusLabel[r.result] || r.result}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><DoorOpen size={20} className="text-sky-400" /> Salidas de emergencia</h2>
                        <p className="mt-1 text-xs text-slate-400">Seleccione únicamente puertas habilitadas para evacuación y verificadas en sitio.</p>
                    </div>
                    <span className="mono text-xs text-slate-500">{selected.length} / {doors.length} seleccionadas</span>
                </div>
                {loading ? <p className="mt-5 text-sm text-slate-400">Cargando puertas…</p> : (
                    <div className="mt-5 grid gap-2 md:grid-cols-2">
                        {doors.map((door) => (
                            <label key={door.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${door.eligible ? 'border-rose-500/25 bg-rose-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                                <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 accent-rose-500"
                                    checked={Boolean(door.eligible)}
                                    disabled={busy || Boolean(editing) || !door.linked}
                                    onChange={(e) => configure(door, e.target.checked)}
                                    aria-label={`Incluir ${door.name} en liberación de emergencia`}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block font-semibold text-slate-100">{door.name}</span>
                                    <span className="mono mt-1 block text-[10px] text-slate-500">{door.code} · Piso {door.floor ?? '—'} · {door.linked ? 'Equipo asociado' : 'Sin controlador físico'}</span>
                                    {door.eligible && <span className="mt-2 block text-xs text-rose-200">Incluida en protocolo</span>}
                                </span>
                                {editing === door.id && <Loader2 size={16} className="animate-spin text-sky-300" />}
                            </label>
                        ))}
                        {doors.length === 0 && <p className="text-sm text-slate-400">No hay puertas configuradas.</p>}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-5 sm:p-6">
                <h2 className="font-semibold text-white">Historial de activaciones y simulacros</h2>
                <div className="mt-4 space-y-2">
                    {(status?.recent || []).map((item) => (
                        <div key={item.incidentId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs">
                            <div>
                                <p className="font-semibold text-slate-200">{item.mode === 'simulation' ? 'SIMULACRO · SIN APERTURA' : 'LIBERACIÓN REAL · VERIFICACIÓN PENDIENTE'}</p>
                                <p className="mt-1 text-slate-500">{when(item.startedAt)} · {item.actor}</p>
                            </div>
                            <div className="mono text-slate-400">{item.count} puertas · {item.state}</div>
                        </div>
                    ))}
                    {!status?.recent?.length && <p className="text-sm text-slate-500">No hay activaciones registradas.</p>}
                </div>
            </section>

            {modal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" role="presentation">
                    <div className="w-full max-w-lg rounded-2xl border-2 border-rose-500/60 bg-[#180c15] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Confirmar apertura real">
                        <div className="flex items-start justify-between">
                            <h2 className="flex items-center gap-2 text-xl font-black text-rose-200"><Siren /> CONFIRMAR EMERGENCIA REAL</h2>
                            <button type="button" aria-label="Cancelar" onClick={() => setModal(false)} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-slate-200">
                            Esto enviará el comando de <strong>apertura permanente</strong> a <strong>{selected.length} puerta(s)</strong> del protocolo. No hay restablecimiento automático. No utilice esta opción para simulacros.
                        </p>
                        <label className="mt-5 flex items-start gap-3 text-sm text-slate-200">
                            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 accent-rose-500" />
                            Confirmo que existe una emergencia real y que se hará verificación física de cada salida.
                        </label>
                        <label className="mt-5 block text-sm font-semibold text-slate-200">
                            Escriba LIBERAR para confirmar
                            <input
                                autoFocus
                                value={phrase}
                                onChange={(e) => setPhrase(e.target.value)}
                                autoComplete="off"
                                className="mt-2 w-full rounded-lg border border-rose-500/40 bg-black/40 px-4 py-3 font-mono text-white outline-none focus:border-rose-300"
                                placeholder="LIBERAR"
                            />
                        </label>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button onClick={() => setModal(false)} className="rounded-xl border border-white/20 px-4 py-3 font-semibold text-slate-200">CANCELAR</button>
                            <button
                                data-testid="confirm-emergency-release"
                                disabled={!accepted || phrase.trim() !== 'LIBERAR' || !canActivate}
                                onClick={activate}
                                className="rounded-xl bg-red-600 px-4 py-3 font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                ACTIVAR AHORA
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
