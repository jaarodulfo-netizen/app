import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DOORS, EMPLOYEES, makeEvent, seedEvents } from '../data/mockData';

const SecurityContext = createContext(null);

export const useSecurity = () => useContext(SecurityContext);

export function SecurityProvider({ children }) {
    const [doors, setDoors] = useState(DOORS);
    const [employees, setEmployees] = useState(EMPLOYEES);
    const [events, setEvents] = useState(() => seedEvents(14));
    const [live, setLive] = useState(true);
    const liveRef = useRef(live);
    liveRef.current = live;
    const doorsRef = useRef(doors);
    doorsRef.current = doors;

    const pushEvent = useCallback((e) => setEvents((prev) => [e, ...prev].slice(0, 90)), []);

    useEffect(() => {
        const t = setInterval(() => {
            if (!liveRef.current) return;
            const e = makeEvent();
            pushEvent(e);
            if (e.result === 'denied') {
                toast.error(`ACCESS DENIED · ${e.doorCode}`, {
                    description: `${e.person} — ${e.detail}`,
                });
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
                toast.success(`DOOR RELEASED · ${door.code}`, {
                    description: `${door.name} unlocked remotely — auto relock in 10s`,
                });
            }, 1600);
            setTimeout(() => {
                setDoors((prev) => prev.map((d) => (d.id === doorId && d.status === 'unlocked' ? { ...d, status: 'locked' } : d)));
            }, 11600);
        },
        [pushEvent],
    );

    const silenceDoor = useCallback((doorId) => {
        setDoors((prev) => prev.map((d) => (d.id === doorId ? { ...d, status: 'locked' } : d)));
        toast.info('ALARM SILENCED · D-06', { description: 'Emergency Exit E returned to locked state' });
    }, []);

    const enrollEmployee = useCallback((emp) => {
        setEmployees((prev) => [{ ...emp, id: `e-${Date.now()}` }, ...prev]);
    }, []);

    return (
        <SecurityContext.Provider value={{ doors, employees, events, live, setLive, openDoor, silenceDoor, enrollEmployee }}>
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
