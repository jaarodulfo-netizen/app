// Operator-supplied iVMS-4200 inventory screenshot, 2026-11-10.
// REFERENCE ONLY: names/IPs do not prove Gateway identity or hardware permissions.
// Never change controller IDs, local Gateway JSON or employee doorRights based on this list.
export const IVMS_CONTROLLER_SNAPSHOT_DATE = '2026-11-10';

export const IVMS_ACCESS_DEVICES = [
    { name: '1-AC1 1st Floor 1st AC', ip: '192.168.3.201', kind: 'controller', previousCloudNames: ['1st Floor AC'] },
    { name: '1-AC2 1st Floor 2nd AC', ip: '192.168.3.203', kind: 'controller', previousCloudNames: ['1st Floor 2nd AC'] },
    { name: '1-AC3', ip: '192.168.3.222', kind: 'controller', previousCloudNames: [] },
    { name: '2-AC1 Restrooms', ip: '192.168.3.204', kind: 'controller', previousCloudNames: ['Restrooms'] },
    { name: '2-AC6 2nd Floor Access Control', ip: '192.168.3.202', kind: 'controller', previousCloudNames: ['2nd Floor AC'] },
    { name: '3-AC1 3rd Floor AC', ip: '192.168.3.209', kind: 'controller', previousCloudNames: ['3rd Floor AC'] },
    { name: 'B-AC1 Break Room', ip: '192.168.3.214', kind: 'controller', previousCloudNames: ['Break Room'] },
    { name: 'MG-AC1', ip: '192.168.3.215', kind: 'door-station', previousCloudNames: [] },
    { name: 'MG-AC2', ip: '192.168.3.216', kind: 'door-station', previousCloudNames: [] },
];

export const IVMS_NVR_SNAPSHOT = [
    { name: 'NVR1', ip: '192.168.3.101' },
    { name: 'NVR2', ip: '192.168.3.102' },
    { name: 'NVR3', ip: '192.168.3.103' },
];
