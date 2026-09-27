export const CAMERAS = [
    {
        id: 'cam-01',
        code: 'CAM-01',
        label: 'MAIN LOBBY',
        location: 'Lobby · North Entrance',
        img: 'https://images.unsplash.com/photo-1787995588763-b6d0781e390f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwzfHxzZWN1cml0eSUyMHN1cnZlaWxsYW5jZSUyMGNjdHYlMjBjYW1lcmElMjBmZWVkJTIwZGFyayUyMGxvYmJ5JTIwY29ycmlkb3IlMjBwYXJraW5nfGVufDB8fHx8MTc5MDU0MDA3MXww&ixlib=rb-4.1.0&q=85',
        status: 'live',
    },
    {
        id: 'cam-02',
        code: 'CAM-02',
        label: 'EXEC CORRIDOR WEST',
        location: 'Executive Wing',
        img: 'https://images.unsplash.com/photo-1762779943673-fcb177e7fe56?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwyfHxzZWN1cml0eSUyMHN1cnZlaWxsYW5jZSUyMGNjdHYlMjBjYW1lcmElMjBmZWVkJTIwZGFyayUyMGxvYmJ5JTIwY29ycmlkb3IlMjBwYXJraW5nfGVufDB8fHx8MTc5MDU0MDA3MXww&ixlib=rb-4.1.0&q=85',
        status: 'live',
    },
    {
        id: 'cam-03',
        code: 'CAM-03',
        label: 'SOUTH GATE TERMINAL',
        location: 'Parking Access B1',
        img: 'https://images.unsplash.com/photo-1787995588886-e87f5f207909?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHw0fHxzZWN1cml0eSUyMHN1cnZlaWxsYW5jZSUyMGNjdHYlMjBjYW1lcmElMjBmZWVkJTIwZGFyayUyMGxvYmJ5JTIwY29ycmlkb3IlMjBwYXJraW5nfGVufDB8fHx8MTc5MDU0MDA3MXww&ixlib=rb-4.1.0&q=85',
        status: 'live',
    },
    {
        id: 'cam-04',
        code: 'CAM-04',
        label: 'SERVER ROOM VAULT',
        location: 'Restricted Zone',
        img: 'https://images.unsplash.com/photo-1779727279604-19ebb58b8b83?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwxfHxzZWN1cml0eSUyMHN1cnZlaWxsYW5jZSUyMGNjdHYlMjBjYW1lcmElMjBmZWVkJTIwZGFyayUyMGxvYmJ5JTIwY29ycmlkb3IlMjBwYXJraW5nfGVufDB8fHx8MTc5MDU0MDA3MXww&ixlib=rb-4.1.0&q=85',
        status: 'live',
    },
    { id: 'cam-05', code: 'CAM-05', label: 'LOADING DOCK', location: 'Service Bay', img: null, status: 'offline' },
    { id: 'cam-06', code: 'CAM-06', label: 'STAIRWELL B', location: 'East Egress', img: null, status: 'offline' },
];

export const DOORS = [
    { id: 'd-01', code: 'D-01', name: 'Main Entrance', zone: 'LOBBY', x: 16, y: 93.5, status: 'locked', camId: 'cam-01' },
    { id: 'd-02', code: 'D-02', name: 'Server Room', zone: 'RESTRICTED', x: 20, y: 33.9, status: 'locked', camId: 'cam-04' },
    { id: 'd-03', code: 'D-03', name: 'Executive Suite', zone: 'EXEC WING', x: 78, y: 40.3, status: 'locked', camId: 'cam-02' },
    { id: 'd-04', code: 'D-04', name: 'Office Bullpen', zone: 'OPERATIONS', x: 47, y: 40.3, status: 'unlocked', camId: 'cam-02' },
    { id: 'd-05', code: 'D-05', name: 'Parking Gate B1', zone: 'PARKING', x: 85, y: 93.5, status: 'locked', camId: 'cam-03' },
    { id: 'd-06', code: 'D-06', name: 'Emergency Exit E', zone: 'EGRESS', x: 96, y: 50.8, status: 'alarm', camId: 'cam-03' },
    { id: 'd-07', code: 'D-07', name: 'Elevator Lobby', zone: 'CORE', x: 51, y: 56.5, status: 'locked', camId: 'cam-01' },
    { id: 'd-08', code: 'D-08', name: 'Rooftop Access', zone: 'RESTRICTED', x: 4, y: 24.2, status: 'locked', camId: 'cam-04' },
];

