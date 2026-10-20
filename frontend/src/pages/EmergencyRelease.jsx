import { useCallback, useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleHelp, ClipboardCheck, DoorOpen, Loader2, LockKeyhole, Radio, RotateCcw, ShieldAlert, Siren, WifiOff, X } from 'lucide-react';
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
    const [bulkMode, setBulkMode] = useState(null);
    const [bulkAccepted, setBulkAccepted] = useState(false);
    const [closeTarget, setCloseTarget] = useState(null);
    const [closeConfirmed, setCloseConfirmed] = useState(false);
    const [phrase, setPhrase] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [error, setError] = useState('');
    const [testDoorId, setTestDoorId] = useState('');
    const [testModal, setTestModal] = useState('');
    const [testPhrase, setTestPhrase] = useState('');
    const [testSiteConfirmed, setTestSiteConfirmed] = useState(false);
    const [testSafetyConfirmed, setTestSafetyConfirmed] = useState(false);
    const [diagnosticFaceId, setDiagnosticFaceId] = useState('');
    const [diagnosticBusy, setDiagnosticBusy] = useState(false);
    const [diagnosticResult, setDiagnosticResult] = useState(null);

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
    const mapped = doors.filter((d) => d.linked);
    const canConfigureGroup = Boolean(status && !status.armed && !busy && !editing && !loading);
    const invalid = selected.some((d) => !d.linked);
    const canActivate = Boolean(status?.armed && selected.length && !invalid && !busy);
    const canSimulate = Boolean(selected.length && !invalid && !busy);
    const recentOpenSimulation = (status?.recent || []).find((item) => item.mode === 'simulation' && item.state === 'completed');
    const activeTest = status?.singleDoorTest;
    const canStartTest = Boolean(status?.singleDoorTestEnabled && !activeTest && !busy && testDoorId && selected.some((d) => d.id === testDoorId));
    const canRestoreTest = Boolean(status?.singleDoorTestEnabled && activeTest && ['release_acknowledged', 'release_unknown', 'restore_unknown'].includes(activeTest.state) && !busy);
    const canFinishTest = Boolean(activeTest && ['restore_acknowledged', 'restore_unknown'].includes(activeTest.state) && !busy);

    const inspectFacial = async () => {
        if (!diagnosticFaceId || diagnosticBusy) return;
        setDiagnosticBusy(true);
        setDiagnosticResult(null);
        try {
            const { data } = await api.get(`/emergency/facial-diagnostics/${diagnosticFaceId}`, { timeout: 75000 });
            setDiagnosticResult(data);
            toast.success('Diagnóstico facial de solo lectura completado');
        } catch (err) {
            toast.error('No se pudo leer el terminal facial', { description: responseError(err) });
        } finally {
            setDiagnosticBusy(false);
        }
    };

    const configure = async (door, eligible) => {
        if (busy || editing || status?.armed) return;
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

    // Preconfigure the ENTIRE group with one server request. Never called
    // during an emergency and never sends an access-controller command.
    const configureAll = async () => {
        if (!canConfigureGroup || !bulkMode || !bulkAccepted) return;
        const mode = bulkMode;
        setBulkMode(null);
        setBulkAccepted(false);
        setBusy(true);
        try {
            const { data } = await api.put('/emergency/doors/bulk', {
                mode, confirmation: 'CONFIGURAR',
            });
            toast.success(mode === 'clear_all'
                ? 'Grupo de evacuación limpiado'
                : `Grupo guardado: ${data.selectedCount} puertas vinculadas`, {
                description: 'Solo se guardó la configuración. No se enviaron órdenes a las puertas.',
            });
            await refresh();
        } catch (err) {
            toast.error('No se pudo configurar el grupo', { description: responseError(err) });
        } finally {
            setBusy(false);
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

    const closeSimulation = async () => {
        if (!closeTarget || !closeConfirmed || busy) return;
        const incidentId = closeTarget.incidentId;
        setBusy(true);
        try {
            const { data } = await api.post(`/emergency/simulations/${incidentId}/close`, {
                confirmation: 'FINALIZAR',
            });
            if (data.state !== 'closed' || data.hardwareCommandsSent !== 0) {
                throw new Error('Unexpected simulation closure response');
            }
            setCloseTarget(null);
            setCloseConfirmed(false);
            setLastResult((prev) => prev?.incidentId === incidentId
                ? { ...prev, state: 'closed' }
                : prev);
            toast.success('Simulacro finalizado y registrado', {
                description: 'No se modificó ninguna puerta ni controlador.',
            });
            await refresh();
        } catch (err) {
            toast.error('No se pudo finalizar el simulacro', { description: responseError(err) });
        } finally {
            setBusy(false);
        }
    };

    // Hardware test: exactly one explicitly chosen door; never the 35-door group.
    const runSingleDoorAction = async () => {
        const action = testModal;
        const expected = action === 'start' ? 'PROBAR' : action === 'restore' ? 'RESTABLECER' : 'VERIFICADO';
        if (busy || !testSiteConfirmed || !testSafetyConfirmed || testPhrase.trim() !== expected) return;
        if (action === 'start' && !canStartTest) return;
        if (action === 'restore' && !canRestoreTest) return;
        if (action === 'finish' && !canFinishTest) return;
        const testId = activeTest?.testId;
        const payload = action === 'start'
            ? { doorId: testDoorId, confirmation: 'PROBAR', supervisedOnSite: true, egressClear: true, localRestorationReady: true }
            : action === 'restore'
                ? { testId, confirmation: 'RESTABLECER', supervisedOnSite: true, egressClear: true, emergencyEnded: true }
                : { testId, confirmation: 'VERIFICADO', physicallyVerified: true, safeEgressVerified: true };
        setBusy(true);
        setTestModal('');
        setTestPhrase('');
        setTestSiteConfirmed(false);
        setTestSafetyConfirmed(false);
        try {
            const { data } = await api.post(`/emergency/test-door/${action}`, payload);
            if (action === 'finish') {
                toast.success('Prueba individual cerrada tras verificación física');
            } else if (data.ok) {
                toast.warning(action === 'start'
                    ? 'Orden alwaysOpen enviada a UNA puerta; verificar físicamente'
                    : 'Orden close enviada a UNA puerta; verificar físicamente');
            } else {
                toast.error('Respuesta del Gateway incierta. Verificar la puerta en sitio antes de repetir.');
            }
            await refresh();
        } catch (err) {
            toast.error('La prueba requiere atención', { description: responseError(err) });
            await refresh();
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
                    <p className="mt-3 text-sm text-slate-300">Libera el grupo de salidas preparado con anticipación. <strong>No necesitas elegir las puertas durante la emergencia.</strong> La aplicación no sustituye el sistema cableado de alarma contra incendios.</p>
                    <button
                        data-testid="emergency-activate-button"
                        type="button"
                        onClick={() => { setPhrase(''); setAccepted(false); setModal(true); }}
                        disabled={!canActivate}
                        className="mt-7 flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border-4 border-rose-300/35 bg-gradient-to-b from-red-500 to-red-800 px-4 text-white shadow-[0_0_40px_rgba(239,68,68,0.18)] transition-transform hover:scale-[1.01] focus-visible:outline focus-visible:outline-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {busy ? <Loader2 className="animate-spin" size={32} /> : <Siren size={37} />}
                        <span className="text-lg font-black tracking-widest sm:text-xl">LIBERAR PUERTAS</span>
                        <span className="text-xs font-semibold">EMERGENCY RELEASE · {selected.length} SALIDAS CONFIGURADAS</span>
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
                    <div className="mt-5 border-t border-white/10 pt-5">
                        <p className="mb-3 font-semibold text-slate-200">Restablecimiento y cierre</p>
                        <button
                            type="button"
                            data-testid="emergency-close-simulation"
                            disabled={!recentOpenSimulation || busy}
                            onClick={() => { setCloseConfirmed(false); setCloseTarget(recentOpenSimulation); }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/35 bg-sky-500/10 px-5 py-3 text-sm font-bold text-sky-200 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <RotateCcw size={18} /> FINALIZAR SIMULACRO
                        </button>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">
                            Cierra el registro del simulacro más reciente. No activa ni restablece cerraduras.
                        </p>
                        <button
                            type="button"
                            disabled
                            title="Pendiente de validación local de seguridad y pruebas físicas"
                            className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-bold text-slate-500"
                        >
                            <LockKeyhole size={18} /> RESTABLECER PUERTAS FÍSICAS · NO DISPONIBLE
                        </button>
                        <p className="mt-2 text-xs text-amber-300/90">
                            El control físico requiere autorización de Seguridad/EHS y pruebas de los mecanismos de salida.
                        </p>
                    </div>
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

            <section className="rounded-2xl border border-sky-500/30 bg-[#0b1220] p-5" data-testid="facial-emergency-diagnostics">
                <div className="flex items-center gap-2">
                    <CircleHelp size={19} className="text-sky-300" />
                    <h2 className="text-lg font-bold text-white">Diagnóstico de faciales · SIN abrir puertas</h2>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                    Consulta modelo, firmware, capacidades ISAPI y estado de la salida. No envía órdenes al relé.
                    El modo de apertura sostenida sigue sin certificarse hasta una prueba física controlada.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <select
                        data-testid="facial-diagnostic-select"
                        className="min-w-0 flex-1 rounded-xl border border-white/20 bg-[#0b1220] p-3 text-sm text-white"
                        value={diagnosticFaceId} onChange={(e) => { setDiagnosticFaceId(e.target.value); setDiagnosticResult(null); }}
                    >
                        <option value="">Seleccionar un terminal facial</option>
                        {(status?.facialDevices || []).map((d) => (
                            <option key={d.id} value={d.id}>{d.name} · {d.id}</option>
                        ))}
                    </select>
                    <button type="button" disabled={!diagnosticFaceId || diagnosticBusy || !status?.gatewayOnline}
                        onClick={inspectFacial} data-testid="facial-diagnostic-run"
                        className="rounded-xl border border-sky-400/40 bg-sky-500/10 px-5 py-3 text-sm font-bold text-sky-200 disabled:opacity-40">
                        {diagnosticBusy ? 'CONSULTANDO EQUIPO…' : 'CONSULTAR SIN ACCIONAR'}
                    </button>
                </div>
                {diagnosticResult && (
                    <div className="mt-4 rounded-lg border border-sky-500/20 bg-black/25 p-4">
                        <p className="text-sm font-bold text-sky-200">{diagnosticResult.name} · Solo lectura</p>
                        <pre className="mt-3 max-h-[380px] overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">
                            {JSON.stringify(diagnosticResult.results, null, 2)}
                        </pre>
                        <p className="mt-3 text-xs text-amber-200">{diagnosticResult.conclusion}</p>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-amber-500/35 bg-[#17140f] p-5 sm:p-6" data-testid="single-door-test-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-bold text-white"><ShieldAlert size={21} className="text-amber-300"/> Prueba física de UNA puerta</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
                            Esta prueba está aislada del botón rojo general. Envía <code>alwaysOpen</code> únicamente a la puerta elegida y permite solicitar <code>close</code> para esa misma puerta, bajo supervisión.
                        </p>
                    </div>
                    <span className={`rounded-lg border px-3 py-2 text-xs font-bold ${status?.singleDoorTestEnabled ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-white/10 text-slate-500'}`}>
                        {status?.singleDoorTestEnabled ? 'PRUEBA INDIVIDUAL HABILITADA' : 'PRUEBA INDIVIDUAL NO HABILITADA'}
                    </span>
                </div>
                <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200">
                    Solo probar con personal presente en ambos lados, sin emergencia activa y con restauración local disponible. No iniciar otra prueba hasta confirmar el estado físico. La respuesta del Gateway NO prueba el estado del relé o de la cerradura.
                </p>
                {!activeTest ? (
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="flex-1 text-xs font-semibold text-slate-300">
                            Elegir UNA puerta vinculada del protocolo
                            <select
                                data-testid="single-test-door-select"
                                className="mt-2 w-full rounded-xl border border-white/20 bg-[#0b1220] p-3 text-sm text-slate-100"
                                value={testDoorId}
                                disabled={busy}
                                onChange={(e) => setTestDoorId(e.target.value)}
                            >
                                <option value="">Seleccionar puerta...</option>
                                {selected.filter((d) => d.linked).map((d) => (
                                    <option key={d.id} value={d.id}>{d.code || '—'} · {d.name} · piso {d.floor ?? '—'}</option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            data-testid="single-test-start"
                            disabled={!canStartTest}
                            onClick={() => { setTestModal('start'); setTestPhrase(''); setTestSiteConfirmed(false); setTestSafetyConfirmed(false); }}
                            className="rounded-xl border border-amber-500/50 bg-amber-500/15 px-5 py-3 text-sm font-bold text-amber-200 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            PROBAR SOLO ESTA PUERTA
                        </button>
                    </div>
                ) : (
                    <div className="mt-5 rounded-xl border border-amber-500/25 bg-black/20 p-4">
                        <p className="text-sm font-bold text-white">{activeTest.doorName}</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-500">Prueba {activeTest.testId}</p>
                        <p className="mt-2 text-sm text-amber-200">Estado: {activeTest.state.replaceAll('_', ' ')} · pendiente de confirmación física</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <button
                                type="button" disabled={!canRestoreTest}
                                data-testid="single-test-restore"
                                onClick={() => { setTestModal('restore'); setTestPhrase(''); setTestSiteConfirmed(false); setTestSafetyConfirmed(false); }}
                                className="rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-3 text-sm font-bold text-sky-200 disabled:opacity-35"
                            ><RotateCcw size={16} className="mr-2 inline"/> RESTABLECER ESTA PUERTA</button>
                            <button
                                type="button" disabled={!canFinishTest}
                                data-testid="single-test-finish"
                                onClick={() => { setTestModal('finish'); setTestPhrase(''); setTestSiteConfirmed(false); setTestSafetyConfirmed(false); }}
                                className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200 disabled:opacity-35"
                            ><CheckCircle2 size={16} className="mr-2 inline"/> CONFIRMAR RESTABLECIMIENTO FÍSICO</button>
                        </div>
                        {['release_unknown', 'restore_unknown'].includes(activeTest.state) && (
                            <p className="mt-3 text-xs text-rose-200">Estado incierto: comprueba físicamente la puerta antes de continuar.</p>
                        )}
                    </div>
                )}
            </section>

            {lastResult && (
                <section className="rounded-xl border border-sky-500/25 bg-[#0b1220] p-5" aria-live="polite">
                    <h2 className="flex items-center gap-2 font-semibold text-white">
                        {lastResult.mode === 'simulation' ? <CheckCircle2 size={19} className="text-emerald-300" /> : <ShieldAlert size={19} className="text-amber-300" />}
                        {lastResult.mode === 'simulation' ? (lastResult.state === 'closed' ? 'Simulacro cerrado — ninguna puerta fue accionada' : 'Simulacro terminado — ninguna puerta fue accionada') : 'Orden enviada — comprobación física requerida'}
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
                        <p className="mt-1 text-xs text-slate-400">Configura y guarda las salidas antes de una emergencia. En el momento del incidente, el botón rojo utiliza este grupo automáticamente.</p>
                    </div>
                    <span className="mono text-xs text-slate-500">{selected.length} seleccionadas / {mapped.length} vinculadas</span>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        data-testid="emergency-select-all"
                        disabled={!canConfigureGroup || mapped.length === 0 || mapped.length > 64 || selected.length === mapped.length}
                        onClick={() => { setBulkAccepted(false); setBulkMode('select_all_mapped'); }}
                        className="flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/10 px-4 py-2.5 text-xs font-bold text-sky-200 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <CheckCircle2 size={16} /> SELECCIONAR TODAS ({mapped.length})
                    </button>
                    <button
                        type="button"
                        data-testid="emergency-clear-all"
                        disabled={!canConfigureGroup || selected.length === 0}
                        onClick={() => { setBulkAccepted(false); setBulkMode('clear_all'); }}
                        className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >DESELECCIONAR TODAS</button>
                    <span className="text-xs text-slate-500">
                        {status?.armed
                            ? 'Para modificar el grupo, primero deshabilita el modo de apertura real.'
                            : 'La selección se guarda en el servidor y no ejecuta apertura física.'}
                    </span>
                </div>
                <p className="mt-3 text-xs text-amber-300">
                    Seleccionar todas incluye todas las puertas conectadas a controladores, no necesariamente salidas de evacuación certificadas. Revisa el grupo con EHS antes de habilitar apertura real.
                </p>
                {loading ? <p className="mt-5 text-sm text-slate-400">Cargando puertas…</p> : (
                    <div className="mt-5 grid gap-2 md:grid-cols-2">
                        {doors.map((door) => (
                            <label key={door.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${door.eligible ? 'border-rose-500/25 bg-rose-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                                <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 accent-rose-500"
                                    checked={Boolean(door.eligible)}
                                    disabled={busy || Boolean(editing) || !door.linked || status?.armed}
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
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="mono text-slate-400">{item.count} puertas · {item.state === 'closed' ? 'cerrado' : item.state}</span>
                                {item.mode === 'simulation' && item.state === 'completed' && (
                                    <button
                                        type="button"
                                        data-testid={`close-simulation-${item.incidentId}`}
                                        disabled={busy}
                                        onClick={() => { setCloseConfirmed(false); setCloseTarget(item); }}
                                        className="rounded-lg border border-sky-400/35 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-400/10 disabled:opacity-40"
                                    >
                                        FINALIZAR
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {!status?.recent?.length && <p className="text-sm text-slate-500">No hay activaciones registradas.</p>}
                </div>
            </section>

            {testModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4" role="presentation">
                    <div className="w-full max-w-lg rounded-2xl border-2 border-amber-500/45 bg-[#161319] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Confirmar prueba física de puerta">
                        <h2 className="text-xl font-black text-white">{testModal === 'start' ? 'PROBAR APERTURA SOSTENIDA' : testModal === 'restore' ? 'RESTABLECER UNA PUERTA' : 'CERRAR PRUEBA VERIFICADA'}</h2>
                        <p className="mt-3 text-sm leading-relaxed text-slate-200">
                            {testModal === 'start'
                                ? 'Se enviará alwaysOpen a UNA puerta. Puede quedar desbloqueada hasta restaurarla. Debes estar físicamente presente.'
                                : testModal === 'restore'
                                    ? 'Se enviará close SOLO a la puerta de prueba. Verifica que la evacuación concluyó y nadie depende de esa salida.'
                                    : 'Solo se cerrará el registro después de comprobar físicamente que la puerta volvió a su estado seguro. No se envían comandos.'}
                        </p>
                        <label className="mt-5 flex gap-3 text-sm text-slate-200">
                            <input type="checkbox" className="mt-1 accent-amber-400" checked={testSiteConfirmed} onChange={(e) => setTestSiteConfirmed(e.target.checked)} />
                            Confirmo supervisión física en sitio y que conozco la puerta seleccionada.
                        </label>
                        <label className="mt-4 flex gap-3 text-sm text-slate-200">
                            <input type="checkbox" className="mt-1 accent-amber-400" checked={testSafetyConfirmed} onChange={(e) => setTestSafetyConfirmed(e.target.checked)} />
                            {testModal === 'start'
                                ? 'La ruta está despejada y dispongo del procedimiento local para restablecerla.'
                                : testModal === 'restore'
                                    ? 'Seguridad/EHS autorizó restablecer; no existe emergencia activa y la ruta está despejada.'
                                    : 'Comprobé físicamente el estado seguro de la puerta y que la salida sigue siendo utilizable.'}
                        </label>
                        <label className="mt-5 block text-sm font-semibold text-white">
                            Escribe {testModal === 'start' ? 'PROBAR' : testModal === 'restore' ? 'RESTABLECER' : 'VERIFICADO'} para confirmar
                            <input
                                autoFocus autoComplete="off" value={testPhrase} onChange={(e) => setTestPhrase(e.target.value)}
                                className="mt-2 w-full rounded-xl border border-amber-500/35 bg-black/35 px-4 py-3 font-mono text-white outline-none focus:border-amber-300"
                            />
                        </label>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setTestModal('')} className="rounded-xl border border-white/20 px-3 py-3 text-sm font-semibold text-slate-200">CANCELAR</button>
                            <button type="button" data-testid="single-test-confirm"
                                disabled={!testSiteConfirmed || !testSafetyConfirmed || busy || testPhrase.trim() !== (testModal === 'start' ? 'PROBAR' : testModal === 'restore' ? 'RESTABLECER' : 'VERIFICADO')}
                                onClick={runSingleDoorAction}
                                className="rounded-xl bg-amber-500 px-3 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40">
                                CONFIRMAR
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {closeTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" role="presentation">
                    <div className="w-full max-w-lg rounded-2xl border-2 border-sky-500/40 bg-[#0b1220] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Confirmar cierre administrativo de simulacro">
                        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                            <RotateCcw size={22} className="text-sky-300" /> FINALIZAR SIMULACRO
                        </h2>
                        <p className="mt-4 break-all font-mono text-xs text-slate-400">Incidente {closeTarget.incidentId}</p>
                        <p className="mt-4 text-sm leading-relaxed text-slate-200">
                            Se marcará este simulacro como cerrado y se registrará el usuario responsable. No se enviarán comandos a ninguna puerta ni controlador.
                        </p>
                        <label className="mt-5 flex items-start gap-3 text-sm text-slate-200">
                            <input type="checkbox" checked={closeConfirmed} onChange={(e) => setCloseConfirmed(e.target.checked)} className="mt-1 accent-sky-400" />
                            Entiendo que se trata únicamente de un cierre administrativo y no de un restablecimiento físico.
                        </label>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => { setCloseTarget(null); setCloseConfirmed(false); }} className="rounded-xl border border-white/20 px-4 py-3 font-semibold text-slate-200">CANCELAR</button>
                            <button type="button" data-testid="confirm-close-simulation" onClick={closeSimulation} disabled={!closeConfirmed || busy}
                                className="rounded-xl bg-sky-600 px-4 py-3 font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40">
                                CONFIRMAR CIERRE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {bulkMode && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" role="presentation">
                    <div className="w-full max-w-lg rounded-2xl border-2 border-amber-500/40 bg-[#15151b] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Confirmar configuración de grupo de emergencia">
                        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                            <ClipboardCheck size={23} className="text-amber-300" />
                            {bulkMode === 'select_all_mapped' ? 'Preparar todas las puertas' : 'Vaciar grupo de emergencia'}
                        </h2>
                        <p className="mt-4 text-sm leading-relaxed text-slate-200">
                            {bulkMode === 'select_all_mapped'
                                ? `Se incluirán ${mapped.length} puertas vinculadas a controladores físicos. Esto configura el grupo para futuras emergencias; NO abrirá ninguna puerta ahora.`
                                : `Se eliminarán las ${selected.length} puertas seleccionadas del grupo. El botón rojo permanecerá deshabilitado si no queda ninguna.`}
                        </p>
                        {bulkMode === 'select_all_mapped' && (
                            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                                Algunas puertas pueden no ser rutas de evacuación aprobadas. EHS debe revisar la lista y retirar las no autorizadas antes de habilitar una apertura real.
                            </p>
                        )}
                        <label className="mt-5 flex items-start gap-3 text-sm text-slate-200">
                            <input type="checkbox" className="mt-1 accent-amber-400" checked={bulkAccepted} onChange={(e) => setBulkAccepted(e.target.checked)} />
                            Confirmo este cambio de configuración anticipada, sin activar las puertas.
                        </label>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => { setBulkMode(null); setBulkAccepted(false); }} className="rounded-xl border border-white/20 px-3 py-3 text-sm font-semibold text-slate-200">CANCELAR</button>
                            <button type="button" data-testid="confirm-emergency-bulk" disabled={!bulkAccepted || busy} onClick={configureAll}
                                className="rounded-xl bg-sky-600 px-3 py-3 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-40">
                                GUARDAR GRUPO
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
