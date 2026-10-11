import { Employee, AttendanceRecord, EmployeeMonthlySummary, DepartmentSummaryItem, LeaderboardItem, TrendItem } from '../types/attendance';

export const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/**
 * Truncate epoch milliseconds to whole seconds (R1).
 */
export function truncateToSeconds(ms: number): number {
  return Math.floor(ms / 1000) * 1000;
}

/**
 * R8: True Half-Up Rounding.
 */
export function roundHalfUp(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  // Using string/epsilon to avoid binary float precision issues
  const n = num * factor;
  const rounded = Math.floor(n + 0.5);
  return rounded / factor;
}

/**
 * Convert UTC epoch ms to IST components.
 */
export function msToIst(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const dateStr = `${year}-${month}-${day}`;
  return { year, month, day, hours, minutes, seconds, timeStr, dateStr, d };
}

/**
 * R1: Determine attendance date based on shift_start, shift_end and punch_in.
 */
export function computeAttendanceDate(shiftStart: string, shiftEnd: string, punchInMs: number): string {
  const { dateStr, timeStr, hours, minutes } = msToIst(punchInMs);
  const isOvernight = shiftEnd <= shiftStart;

  if (isOvernight) {
    const [endH, endM] = shiftEnd.split(':').map(Number);
    const punchTotalMin = hours * 60 + minutes;
    const endTotalMin = endH * 60 + endM;

    if (punchTotalMin < endTotalMin) {
      // Belongs to the previous calendar day
      const prevDate = new Date(punchInMs + IST_OFFSET_MS - 24 * 3600 * 1000);
      const y = prevDate.getUTCFullYear();
      const m = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(prevDate.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return dateStr;
}

/**
 * R2: Late Minutes with 10-minute grace period.
 */
export function computeLateMinutes(attendanceDate: string, shiftStart: string, punchInMs: number): number {
  const [sH, sM] = shiftStart.split(':').map(Number);
  const [y, m, d] = attendanceDate.split('-').map(Number);
  // Shift start in IST converted to UTC epoch
  const shiftStartUtc = Date.UTC(y, m - 1, d, sH, sM, 0) - IST_OFFSET_MS;
  const diffSeconds = Math.floor((punchInMs - shiftStartUtc) / 1000);

  if (diffSeconds > 600) {
    return Math.floor(diffSeconds / 60);
  }
  return 0;
}

/**
 * R3: Overtime Minutes past shift_end (minimum 30 minutes).
 */
export function computeOvertimeMinutes(attendanceDate: string, shiftStart: string, shiftEnd: string, punchOutMs: number): number {
  const [eH, eM] = shiftEnd.split(':').map(Number);
  const [y, m, d] = attendanceDate.split('-').map(Number);
  const isOvernight = shiftEnd <= shiftStart;

  let endDay = d;
  if (isOvernight) {
    endDay += 1;
  }

  const shiftEndUtc = Date.UTC(y, m - 1, endDay, eH, eM, 0) - IST_OFFSET_MS;
  const diffSeconds = Math.floor((punchOutMs - shiftEndUtc) / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes >= 30) {
    return diffMinutes;
  }
  return 0;
}

/**
 * R4: Work Hours in seconds / 3600 rounded 2 decimals half-up.
 */
export function computeWorkHours(punchInMs: number, punchOutMs: number): number {
  const seconds = Math.floor((punchOutMs - punchInMs) / 1000);
  const hours = seconds / 3600;
  return roundHalfUp(hours, 2);
}

/**
 * R5: Half day threshold (< 4.50 hours).
 */
export function computeHalfDay(workHours: number | null): boolean {
  if (workHours === null) return false;
  return workHours < 4.50;
}

/**
 * R7: Count Mon-Fri working days in a month from joined_on.
 */
export function computeWorkingDays(joinedOn: string, month: string): number {
  const [yr, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const monthStartStr = `${month}-01`;
  const monthEndStr = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const effStartStr = joinedOn > monthStartStr ? joinedOn : monthStartStr;
  if (effStartStr > monthEndStr) return 0;

  let count = 0;
  const [sy, sm, sd] = effStartStr.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(yr, mo - 1, daysInMonth));

  while (cur <= end) {
    const dayOfWeek = cur.getUTCDay(); // 0 is Sunday, 6 is Saturday
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/**
 * Analytics: Department Monthly Summary
 */
export function simulateDepartmentSummary(
  employees: Employee[],
  logs: AttendanceRecord[],
  month: string,
  departmentFilter?: string
): DepartmentSummaryItem[] {
  const [yr, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const endOfMonthStr = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  // Filter employees with joined_on <= end of month (R9)
  let activeEmps = employees.filter(e => e.joined_on <= endOfMonthStr);
  if (departmentFilter) {
    activeEmps = activeEmps.filter(e => e.department === departmentFilter);
  }

  // Group by department
  const depts = Array.from(new Set(activeEmps.map(e => e.department))).sort();

  return depts.map(dept => {
    const deptEmps = activeEmps.filter(e => e.department === dept);
    const deptEmpCodes = new Set(deptEmps.map(e => e.emp_code));
    const deptLogs = logs.filter(l => deptEmpCodes.has(l.emp_code) && l.date.startsWith(month));

    let presentDays = 0;
    let lateCount = 0;
    let totalLateMinutes = 0;
    let leaveCount = 0;
    let onDutyCount = 0;
    const workHoursList: number[] = [];

    for (const log of deptLogs) {
      const [ly, lm, ld] = log.date.split('-').map(Number);
      const logDate = new Date(Date.UTC(ly, lm - 1, ld));
      const dayOfWeek = logDate.getUTCDay();
      const isMonFri = dayOfWeek >= 1 && dayOfWeek <= 5;

      if (['PRESENT', 'WFH', 'ON_DUTY'].includes(log.status)) {
        if (isMonFri) {
          presentDays += log.half_day ? 0.5 : 1.0;
        }
        if (log.work_hours !== null) {
          workHoursList.push(log.work_hours);
        }
      }

      if (log.late_minutes > 0) {
        lateCount++;
        totalLateMinutes += log.late_minutes;
      }
      if (log.status === 'LEAVE') {
        leaveCount++;
      }
      if (log.status === 'ON_DUTY') {
        onDutyCount++;
      }
    }

    let avgWorkHours: number | null = null;
    if (workHoursList.length > 0) {
      const sum = workHoursList.reduce((acc, h) => acc + h, 0);
      avgWorkHours = roundHalfUp(sum / workHoursList.length, 2);
    }

    return {
      department: dept,
      headcount: deptEmps.length,
      present_days: roundHalfUp(presentDays, 1),
      avg_work_hours: avgWorkHours,
      late_count: lateCount,
      total_late_minutes: totalLateMinutes,
      leave_count: leaveCount,
      on_duty_count: onDutyCount,
    };
  });
}

/**
 * Analytics: Standard Competition Ranking Leaderboard
 */
export function simulateLateLeaderboard(
  employees: Employee[],
  logs: AttendanceRecord[],
  month: string,
  limit: number = 10,
  departmentFilter?: string
): LeaderboardItem[] {
  const empMap = new Map(employees.map(e => [e.emp_code, e]));

  // Aggregate late minutes per employee
  const totals: { emp_code: string; name: string; department: string; total_late_minutes: number; late_count: number }[] = [];

  const empLateMap = new Map<string, { total_late: number; count: number }>();
  for (const log of logs) {
    if (log.date.startsWith(month) && log.late_minutes > 0) {
      const cur = empLateMap.get(log.emp_code) || { total_late: 0, count: 0 };
      cur.total_late += log.late_minutes;
      cur.count += 1;
      empLateMap.set(log.emp_code, cur);
    }
  }

  for (const [code, stat] of empLateMap.entries()) {
    const emp = empMap.get(code);
    if (!emp) continue;
    if (departmentFilter && emp.department !== departmentFilter) continue;
    totals.push({
      emp_code: code,
      name: emp.name,
      department: emp.department,
      total_late_minutes: stat.total_late,
      late_count: stat.count,
    });
  }

  // Sort by total_late_minutes desc, then emp_code asc
  totals.sort((a, b) => {
    if (b.total_late_minutes !== a.total_late_minutes) {
      return b.total_late_minutes - a.total_late_minutes;
    }
    return a.emp_code.localeCompare(b.emp_code);
  });

  // Assign standard competition ranks (1, 2, 2, 4)
  const ranked: LeaderboardItem[] = [];
  let currentRank = 1;
  for (let i = 0; i < totals.length; i++) {
    if (i > 0 && totals[i].total_late_minutes < totals[i - 1].total_late_minutes) {
      currentRank = i + 1;
    }
    ranked.push({
      rank: currentRank,
      emp_code: totals[i].emp_code,
      name: totals[i].name,
      department: totals[i].department,
      total_late_minutes: totals[i].total_late_minutes,
      late_count: totals[i].late_count,
    });
  }

  // Filter rank <= limit
  return ranked.filter(item => item.rank <= limit);
}