export const EMPLOYEES = [
    {
        id: 'e-01',
        name: 'Marcus Vance',
        role: 'Chief Security Architect',
        cardNo: 'RFID-883901',
        faceSync: true,
        faceMatch: '99.8',
        level: 'L4 · COMMAND',
        img: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBjb3Jwb3JhdGUlMjBlbXBsb3llZSUyMHBvcnRyYWl0JTIwaGVhZHNob3QlMjBhdmF0YXJ8ZW58MHx8fHwxNzkwNTQwMDcxfDA&ixlib=rb-4.1.0&q=85',
        lastSeen: 'Main Lobby · 2m ago',
    },
    {
        id: 'e-02',
        name: 'Elena Rostova',
        role: 'Lead Ops Officer',
        cardNo: 'RFID-441209',
        faceSync: true,
        faceMatch: '99.6',
        level: 'L3 · OPERATIONS',
        img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBjb3Jwb3JhdGUlMjBlbXBsb3llZSUyMHBvcnRyYWl0JTIwaGVhZHNob3QlMjBhdmF0YXJ8ZW58MHx8fHwxNzkwNTQwMDcxfDA&ixlib=rb-4.1.0&q=85',
        lastSeen: 'Exec Corridor · 9m ago',
    },
    {
        id: 'e-03',
        name: 'Sarah Chen',
        role: 'Infrastructure Engineer',
        cardNo: 'RFID-229104',
        faceSync: true,
        faceMatch: '99.1',
        level: 'L3 · RESTRICTED',
        img: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBjb3Jwb3JhdGUlMjBlbXBsb3llZSUyMHBvcnRyYWl0JTIwaGVhZHNob3QlMjBhdmF0YXJ8ZW58MHx8fHwxNzkwNTQwMDcxfDA&ixlib=rb-4.1.0&q=85',
        lastSeen: 'Server Room · 14m ago',
    },
    {
        id: 'e-04',
        name: 'David Miller',
        role: 'Facilities Operations',
        cardNo: 'RFID-665182',
        faceSync: false,
        faceMatch: null,
        level: 'L1 · GENERAL',
        img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHw0fHxwcm9mZXNzaW9uYWwlMjBjb3Jwb3JhdGUlMjBlbXBsb3llZSUyMHBvcnRyYWl0JTIwaGVhZHNob3QlMjBhdmF0YXJ8ZW58MHx8fHwxNzkwNTQwMDcxfDA&ixlib=rb-4.1.0&q=85',
        lastSeen: 'Parking Gate · 31m ago',
    },
    { id: 'e-05', name: 'Priya Nair', role: 'Network Engineer', cardNo: 'RFID-310556', faceSync: true, faceMatch: '98.9', level: 'L2 · STAFF', initials: 'PN', lastSeen: 'Office Bullpen · 5m ago' },
    { id: 'e-06', name: 'Tomas Berg', role: 'Facilities Technician', cardNo: 'RFID-778210', faceSync: false, faceMatch: null, level: 'L1 · GENERAL', initials: 'TB', lastSeen: 'Loading Dock · 1h ago' },
    { id: 'e-07', name: 'Aisha Bello', role: 'Data Analyst', cardNo: 'RFID-502318', faceSync: true, faceMatch: '99.3', level: 'L2 · STAFF', initials: 'AB', lastSeen: 'Elevator Lobby · 11m ago' },
    { id: 'e-08', name: 'Ryu Tanaka', role: 'DevOps Lead', cardNo: 'RFID-901477', faceSync: true, faceMatch: '98.7', level: 'L3 · RESTRICTED', initials: 'RT', lastSeen: 'Server Room · 44m ago' },
];

