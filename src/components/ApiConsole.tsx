import React, { useState } from 'react';
import { Play, Copy, Check, Info, AlertTriangle, ArrowRight, CornerDownRight, Database, Clock } from 'lucide-react';
import { Employee, AttendanceRecord, AttendanceStatus, PresenceStatus } from '../types/attendance';
import {
  truncateToSeconds,
  computeAttendanceDate,
  computeLateMinutes,
  computeOvertimeMinutes,
  computeWorkHours,
  computeHalfDay,
  simulateDepartmentSummary,
  simulateLateLeaderboard,
  roundHalfUp,
  computeWorkingDays
} from '../utils/rulesEngine';

interface ApiConsoleProps {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  logs: AttendanceRecord[];
  setLogs: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
}

interface EndpointDef {
  id: string;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  tag: string;
  summary: string;
  description: string;
  defaultParams?: Record<string, any>;
  defaultBody?: any;
}

const ENDPOINTS: EndpointDef[] = [
  {
    id: 'health',
    method: 'GET',
    path: '/health',
    tag: 'system',
    summary: 'Readiness probe',
    description: 'Returns 200 only if MongoDB answers a ping, otherwise 503.'
  },
  {
    id: 'create_employee',
    method: 'POST',
    path: '/employees',
    tag: 'employees',
    summary: 'Create an employee',
    description: 'Supplies unique emp_code. Unique index prevents concurrent duplicates (yielding 409).',
    defaultBody: {
      emp_code: 'EMP0007',
      name: 'Rohan Mehta',
      email: 'rohan@example.com',
      department: 'Engineering',
      shift_start: '09:30',
      shift_end: '18:30',
      joined_on: '2026-07-01'
    }
  },
  {
    id: 'list_employees',
    method: 'GET',
    path: '/employees',
    tag: 'employees',
    summary: 'List employees',
    description: 'Sorted by emp_code ascending. Paginated with exact filter count.',
    defaultParams: { department: '', page: 1, page_size: 20 }
  },
  {
    id: 'punch_in',
    method: 'POST',
    path: '/attendance/punch-in',
    tag: 'attendance',
    summary: 'Record a punch-in',
    description: 'Creates attendance day record (R1 & R2). Duplicate punch-in for same date yields 409.',
    defaultBody: {
      emp_code: 'EMP0001',
      punched_at: 1783396800000, // 2026-07-07 04:00 UTC = 09:30 IST
      status: 'PRESENT'
    }
  },
  {
    id: 'punch_out',
    method: 'POST',
    path: '/attendance/punch-out',
    tag: 'attendance',
    summary: 'Record a punch-out',
    description: 'Closes most recent open punch-in. Computes work_hours (R4), overtime (R3), and half_day (R5). Simultaneous punch-outs yield exactly one 200 and one 409.',
    defaultBody: {
      emp_code: 'EMP0006',
      punched_at: 1783429200000 // 2026-07-07 13:00 UTC = 18:30 IST
    }
  },
  {
    id: 'list_attendance',
    method: 'GET',
    path: '/attendance',
    tag: 'attendance',
    summary: 'List attendance records',
    description: 'Sorted by date descending, emp_code ascending.',
    defaultParams: { emp_code: '', date_from: '', date_to: '', status: '', page: 1, page_size: 20 }
  },
  {
    id: 'regularize',
    method: 'PATCH',
    path: '/attendance/{emp_code}/{date}',
    tag: 'attendance',
    summary: 'Regularize attendance record',
    description: 'Manually corrects record. Appends one immutable entry to history with audit trail.',
    defaultParams: { emp_code: 'EMP0003', date: '2026-07-06' },
    defaultBody: {
      reason: 'Biometric fingerprint scanner failed during entry',
      regularized_by: 'hr.supervisor',
      punch_in: 1783310400000 // corrected to 09:30 IST
    }
  },
  {
    id: 'employee_monthly',
    method: 'GET',
    path: '/analytics/employees/{emp_code}/monthly',
    tag: 'analytics',
    summary: 'Monthly attendance summary',
    description: 'Working days (R7 Mon-Fri from joined_on), present days (half day = 0.5), late count, and attendance pct.',
    defaultParams: { emp_code: 'EMP0001', month: '2026-07' }
  },
  {
    id: 'dept_summary',
    method: 'GET',
    path: '/analytics/departments/summary',
    tag: 'analytics',
    summary: 'Department monthly summary',
    description: 'Includes employees with 0 logs (R9). Average work hours over present records with work hours.',
    defaultParams: { month: '2026-07', department: '' }
  },
  {
    id: 'late_leaderboard',
    method: 'GET',
    path: '/analytics/leaderboard/late',
    tag: 'analytics',
    summary: 'Late-comers leaderboard',
    description: 'Standard competition ranking ($rank). Ties share rank (1, 2, 2, 4) with limit applied post-ranking.',
    defaultParams: { month: '2026-07', limit: 10, department: '' }
  },
  {
    id: 'dept_trend',
    method: 'GET',
    path: '/analytics/departments/{department}/trend',
    tag: 'analytics',
    summary: 'Daily attendance trend',
    description: 'One row per day from "from" to "to" inclusive using $densify gap-filling with 7-day moving average.',
    defaultParams: { department: 'Engineering', from: '2026-07-01', to: '2026-07-14' }
  },
  {
    id: 'admin_explain',
    method: 'GET',
    path: '/admin/explain/{endpoint}',
    tag: 'admin',
    summary: 'MongoDB explain for endpoint',
    description: 'Runs explain with executionStats verbosity, verifying IXSCAN and zero COLLSCAN.',
    defaultParams: { endpoint: 'department_summary', month: '2026-07' }
  }
];

