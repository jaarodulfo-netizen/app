// Attendance reports are joined to the existing V2 employee registry only.
// Never merge two employees just because they share a name.
export function normalizedPersonnelId(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return /^[0-9]+$/.test(raw) ? String(BigInt(raw)) : raw;
}

function uniqueEmployeeIndex(employees, getKeys) {
    const map = new Map();
    for (const emp of employees) {
        for (const key of getKeys(emp)) {
            if (!key) continue;
            if (!map.has(key)) map.set(key, emp);
            else if (map.get(key)?.id !== emp.id) map.set(key, null);
        }
    }
    return map;
}

export function buildAttendanceRoster(employees = [], sessions = []) {
    const people = (employees || []).filter(e => e && e.id);
    const ids = uniqueEmployeeIndex(people, emp => [
        emp.personId ? `id:${normalizedPersonnelId(emp.personId)}` : '',
        emp.cardNo ? `id:${normalizedPersonnelId(emp.cardNo)}` : '',
        ...(Array.isArray(emp.cardNos) ? emp.cardNos.map(c => `id:${normalizedPersonnelId(c)}`) : []),
    ]);
    const names = uniqueEmployeeIndex(people, emp => [
        emp.name ? `name:${String(emp.name).trim().toLocaleLowerCase()}` : '',
    ]);
    const collection = people.map(emp => ({
        employee: emp,
        rows: [],
        shiftCount: 0,
        dayCount: 0,
        workedSeconds: 0,
        regularSeconds: 0,
        overtimeSeconds: 0,
        breakSeconds: 0,
        scanCount: 0,
        requiresReview: 0,
    }));
    const byEmpId = new Map(collection.map(entry => [entry.employee.id, entry]));
    const unmatched = [];
    for (const row of sessions || []) {
        const idKeys = [row.person_id, row.card_no]
            .map(normalizedPersonnelId)
            .filter(Boolean)
            .map(value => `id:${value}`);
        let emp;
        for (const key of idKeys) {
            if (ids.has(key)) {
                emp = ids.get(key);
                break;
            }
        }
        if (emp === undefined && !idKeys.some(k => ids.has(k))) {
            const nameKey = String(row.person || '').trim().toLocaleLowerCase();
            emp = names.get(`name:${nameKey}`);
        }
        const match = emp && byEmpId.get(emp.id);
        if (!match) {
            unmatched.push(row);
            continue;
        }
        match.rows.push(row);
        match.workedSeconds += Number(row.worked_seconds || 0);
        match.regularSeconds += Number(row.regular_seconds || 0);
        match.overtimeSeconds += Number(row.overtime_seconds || 0);
        match.breakSeconds += Number(row.break_seconds || 0);
        match.scanCount += Number(row.events || 0);
        if (!row.punches_confirmed) match.requiresReview++;
    }
    for (const entry of collection) {
        entry.shiftCount = entry.rows.length;
        entry.dayCount = new Set(entry.rows.map(row => row.shift_date)).size;
        entry.rows.sort((a, b) => String(a.shift_date).localeCompare(String(b.shift_date)) || String(a.shift).localeCompare(String(b.shift)));
    }
    return {
        people: collection.sort((a, b) => String(a.employee.name || '').localeCompare(String(b.employee.name || ''))),
        unmatched,
    };
}

export function secondsToHHMM(totalSeconds) {
    const amount = Math.max(0, Math.trunc(Number(totalSeconds || 0)));
    return `${String(Math.floor(amount / 3600)).padStart(2, '0')}:${String(Math.floor((amount % 3600) / 60)).padStart(2, '0')}`;
}
