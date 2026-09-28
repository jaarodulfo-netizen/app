import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from './AuthContext';
import { DOORS } from '../data/mockData';

const SecurityContext = createContext(null);

export const useSecurity = () => useContext(SecurityContext);

const DENIED_DETAILS = ['FACE MISMATCH 61.2%', 'CARD EXPIRED', 'OUT OF SCHEDULE', 'ANTI-PASSBACK VIOLATION'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function localEvent(employees, doors) {
    const door = pick(doors);
    const method = Math.random() > 0.45 ? 'FACE' : 'CARD';
    const denied = Math.random() < 0.16;
    return {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        person: employees.length ? pick(employees).name : 'UNREGISTERED CREDENTIAL',
        door: door.name,
        doorCode: door.code,
        zone: door.zone,
        method,
        result: denied ? 'denied' : 'granted',
        detail: denied ? pick(DENIED_DETAILS) : method === 'FACE' ? `MATCH ${(97 + Math.random() * 2.9).toFixed(1)}%` : 'CARD VERIFIED',
    };
}

export function SecurityProvider({ children }) {
    const [doors, setDoors] = useState(DOORS);
    const [employees, setEmployees] = useState(null);
    const [cameras, setCameras] = useState(null);
    const [devices, setDevices] = useState(null);
    const [events, setEvents] = useState([]);
    const [live, setLive] = useState(true);

    const liveRef = useRef(live);
    liveRef.current = live;
    const doorsRef = useRef(doors);
    doorsRef.current = doors;
    const employeesRef = useRef([]);
    employeesRef.current = employees || [];

    useEffect(() => {
        Promise.all([api.get('/employees'), api.get('/cameras'), api.get('/devices')])
            .then(([e, c, d]) => {
                setEmployees(e.data);
                setCameras(c.data);
                setDevices(d.data);
            })
            .catch(() => {
                setEmployees([]);
                setCameras([]);
                setDevices([]);
            });
    }, []);

    const pushEvent = useCallback((e) => setEvents((prev) => [e, ...prev].slice(0, 90)), []);

    useEffect(() => {
        const t = setInterval(() => {
            if (!liveRef.current) return;
            const e = localEvent(employeesRef.current, doorsRef.current);
            pushEvent(e);
            if (e.result === 'denied') {
                toast.error(`ACCESS DENIED · ${e.doorCode}`, { description: `${e.person} — ${e.detail}` });
            }
        }, 5200);
        return () => clearInterval(t);
    }, [pushEvent]);

    const openDoor = useCallback(
        (doorId) => {
            const door = doorsRef.current.find((d) => d.id === doorId);
            if (!door || door.status === 'opening' || door.status === 'unlocked') return;
            setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: 'opening' } : d)));
            setTimeout(() => {
                setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: 'unlocked' } : d)));
                pushEvent({
                    id: `ev-${Date.now()}-remote`,
                    ts: Date.now(),
                    person: 'OPS CONSOLE · REMOTE',
                    door: door.name,
                    doorCode: door.code,
                    zone: door.zone,
                    method: 'REMOTE',
                    result: 'granted',
                    detail: 'REMOTE OPEN COMMAND',
                });
                toast.success(`DOOR RELEASED · ${door.code}`, { description: `${door.name} unlocked remotely — auto relock in 10s` });
            }, 1600);
            setTimeout(() => {
                setDoors((prev) => prev.map((d) => (d.id === doorId && d.status === 'unlocked' ? { ...d, status: 'locked' } : d)));
            }, 11600);
        },
        [pushEvent],
    );

    const silenceDoor = useCallback((doorId) => {
        setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: 'locked' } : d)));
        toast.info('ALARM SILENCED', { description: 'Door returned to locked state' });
    }, []);

    const addEmployee = useCallback(async (emp) => {
        const { data } = await api.post('/employees', emp);
        setEmployees((prev) => [data, ...(prev || [])]);
        return data;
    }, []);

    const deleteEmployee = useCallback(async (id) => {
        await api.delete(`/employees/${id}`);
        setEmployees((prev) => (prev || []).filter((e) => e.id !== id));
    }, []);

    const addCamera = useCallback(async (cam) => {
        const { data } = await api.post('/cameras', cam);
        setCameras((prev) => [...(prev || []), data]);
        return data;
    }, []);

    const deleteCamera = useCallback(async (id) => {
        await api.delete(`/cameras/${id}`);
        setCameras((prev) => (prev || []).filter((c) => c.id !== id));
    }, []);

    const addDevice = useCallback(async (dev) => {
        const { data } = await api.post('/devices', dev);
        setDevices((prev) => [...(prev || []), data]);
        return data;
    }, []);

    const deleteDevice = useCallback(async (id) => {
        await api.delete(`/devices/${id}`);
        setDevices((prev) => (prev || []).filter((d) => d.id !== id));
        setCameras((prev) => (prev || []).map((c) => (c.nvr === id ? { ...c, nvr: '' } : c)));
    }, []);

    return (
        <SecurityContext.Provider
            value={{
                doors,
                employees,
                cameras,
                devices,
                events,
                live,
                setLive,
                openDoor,
                silenceDoor,
                addEmployee,
                deleteEmployee,
                addCamera,
                deleteCamera,
                addDevice,
                deleteDevice,
            }}
        >
            {children}
        </SecurityContext.Provider>
    );
}

export function useNow(intervalMs = 1000) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(t);
    }, [intervalMs]);
    return now;
}
