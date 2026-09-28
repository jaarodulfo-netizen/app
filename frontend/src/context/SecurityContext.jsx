import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, useAuth } from './AuthContext';

const SecurityContext = createContext(null);

export const useSecurity = () => useContext(SecurityContext);

export function SecurityProvider({ children }) {
    const { user } = useAuth();
    const [doors, setDoors] = useState([]);
    const [employees, setEmployees] = useState(null);
    const [cameras, setCameras] = useState(null);
    const [devices, setDevices] = useState(null);
    const [events, setEvents] = useState([]);
    const [live, setLive] = useState(true);

    const liveRef = useRef(live);
    liveRef.current = live;
    const doorsRef = useRef(doors);
    doorsRef.current = doors;
    const lastEventTsRef = useRef(0);
    const firstFetchRef = useRef(true);

    useEffect(() => {
        Promise.all([api.get('/employees'), api.get('/cameras'), api.get('/devices'), api.get('/doors')])
            .then(([e, c, d, dr]) => {
                setEmployees(e.data);
                setCameras(c.data);
                setDevices(d.data);
                setDoors(dr.data);
            })
            .catch(() => {
                setEmployees([]);
                setCameras([]);
                setDevices([]);
            });
    }, []);

    const fetchEvents = useCallback(async () => {
        try {
            const { data } = await api.get('/events');
            setEvents(data);
            const fresh = data.filter((e) => e.ts > lastEventTsRef.current);
            if (fresh.length) lastEventTsRef.current = Math.max(...data.map((e) => e.ts));
            if (!firstFetchRef.current) {
                const denied = fresh.find((e) => e.result === 'denied');
                if (denied) toast.error(`ACCESS DENIED · ${denied.doorCode}`, { description: `${denied.person} — ${denied.detail}` });
            }
            firstFetchRef.current = false;
        } catch (e) {
            /* keep last known feed */
        }
    }, []);

    useEffect(() => {
        fetchEvents();
        const t = setInterval(() => {
            if (liveRef.current) fetchEvents();
        }, 4000);
        return () => clearInterval(t);
    }, [fetchEvents]);

    const logEvent = useCallback(async (payload) => {
        try {
            const { data } = await api.post('/events', payload);
            setEvents((prev) => [data, ...prev].slice(0, 200));
            lastEventTsRef.current = Math.max(lastEventTsRef.current, data.ts);
        } catch (e) {
            /* audit write failed silently */
        }
    }, []);

    const openDoor = useCallback(async (doorId) => {
        const door = doorsRef.current.find((d) => d.id === doorId);
        if (!door || door.status === 'opening') return;
        setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: 'opening' } : d)));
        try {
            const { data } = await api.post(`/doors/${doorId}/command`, { cmd: 'open' });
            setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: data.status || 'unlocked' } : d)));
            toast.success(`PHYSICAL DOOR OPENED · ${door.code}`, { description: `${door.name} command executed by Kerma studio gateway` });
        } catch (e) {
            setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: 'locked' } : d)));
            toast.error('DOOR COMMAND FAILED', { description: e?.response?.data?.detail || 'Studio gateway is offline or the door is not linked' });
            throw e;
        }
    }, []);

    const closeDoor = useCallback(async (doorId) => {
        const door = doorsRef.current.find((d) => d.id === doorId);
        if (!door) return;
        try {
            const { data } = await api.post(`/doors/${doorId}/command`, { cmd: 'close' });
            setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: data.status || 'locked' } : d)));
            toast.success(`PHYSICAL DOOR CLOSED · ${door.code}`, { description: `${door.name} command executed by Kerma studio gateway` });
        } catch (e) {
            toast.error('DOOR COMMAND FAILED', { description: e?.response?.data?.detail || 'Studio gateway is offline or the door is not linked' });
            throw e;
        }
    }, []);

    const silenceDoor = useCallback(
        (doorId) => {
            const door = doorsRef.current.find((d) => d.id === doorId);
            setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: 'locked' } : d)));
            if (door) {
                logEvent({
                    person: `${user?.name || 'OPS CONSOLE'} · REMOTE`,
                    door: door.name,
                    doorCode: door.code,
                    zone: door.zone || '',
                    method: 'REMOTE',
                    result: 'granted',
                    detail: 'ALARM SILENCED BY OPERATOR',
                });
            }
            toast.info('ALARM SILENCED', { description: 'Door returned to locked state' });
        },
        [logEvent, user],
    );

    const addEmployee = useCallback(async (emp) => {
        const { data } = await api.post('/employees', emp);
        setEmployees((prev) => [data, ...(prev || [])]);
        return data;
    }, []);

    const updateEmployee = useCallback(async (id, updates) => {
        const { data } = await api.put(`/employees/${id}`, updates);
        setEmployees((prev) => (prev || []).map((e) => (e.id === id ? data : e)));
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
        setCameras((prev) => (prev || []).map((c) => (c.nvr === id ? { ...c, nvr: '', nvrName: '' } : c)));
    }, []);

    const addDoor = useCallback(async (door) => {
        const { data } = await api.post('/doors', door);
        setDoors((prev) => [...prev, data]);
        return data;
    }, []);

    const updateDoor = useCallback(async (id, updates) => {
        const { data } = await api.put(`/doors/${id}`, updates);
        setDoors((prev) => prev.map((d) => (d.id === id ? { ...d, ...data } : d)));
        return data;
    }, []);

    const deleteDoor = useCallback(async (id) => {
        await api.delete(`/doors/${id}`);
        setDoors((prev) => prev.filter((d) => d.id !== id));
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
                closeDoor,
                silenceDoor,
                addEmployee,
                updateEmployee,
                deleteEmployee,
                addCamera,
                deleteCamera,
                addDevice,
                deleteDevice,
                addDoor,
                updateDoor,
                deleteDoor,
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
