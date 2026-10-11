export type PresenceStatus = 'PRESENT' | 'WFH' | 'ON_DUTY';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'WFH' | 'ON_DUTY';

export interface Employee {
  emp_code: string;
  name: string;
  email: string;
  department: string;
  shift_start: string;
  shift_end: string;
  joined_on: string;
  created_at: number;
}

export interface HistoryChange {
  from: any;
  to: any;
}

export interface HistoryEntry {
  at: number;
  by: string;
  reason: string;
  changes: Record<string, HistoryChange>;
}

export interface AttendanceRecord {
  emp_code: string;
  date: string;
  status: AttendanceStatus;
  punch_in: number | null;
  punch_out: number | null;
  work_hours: number | null;
  late_minutes: number;
  overtime_minutes: number;
  half_day: boolean;
  history: HistoryEntry[];
}

export interface EmployeeMonthlySummary {
  emp_code: string;
  month: string;
  working_days: number;
  present_days: number;
  leave_days: number;
  late_count: number;
  total_late_minutes: number;
  total_overtime_minutes: number;
  attendance_pct: number | null;
}

export interface DepartmentSummaryItem {
  department: string;
  headcount: number;
  present_days: number;
  avg_work_hours: number | null;
  late_count: number;
  total_late_minutes: number;
  leave_count: number;
  on_duty_count: number;
}

export interface LeaderboardItem {
  rank: number;
  emp_code: string;
  name: string;
  department: string;
  total_late_minutes: number;
  late_count: number;
}

export interface TrendItem {
  date: string;
  is_working_day: boolean;
  headcount: number;
  present_count: number;
  late_count: number;
  attendance_rate: number | null;
  moving_avg_7d: number | null;
}
