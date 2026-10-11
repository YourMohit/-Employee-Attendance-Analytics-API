import { Employee, AttendanceRecord } from '../types/attendance';

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    emp_code: "EMP0001",
    name: "Asha Rao",
    email: "asha@example.com",
    department: "Engineering",
    shift_start: "09:30",
    shift_end: "18:30",
    joined_on: "2026-01-05",
    created_at: 1767587400000
  },
  {
    emp_code: "EMP0002",
    name: "Bikram Singh",
    email: "bikram@example.com",
    department: "Engineering",
    shift_start: "09:30",
    shift_end: "18:30",
    joined_on: "2026-01-10",
    created_at: 1768019400000
  },
  {
    emp_code: "EMP0003",
    name: "Charu Verma",
    email: "charu@example.com",
    department: "Product",
    shift_start: "09:30",
    shift_end: "18:30",
    joined_on: "2026-02-01",
    created_at: 1769920200000
  },
  {
    emp_code: "EMP0004",
    name: "Devendra Kumar",
    email: "devendra@example.com",
    department: "Operations",
    shift_start: "09:00",
    shift_end: "18:00",
    joined_on: "2026-02-15",
    created_at: 1771126200000
  },
  {
    emp_code: "EMP0005",
    name: "Farhan Akhtar",
    email: "farhan@example.com",
    department: "Support",
    shift_start: "22:00",
    shift_end: "06:00",
    joined_on: "2026-03-01",
    created_at: 1772382600000
  },
  {
    emp_code: "EMP0006",
    name: "Gauri Sharma",
    email: "gauri@example.com",
    department: "Engineering",
    shift_start: "09:30",
    shift_end: "18:30",
    joined_on: "2026-04-01",
    created_at: 1775016000000
  }
];

export const INITIAL_LOGS: AttendanceRecord[] = [
  {
    emp_code: "EMP0001",
    date: "2026-07-06",
    status: "PRESENT",
    punch_in: 1783310280000, // 03:58 UTC = 09:28 IST
    punch_out: 1783343100000, // 13:05 UTC = 18:35 IST
    work_hours: 9.12,
    late_minutes: 0,
    overtime_minutes: 0,
    half_day: false,
    history: []
  },
  {
    emp_code: "EMP0003",
    date: "2026-07-06",
    status: "PRESENT",
    punch_in: 1783312500000, // 04:35 UTC = 10:05 IST
    punch_out: 1783345200000, // 13:40 UTC = 19:10 IST
    work_hours: 9.08,
    late_minutes: 35,
    overtime_minutes: 40,
    half_day: false,
    history: []
  },
  {
    emp_code: "EMP0006",
    date: "2026-07-07",
    status: "PRESENT",
    punch_in: 1783397100000, // 04:05 UTC = 09:35 IST
    punch_out: null,
    work_hours: null,
    late_minutes: 0,
    overtime_minutes: 0,
    half_day: false,
    history: []
  },
  {
    emp_code: "EMP0004",
    date: "2026-07-07",
    status: "WFH",
    punch_in: 1783396800000, // 04:00 UTC = 09:30 IST
    punch_out: 1783409400000, // 07:30 UTC = 13:00 IST
    work_hours: 3.5,
    late_minutes: 0,
    overtime_minutes: 0,
    half_day: true,
    history: []
  },
  {
    emp_code: "EMP0004",
    date: "2026-07-08",
    status: "ABSENT",
    punch_in: null,
    punch_out: null,
    work_hours: null,
    late_minutes: 0,
    overtime_minutes: 0,
    half_day: false,
    history: []
  },
  {
    emp_code: "EMP0003",
    date: "2026-07-08",
    status: "LEAVE",
    punch_in: null,
    punch_out: null,
    work_hours: null,
    late_minutes: 0,
    overtime_minutes: 0,
    half_day: false,
    history: []
  },
  {
    emp_code: "EMP0005",
    date: "2026-07-06",
    status: "PRESENT",
    punch_in: 1783355100000, // 16:25 UTC = 21:55 IST
    punch_out: 1783386600000, // 01:10 UTC next day = 06:40 IST
    work_hours: 8.75,
    late_minutes: 0,
    overtime_minutes: 40,
    half_day: false,
    history: []
  },
  {
    emp_code: "EMP0001",
    date: "2026-07-07",
    status: "PRESENT",
    punch_in: 1783396680000, // 03:58 UTC
    punch_out: 1783429200000, // 13:00 UTC
    work_hours: 9.03,
    late_minutes: 0,
    overtime_minutes: 0,
    half_day: false,
    history: [
      {
        at: 1783486800000,
        by: "hr.admin",
        reason: "biometric glitch",
        changes: {
          punch_in: {
            from: 1783398900000,
            to: 1783396680000
          },
          late_minutes: {
            from: 35,
            to: 0
          },
          work_hours: {
            from: 8.42,
            to: 9.03
          }
        }
      }
    ]
  },
  {
    emp_code: "EMP0002",
    date: "2026-07-14",
    status: "PRESENT",
    punch_in: 1784001720000, // 04:02 UTC
    punch_out: 1784034060000, // 13:01 UTC
    work_hours: 8.98,
    late_minutes: 0,
    overtime_minutes: 0,
    half_day: false,
    history: []
  }
];