export const DEVICES = [
    { id: 'gw-01', type: 'gateway', name: 'GW-01 · Core Gateway', ip: '10.4.0.1', fw: 'v4.2.1', signal: 98, status: 'online', detail: 'UPLINK 940 Mbps · 22 nodes routed' },
    { id: 'gw-02', type: 'gateway', name: 'GW-02 · Annex Gateway', ip: '10.4.0.2', fw: 'v4.2.1', signal: 86, status: 'online', detail: 'UPLINK 612 Mbps · 9 nodes routed' },
    { id: 'nvr-01', type: 'nvr', name: 'NVR-01 · Primary Recorder', ip: '10.4.0.21', fw: 'v6.0.3', signal: 99, status: 'online', detail: '12CH RECORDING · 8.2 TB FREE' },
    { id: 'nvr-02', type: 'nvr', name: 'NVR-02 · Backup Recorder', ip: '10.4.0.22', fw: 'v5.9.1', signal: 0, status: 'offline', detail: 'LINK DOWN · LAST SEEN 04:12:33' },
    { id: 'fs-01', type: 'face', name: 'FS-01 · Lobby Facial Scanner', ip: '10.4.1.11', fw: 'v2.8.0', signal: 94, status: 'online', detail: 'EMBEDDINGS 214 · AVG MATCH 99.2%' },
    { id: 'fs-02', type: 'face', name: 'FS-02 · Vault Facial Scanner', ip: '10.4.1.12', fw: 'v2.8.0', signal: 91, status: 'online', detail: 'EMBEDDINGS 214 · AVG MATCH 99.5%' },
    { id: 'fs-03', type: 'face', name: 'FS-03 · Exec Facial Scanner', ip: '10.4.1.13', fw: 'v2.7.4', signal: 62, status: 'degraded', detail: 'FIRMWARE UPDATE AVAILABLE' },
    { id: 'cr-01', type: 'card', name: 'CR-01 · Lobby Reader', ip: '10.4.2.1', fw: 'v1.9.2', signal: 97, status: 'online', detail: 'MIFARE DESFIRE EV3' },
    { id: 'cr-02', type: 'card', name: 'CR-02 · Server Room Reader', ip: '10.4.2.2', fw: 'v1.9.2', signal: 93, status: 'online', detail: 'MIFARE DESFIRE EV3' },
    { id: 'cr-03', type: 'card', name: 'CR-03 · Parking Reader', ip: '10.4.2.3', fw: 'v1.9.2', signal: 78, status: 'online', detail: 'MIFARE DESFIRE EV3' },
    { id: 'cr-04', type: 'card', name: 'CR-04 · Elevator Reader', ip: '10.4.2.4', fw: 'v1.9.2', signal: 88, status: 'online', detail: 'MIFARE DESFIRE EV3' },
    { id: 'cr-05', type: 'card', name: 'CR-05 · Exec Wing Reader', ip: '10.4.2.5', fw: 'v1.9.0', signal: 84, status: 'online', detail: 'MIFARE DESFIRE EV3' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
let seq = 0;

export function makeEvent() {
    const emp = pick(EMPLOYEES);
    const door = pick(DOORS);
    const method = Math.random() > 0.45 ? 'FACE' : 'CARD';
    const denied = Math.random() < 0.16;
    return {
        id: `ev-${Date.now()}-${seq++}`,
        ts: Date.now(),
        person: emp.name,
        door: door.name,
        doorCode: door.code,
        zone: door.zone,
        method,
        result: denied ? 'denied' : 'granted',
        detail: denied
            ? pick(['FACE MISMATCH 61.2%', 'CARD EXPIRED', 'OUT OF SCHEDULE', 'ANTI-PASSBACK VIOLATION'])
            : method === 'FACE'
              ? `MATCH ${(97 + Math.random() * 2.9).toFixed(1)}%`
              : 'CARD VERIFIED',
    };
}

export function seedEvents(n = 14) {
    const arr = [];
    for (let i = n; i > 0; i--) {
        const e = makeEvent();
        e.ts = Date.now() - i * 47000;
        arr.push(e);
    }
    return arr;
}

export const MARQUEE_ITEMS = [
    'GATEWAY-01 LINK 98.2%',
    'NVR-01 RECORDING · 12 CHANNELS',
    '142 OCCUPANTS INSIDE PERIMETER',
    'FLEET FACE SYNC 99.4% AVG',
    'PERIMETER ARMED · LEVEL 2',
    'FIRMWARE 4.2.1 · CURRENT',
    'EMERGENCY EXIT E · TAMPER ALERT',
    'NEXT PATROL SWEEP 18:00',
];
