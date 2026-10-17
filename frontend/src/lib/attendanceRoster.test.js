import { buildAttendanceRoster, normalizedPersonnelId, secondsToHHMM } from './attendanceRoster';

const employees = [
    { id: 'a', name: 'Maria Candela', personId: '0008512241', cardNo: '0008512241', photoPath: 'photo/a.jpg' },
    { id: 'b', name: 'Juan Lopez', personId: '0008512251', cardNo: '0008512251', photoPath: null },
];

const scan = (attrs = {}) => ({
    person: 'Maria Candela',
    person_id: '0008512241',
    card_no: '0008512241',
    shift_date: '2026-10-17',
    shift: 'A',
    worked_seconds: 27000,
    regular_seconds: 27000,
    overtime_seconds: 0,
    break_seconds: 1800,
    events: 4,
    punches_confirmed: true,
    ...attrs,
});

test('includes new and existing staff with photos even if attendance is empty', () => {
    const { people, unmatched } = buildAttendanceRoster(employees, [scan()]);
    expect(people).toHaveLength(2);
    expect(unmatched).toHaveLength(0);
    expect(people.find(x => x.employee.id === 'b').shiftCount).toBe(0);
    expect(people.find(x => x.employee.id === 'a').employee.photoPath).toBe('photo/a.jpg');
});

test('keeps same-name employees separate using card/person ID', () => {
    const staff = [
        { id: 'a', name: 'Alex Ruiz', personId: '00001', cardNo: '00001' },
        { id: 'b', name: 'Alex Ruiz', personId: '00002', cardNo: '00002' },
    ];
    const report = buildAttendanceRoster(staff, [
        scan({ person: 'Alex Ruiz', person_id: '00001', card_no: '00001' }),
        scan({ person: 'Alex Ruiz', person_id: '2', card_no: '00002', shift_date: '2026-10-18' })
    ]);
    expect(report.people.find(p => p.employee.id === 'a').shiftCount).toBe(1);
    expect(report.people.find(p => p.employee.id === 'b').shiftCount).toBe(1);
});

test('does not credit unidentified or mismatched card events to unrelated employees', () => {
    const report = buildAttendanceRoster(employees, [scan({ person_id: '99999', card_no: '99999' })]);
    expect(report.unmatched).toHaveLength(1);
    expect(report.people.every(p => p.shiftCount === 0)).toBe(true);
});

test('name fallback only works if employee name is unique and no explicit ID was provided', () => {
    const unknown = scan({ person_id: null, card_no: null });
    expect(buildAttendanceRoster(employees, [unknown]).unmatched).toHaveLength(0);
    const cloned = [...employees, { id: 'c', name: 'Maria Candela', personId: '1000' }];
    expect(buildAttendanceRoster(cloned, [unknown]).unmatched).toHaveLength(1);
});

test('aggregates hours, breaks and review flags; IDs keep leading zeroes safely', () => {
    const rows = [
        scan(),
        scan({ shift_date: '2026-10-18', worked_seconds: 28800, regular_seconds: 28800,
            break_seconds: 0, events: 2, punches_confirmed: false }),
    ];
    const entry = buildAttendanceRoster(employees, rows).people.find(x => x.employee.id === 'a');
    expect(entry.dayCount).toBe(2);
    expect(entry.requiresReview).toBe(1);
    expect(entry.scanCount).toBe(6);
    expect(secondsToHHMM(entry.workedSeconds)).toBe('15:30');
    expect(secondsToHHMM(entry.breakSeconds)).toBe('00:30');
    expect(normalizedPersonnelId('0008512241')).toBe('8512241');
});