export const ApiConsole: React.FC<ApiConsoleProps> = ({ employees, setEmployees, logs, setLogs }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDef>(ENDPOINTS[3]); // Punch-in default
  const [queryParams, setQueryParams] = useState<Record<string, any>>(selectedEndpoint.defaultParams || {});
  const [bodyText, setBodyText] = useState<string>(
    selectedEndpoint.defaultBody ? JSON.stringify(selectedEndpoint.defaultBody, null, 2) : ''
  );
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseBody, setResponseBody] = useState<string | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Switch endpoint
  const handleSelectEndpoint = (ep: EndpointDef) => {
    setSelectedEndpoint(ep);
    setQueryParams(ep.defaultParams || {});
    setBodyText(ep.defaultBody ? JSON.stringify(ep.defaultBody, null, 2) : '');
    setResponseStatus(null);
    setResponseBody(null);
  };

  // Execute request against simulator
  const handleExecute = () => {
    const startTime = performance.now();
    let status = 200;
    let data: any = null;

    try {
      if (selectedEndpoint.id === 'health') {
        status = 200;
        data = { status: 'ok' };
      } else if (selectedEndpoint.id === 'create_employee') {
        const body = JSON.parse(bodyText);
        if (!body.emp_code || !/^EMP\d{4,6}$/.test(body.emp_code)) {
          status = 422;
          data = { detail: [{ loc: ['body', 'emp_code'], msg: 'String should match pattern ^EMP\\d{4,6}$', type: 'string_pattern_mismatch' }] };
        } else if (body.shift_start === body.shift_end) {
          status = 422;
          data = { detail: 'shift_start must differ from shift_end' };
        } else if (employees.some(e => e.emp_code === body.emp_code)) {
          status = 409;
          data = { detail: `Employee ${body.emp_code} already exists` };
        } else {
          const newEmp: Employee = {
            ...body,
            created_at: Date.now()
          };
          setEmployees(prev => [...prev, newEmp]);
          status = 201;
          data = newEmp;
        }
      } else if (selectedEndpoint.id === 'list_employees') {
        const dept = queryParams.department;
        const page = parseInt(queryParams.page) || 1;
        const pageSize = parseInt(queryParams.page_size) || 20;
        let filtered = employees;
        if (dept) {
          filtered = filtered.filter(e => e.department === dept);
        }
        filtered.sort((a, b) => a.emp_code.localeCompare(b.emp_code));
        const total = filtered.length;
        const items = filtered.slice((page - 1) * pageSize, page * pageSize);
        status = 200;
        data = { items, total, page, page_size: pageSize };
      } else if (selectedEndpoint.id === 'punch_in') {
        const body = JSON.parse(bodyText);
        const emp = employees.find(e => e.emp_code === body.emp_code);
        if (!emp) {
          status = 404;
          data = { detail: `Employee '${body.emp_code}' not found` };
        } else {
          const punchMs = body.punched_at ? truncateToSeconds(body.punched_at) : truncateToSeconds(Date.now());
          const attDate = computeAttendanceDate(emp.shift_start, emp.shift_end, punchMs);
          const isDuplicate = logs.some(l => l.emp_code === emp.emp_code && l.date === attDate);

          if (isDuplicate) {
            status = 409;
            data = { detail: `Already punched in for date ${attDate}` };
          } else {
            const lateMin = computeLateMinutes(attDate, emp.shift_start, punchMs);
            const newRecord: AttendanceRecord = {
              emp_code: emp.emp_code,
              date: attDate,
              status: body.status || 'PRESENT',
              punch_in: punchMs,
              punch_out: null,
              work_hours: null,
              late_minutes: lateMin,
              overtime_minutes: 0,
              half_day: false,
              history: []
            };
            setLogs(prev => [newRecord, ...prev]);
            status = 201;
            data = newRecord;
          }
        }
      } else if (selectedEndpoint.id === 'punch_out') {
        const body = JSON.parse(bodyText);
        const emp = employees.find(e => e.emp_code === body.emp_code);
        if (!emp) {
          status = 404;
          data = { detail: `Employee '${body.emp_code}' not found` };
        } else {
          const punchOutMs = body.punched_at ? truncateToSeconds(body.punched_at) : truncateToSeconds(Date.now());
          // Find most recent record with punch_in <= punchOutMs
          const eligibleLogs = logs
            .filter(l => l.emp_code === emp.emp_code && l.punch_in !== null && l.punch_in <= punchOutMs)
            .sort((a, b) => (b.punch_in || 0) - (a.punch_in || 0));

          if (eligibleLogs.length === 0) {
            status = 404;
            data = { detail: 'No matching punch-in found' };
          } else {
            const target = eligibleLogs[0];
            if (target.punch_out !== null) {
              status = 409;
              data = { detail: 'That record is already punched out' };
            } else if (punchOutMs <= (target.punch_in || 0)) {
              status = 422;
              data = { detail: 'punched_at must be strictly after punch_in' };
            } else if ((punchOutMs - (target.punch_in || 0)) > 24 * 3600 * 1000) {
              status = 422;
              data = { detail: 'Punch-out cannot be more than 24 hours after punch-in' };
            } else {
              const workHrs = computeWorkHours(target.punch_in!, punchOutMs);
              const otMin = computeOvertimeMinutes(target.date, emp.shift_start, emp.shift_end, punchOutMs);
              const halfDay = computeHalfDay(workHrs);

              const updated: AttendanceRecord = {
                ...target,
                punch_out: punchOutMs,
                work_hours: workHrs,
                overtime_minutes: otMin,
                half_day: halfDay
              };

              setLogs(prev => prev.map(l => (l.emp_code === target.emp_code && l.date === target.date ? updated : l)));
              status = 200;
              data = updated;
            }
          }
        }
      } else if (selectedEndpoint.id === 'list_attendance') {
        let filtered = [...logs];
        if (queryParams.emp_code) filtered = filtered.filter(l => l.emp_code === queryParams.emp_code);
        if (queryParams.status) filtered = filtered.filter(l => l.status === queryParams.status);
        if (queryParams.date_from) filtered = filtered.filter(l => l.date >= queryParams.date_from);
        if (queryParams.date_to) filtered = filtered.filter(l => l.date <= queryParams.date_to);

        filtered.sort((a, b) => {
          if (b.date !== a.date) return b.date.localeCompare(a.date);
          return a.emp_code.localeCompare(b.emp_code);
        });

        const page = parseInt(queryParams.page) || 1;
        const pageSize = parseInt(queryParams.page_size) || 20;
        const total = filtered.length;
        const items = filtered.slice((page - 1) * pageSize, page * pageSize);

        status = 200;
        data = { items, total, page, page_size: pageSize };
      } else if (selectedEndpoint.id === 'regularize') {
        const body = JSON.parse(bodyText);
        const empCode = queryParams.emp_code;
        const dateStr = queryParams.date;
        const emp = employees.find(e => e.emp_code === empCode);
        const target = logs.find(l => l.emp_code === empCode && l.date === dateStr);

        if (!emp || !target) {
          status = 404;
          data = { detail: `No attendance record found for ${empCode} on ${dateStr}` };
        } else if (body.status === 'ABSENT' || body.status === 'LEAVE') {
          if (body.punch_in || body.punch_out) {
            status = 422;
            data = { detail: 'Setting status to ABSENT or LEAVE clears punch times; punch_in/punch_out cannot be supplied' };
          } else {
            // Apply absent/leave
            const updated: AttendanceRecord = {
              ...target,
              status: body.status,
              punch_in: null,
              punch_out: null,
              work_hours: null,
              late_minutes: 0,
              overtime_minutes: 0,
              half_day: false,
              history: [
                ...target.history,
                {
                  at: Date.now(),
                  by: body.regularized_by,
                  reason: body.reason,
                  changes: { status: { from: target.status, to: body.status } }
                }
              ]
            };
            setLogs(prev => prev.map(l => (l.emp_code === empCode && l.date === dateStr ? updated : l)));
            status = 200;
            data = updated;
          }
        } else {
          // Regularize presence status
          const targetIn = body.punch_in ? truncateToSeconds(body.punch_in) : target.punch_in;
          if (!targetIn) {
            status = 422;
            data = { detail: 'Presence status requires a punch_in' };
          } else {
            const checkDate = computeAttendanceDate(emp.shift_start, emp.shift_end, targetIn);
            if (checkDate !== dateStr) {
              status = 422;
              data = { detail: `punch_in belongs to attendance date ${checkDate}, which does not match record date ${dateStr}` };
            } else {
              const targetOut = body.punch_out ? truncateToSeconds(body.punch_out) : target.punch_out;
              const lateMin = computeLateMinutes(dateStr, emp.shift_start, targetIn);
              let workHrs = target.work_hours;
              let otMin = target.overtime_minutes;
              let halfDay = target.half_day;

              if (targetOut) {
                workHrs = computeWorkHours(targetIn, targetOut);
                otMin = computeOvertimeMinutes(dateStr, emp.shift_start, emp.shift_end, targetOut);
                halfDay = computeHalfDay(workHrs);
              }

              const changes: Record<string, any> = {};
              if (target.punch_in !== targetIn) changes['punch_in'] = { from: target.punch_in, to: targetIn };
              if (target.late_minutes !== lateMin) changes['late_minutes'] = { from: target.late_minutes, to: lateMin };
              if (target.work_hours !== workHrs) changes['work_hours'] = { from: target.work_hours, to: workHrs };

              if (Object.keys(changes).length === 0) {
                status = 422;
                data = { detail: 'Request does not change any field' };
              } else {
                const updated: AttendanceRecord = {
                  ...target,
                  punch_in: targetIn,
                  punch_out: targetOut,
                  work_hours: workHrs,
                  late_minutes: lateMin,
                  overtime_minutes: otMin,
                  half_day: halfDay,
                  history: [
                    ...target.history,
                    {
                      at: Date.now(),
                      by: body.regularized_by,
                      reason: body.reason,
                      changes
                    }
                  ]
                };
                setLogs(prev => prev.map(l => (l.emp_code === empCode && l.date === dateStr ? updated : l)));
                status = 200;
                data = updated;
              }
            }
          }
        }
      } else if (selectedEndpoint.id === 'employee_monthly') {
        const empCode = queryParams.emp_code;
        const month = queryParams.month;
        const emp = employees.find(e => e.emp_code === empCode);
        if (!emp) {
          status = 404;
          data = { detail: `Employee '${empCode}' not found` };
        } else {
          const workingDays = computeWorkingDays(emp.joined_on, month);
          const empLogs = logs.filter(l => l.emp_code === empCode && l.date.startsWith(month));
          let presentDays = 0;
          let leaveDays = 0;
          let lateCount = 0;
          let totalLate = 0;
          let totalOt = 0;

          for (const l of empLogs) {
            const [y, m, d] = l.date.split('-').map(Number);
            const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
            const isMonFri = dow >= 1 && dow <= 5;
            if (['PRESENT', 'WFH', 'ON_DUTY'].includes(l.status) && isMonFri) {
              presentDays += l.half_day ? 0.5 : 1.0;
            }
            if (l.status === 'LEAVE') leaveDays++;
            if (l.late_minutes > 0) {
              lateCount++;
              totalLate += l.late_minutes;
            }
            totalOt += l.overtime_minutes;
          }

          const pct = workingDays > 0 ? roundHalfUp((presentDays / workingDays) * 100, 2) : null;
          status = 200;
          data = {
            emp_code: empCode,
            month,
            working_days: workingDays,
            present_days: presentDays,
            leave_days: leaveDays,
            late_count: lateCount,
            total_late_minutes: totalLate,
            total_overtime_minutes: totalOt,
            attendance_pct: pct
          };
        }
      } else if (selectedEndpoint.id === 'dept_summary') {
        const items = simulateDepartmentSummary(employees, logs, queryParams.month || '2026-07', queryParams.department || undefined);
        status = 200;
        data = { month: queryParams.month || '2026-07', items };
      } else if (selectedEndpoint.id === 'late_leaderboard') {
        const items = simulateLateLeaderboard(
          employees,
          logs,
          queryParams.month || '2026-07',
          parseInt(queryParams.limit) || 10,
          queryParams.department || undefined
        );
        status = 200;
        data = { month: queryParams.month || '2026-07', items };
      } else if (selectedEndpoint.id === 'dept_trend') {
        const dept = queryParams.department || 'Engineering';
        const fromDate = queryParams.from || '2026-07-01';
        const toDate = queryParams.to || '2026-07-14';
        const deptEmps = employees.filter(e => e.department === dept);

        if (deptEmps.length === 0) {
          status = 404;
          data = { detail: `Department '${dept}' not found` };
        } else {
          const items: any[] = [];
          const rates: (number | null)[] = [];
          const cur = new Date(fromDate);
          const end = new Date(toDate);

          while (cur <= end) {
            const dStr = cur.toISOString().split('T')[0];
            const dow = cur.getUTCDay();
            const isWorkDay = dow >= 1 && dow <= 5;
            const headcount = deptEmps.filter(e => e.joined_on <= dStr).length;
            const dayLogs = logs.filter(l => l.date === dStr && deptEmps.some(e => e.emp_code === l.emp_code));

            let presCount = 0;
            let lateCount = 0;
            for (const l of dayLogs) {
              if (['PRESENT', 'WFH', 'ON_DUTY'].includes(l.status)) presCount += l.half_day ? 0.5 : 1.0;
              if (l.late_minutes > 0) lateCount++;
            }

            let rate: number | null = null;
            if (isWorkDay && headcount > 0) {
              rate = roundHalfUp(presCount / headcount, 4);
            }
            rates.push(rate);

            const winRates = rates.slice(-7).filter(r => r !== null) as number[];
            let movAvg: number | null = null;
            if (winRates.length > 0) {
              movAvg = roundHalfUp(winRates.reduce((a, b) => a + b, 0) / winRates.length, 4);
            }

            items.push({
              date: dStr,
              is_working_day: isWorkDay,
              headcount,
              present_count: presCount,
              late_count: lateCount,
              attendance_rate: rate,
              moving_avg_7d: movAvg
            });

            cur.setDate(cur.getDate() + 1);
          }
          status = 200;
          data = { department: dept, items };
        }
      } else if (selectedEndpoint.id === 'admin_explain') {
        const ep = queryParams.endpoint;
        status = 200;
        data = {
          endpoint: ep,
          collection: ep === 'department_summary' ? 'employees' : 'attendance_logs',
          explain: {
            queryPlanner: {
              plannerVersion: 1,
              namespace: `attendance_db.${ep === 'department_summary' ? 'employees' : 'attendance_logs'}`,
              indexFilterSet: false,
              parsedQuery: { date: { $regex: '^2026-07-' } },
              winningPlan: {
                stage: 'FETCH',
                inputStage: {
                  stage: 'IXSCAN',
                  keyPattern: { date: -1, emp_code: 1 },
                  indexName: 'date_-1_emp_code_1',
                  isMultiKey: false,
                  direction: 'forward'
                }
              },
              rejectedPlans: []
            },
            executionStats: {
              executionSuccess: true,
              nReturned: 9,
              executionTimeMillis: 2,
              totalKeysExamined: 9,
              totalDocsExamined: 9,
              executionStages: {
                stage: 'FETCH',
                nReturned: 9,
                executionTimeMillisEstimate: 0,
                inputStage: {
                  stage: 'IXSCAN',
                  nReturned: 9,
                  indexName: 'date_-1_emp_code_1',
                  keysExamined: 9
                }
              }
            }
          }
        };
      }
    } catch (err: any) {
      status = 400;
      data = { detail: err.message || 'Malformed JSON request body' };
    }

    const elapsed = Math.round(performance.now() - startTime);
    setExecutionTimeMs(Math.max(1, elapsed));
    setResponseStatus(status);
    setResponseHeaders({
      'content-type': 'application/json',
      'x-process-time': `${elapsed}ms`,
      'server': 'uvicorn / FastAPI'
    });
    setResponseBody(JSON.stringify(data, null, 2));
  };

  const handleCopyResponse = () => {
    if (responseBody) {
      navigator.clipboard.writeText(responseBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-emerald-400 bg-emerald-950/80 border-emerald-800';
    if (status === 404) return 'text-amber-400 bg-amber-950/80 border-amber-800';
    if (status === 409) return 'text-rose-400 bg-rose-950/80 border-rose-800';
    return 'text-red-400 bg-red-950/80 border-red-800';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Endpoints List */}
      <div className="lg:col-span-4 space-y-4">
        <div className="glass-panel hud-corner rounded-xl p-4 shadow-xl">
          <div className="flex items-center justify-between mb-3 border-b border-cyan-500/10 pb-2">
            <h3 className="font-semibold text-xs text-cyan-300 uppercase tracking-wider font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              API Endpoints
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/80">
              {ENDPOINTS.length} OPS
            </span>
          </div>

          <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
            {ENDPOINTS.map(ep => {
              const isSelected = ep.id === selectedEndpoint.id;
              const methodColor =
                ep.method === 'GET'
                  ? 'bg-blue-950 text-blue-400 border-blue-800'
                  : ep.method === 'POST'
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border-amber-800';

              return (
                <button
                  key={ep.id}
                  onClick={() => handleSelectEndpoint(ep)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30'
                      : 'bg-slate-950/50 border-slate-800/80 hover:bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${methodColor}`}>
                    {ep.method}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono font-medium text-slate-200 truncate">{ep.path}</div>
                    <div className="text-[11px] text-slate-400 truncate">{ep.summary}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Database Quick Stats */}
        <div className="glass-panel hud-corner rounded-xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 text-cyan-300 font-semibold mb-1">
            <Database className="w-4 h-4 text-cyan-400" />
            <span className="font-mono text-xs uppercase tracking-wider">MongoDB Telemetry</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-slate-800/60 font-mono">
            <span className="text-slate-400">collection.employees</span>
            <span className="text-cyan-300 font-semibold">{employees.length} docs</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-slate-800/60 font-mono">
            <span className="text-slate-400">collection.attendance_logs</span>
            <span className="text-cyan-300 font-semibold">{logs.length} docs</span>
          </div>
          <div className="flex justify-between items-center py-1 font-mono">
            <span className="text-slate-400">B-Tree Indexes</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              7 active (IXSCAN)
            </span>
          </div>
        </div>
      </div>

      {/* Right Column: Interactive Request & Response Console */}
      <div className="lg:col-span-8 space-y-6">
        {/* Request Panel */}
        <div className="glass-panel hud-corner rounded-xl overflow-hidden shadow-xl">
          {/* Header Bar */}
          <div className="p-4 border-b border-cyan-500/10 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded border uppercase tracking-wider ${
                  selectedEndpoint.method === 'GET'
                    ? 'bg-blue-950/80 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                    : selectedEndpoint.method === 'POST'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                }`}
              >
                {selectedEndpoint.method}
              </span>
              <span className="font-mono text-sm text-cyan-200 font-medium">{selectedEndpoint.path}</span>
            </div>

            <button
              onClick={handleExecute}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-cyan-600 via-indigo-600 to-cyan-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all cursor-pointer uppercase tracking-wider font-mono"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Execute Command
            </button>
          </div>

          <div className="p-4 space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">{selectedEndpoint.description}</p>

            {/* Query / Path Parameters */}
            {selectedEndpoint.defaultParams && Object.keys(selectedEndpoint.defaultParams).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Parameters
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(selectedEndpoint.defaultParams).map(([paramKey, defaultVal]) => (
                    <div key={paramKey} className="space-y-1">
                      <label className="text-xs font-mono text-slate-400">{paramKey}</label>
                      <input
                        type="text"
                        value={queryParams[paramKey] ?? ''}
                        onChange={e => setQueryParams({ ...queryParams, [paramKey]: e.target.value })}
                        className="w-full bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-cyan-200 font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Request Body Editor */}
            {selectedEndpoint.method !== 'GET' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Payload Body
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400">application/json</span>
                </div>
                <textarea
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  rows={selectedEndpoint.id === 'create_employee' ? 8 : 5}
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-lg p-3 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 focus:outline-none leading-relaxed"
                />
              </div>
            )}
          </div>
        </div>

        {/* Response Panel */}
        <div className="glass-panel hud-corner rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-cyan-500/10 bg-slate-950/70 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Response Terminal
              </span>
              {responseStatus !== null && (
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${getStatusColor(responseStatus)} shadow-sm`}>
                  {responseStatus} {responseStatus === 200 ? 'OK' : responseStatus === 201 ? 'CREATED' : responseStatus === 409 ? 'CONFLICT' : responseStatus === 422 ? 'UNPROCESSABLE' : 'ERROR'}
                </span>
              )}
              {executionTimeMs !== null && (
                <span className="text-xs font-mono text-cyan-400/80 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-500" />
                  {executionTimeMs}ms
                </span>
              )}
            </div>

            {responseBody && (
              <button
                onClick={handleCopyResponse}
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-200 transition-colors font-mono"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
            )}
          </div>

          <div className="p-4">
            {responseBody ? (
              <pre className="bg-slate-950/90 border border-cyan-500/20 p-4 rounded-lg overflow-x-auto text-xs font-mono text-emerald-300 max-h-[420px] leading-relaxed shadow-inner">
                {responseBody}
              </pre>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs font-mono">
                Click <span className="font-semibold text-cyan-400">Execute Command</span> to trigger request and stream response payload.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
