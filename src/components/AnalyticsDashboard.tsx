import React, { useState } from 'react';
import { BarChart3, TrendingUp, Trophy, Users, Calendar, Award, AlertCircle } from 'lucide-react';
import { Employee, AttendanceRecord } from '../types/attendance';
import { simulateDepartmentSummary, simulateLateLeaderboard, computeWorkingDays, roundHalfUp } from '../utils/rulesEngine';

interface AnalyticsDashboardProps {
  employees: Employee[];
  logs: AttendanceRecord[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ employees, logs }) => {
  const [selectedMonth, setSelectedMonth] = useState('2026-07');
  const [selectedDept, setSelectedDept] = useState('Engineering');
  const [selectedEmp, setSelectedEmp] = useState('EMP0001');

  // Compute department summary
  const deptSummary = simulateDepartmentSummary(employees, logs, selectedMonth);

  // Compute late leaderboard with standard competition ranking
  const leaderboard = simulateLateLeaderboard(employees, logs, selectedMonth, 10);

  // Compute employee monthly for selected employee
  const emp = employees.find(e => e.emp_code === selectedEmp);
  let empMonthlyData = null;
  if (emp) {
    const workingDays = computeWorkingDays(emp.joined_on, selectedMonth);
    const empLogs = logs.filter(l => l.emp_code === selectedEmp && l.date.startsWith(selectedMonth));
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
    empMonthlyData = {
      workingDays,
      presentDays,
      leaveDays,
      lateCount,
      totalLate,
      totalOt,
      attendancePct: pct
    };
  }

  // Trend Simulation for 14 days
  const trendDays: { date: string; rate: number | null; isWorkDay: boolean; headcount: number; presentCount: number }[] = [];
  const deptEmps = employees.filter(e => e.department === selectedDept);
  for (let day = 1; day <= 14; day++) {
    const dStr = `2026-07-${String(day).padStart(2, '0')}`;
    const dt = new Date(`${dStr}T00:00:00Z`);
    const dow = dt.getUTCDay();
    const isWorkDay = dow >= 1 && dow <= 5;
    const headcount = deptEmps.filter(e => e.joined_on <= dStr).length;
    const dayLogs = logs.filter(l => l.date === dStr && deptEmps.some(e => e.emp_code === l.emp_code));
    let pres = 0;
    for (const l of dayLogs) {
      if (['PRESENT', 'WFH', 'ON_DUTY'].includes(l.status)) {
        pres += l.half_day ? 0.5 : 1.0;
      }
    }
    const rate = isWorkDay && headcount > 0 ? roundHalfUp(pres / headcount, 4) : null;
    trendDays.push({ date: dStr, rate, isWorkDay, headcount, presentCount: pres });
  }

  return (
    <div className="space-y-8">
      {/* Top Filter Bar */}
      <div className="glass-panel hud-corner rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-cyan-400" />
          <span className="text-xs font-semibold text-cyan-300 font-mono uppercase tracking-wider">Analytics Target Month:</span>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-slate-950/90 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 focus:outline-none"
          >
            <option value="2026-07">2026-07 (July 2026)</option>
            <option value="2026-06">2026-06 (June 2026)</option>
            <option value="2026-08">2026-08 (August 2026)</option>
          </select>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300">R8 Rounding:</span> <span className="text-emerald-400 font-bold">2 decimals half-up</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-slate-300">Rates:</span> <span className="text-cyan-400 font-bold">4 decimals half-up</span>
          </span>
        </div>
      </div>

      {/* Grid 1: Department Summary & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Department Monthly Summary (8 cols) */}
        <div className="lg:col-span-8 glass-panel hud-corner rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <h3 className="font-semibold text-xs text-cyan-300 uppercase tracking-wider font-mono">Department Monthly Summary</h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
              R9: 0-Log Staff Included
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-cyan-400/80 font-mono border-b border-cyan-500/20 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Headcount</th>
                  <th className="py-2.5 px-3">Present</th>
                  <th className="py-2.5 px-3">Avg Work Hrs</th>
                  <th className="py-2.5 px-3">Late Incidents</th>
                  <th className="py-2.5 px-3">Late Min</th>
                  <th className="py-2.5 px-3">Leave</th>
                  <th className="py-2.5 px-3">On Duty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {deptSummary.map(row => (
                  <tr key={row.department} className="hover:bg-cyan-950/20 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-100 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      {row.department}
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-bold">{row.headcount}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">{row.present_days}</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {row.avg_work_hours !== null ? `${row.avg_work_hours}h` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-amber-400">{row.late_count}</td>
                    <td className="py-2.5 px-3 text-amber-300 font-bold">{row.total_late_minutes}m</td>
                    <td className="py-2.5 px-3 text-slate-400">{row.leave_count}</td>
                    <td className="py-2.5 px-3 text-blue-400">{row.on_duty_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Late-comers Leaderboard (4 cols) */}
        <div className="lg:col-span-4 glass-panel hud-corner rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-xs text-amber-300 uppercase tracking-wider font-mono">Late Leaderboard</h3>
            </div>
            <span className="text-[10px] font-mono text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/80 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
              $rank (1, 2, 2, 4)
            </span>
          </div>

          <div className="space-y-2">
            {leaderboard.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center font-mono">No late incidents in target period.</p>
            ) : (
              leaderboard.map(item => (
                <div
                  key={item.emp_code}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-cyan-500/40 hover:bg-cyan-950/20 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded flex items-center justify-center font-mono text-xs font-bold ${
                        item.rank === 1
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      #{item.rank}
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{item.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {item.emp_code} · {item.department}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-xs font-bold text-amber-400">{item.total_late_minutes} min</div>
                    <div className="text-[10px] text-slate-400">{item.late_count} times</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Grid 2: Department Trend & Employee Monthly Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Department Trend Chart (7 cols) */}
        <div className="lg:col-span-7 glass-panel hud-corner rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-xs text-emerald-300 uppercase tracking-wider font-mono">Attendance Trend ($densify)</h3>
            </div>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="bg-slate-950/90 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="Engineering">Engineering</option>
              <option value="Product">Product</option>
              <option value="Operations">Operations</option>
              <option value="Support">Support</option>
            </select>
          </div>

          <p className="text-xs text-slate-400">
            Returns exactly one row per calendar day from <span className="font-mono text-slate-300">from</span> to{' '}
            <span className="font-mono text-slate-300">to</span> via MongoDB <code className="text-indigo-400">$densify</code>.
          </p>

          {/* Visual Bars for Days */}
          <div className="grid grid-cols-7 gap-2 pt-2">
            {trendDays.map((d, idx) => {
              const dayNum = d.date.split('-')[2];
              return (
                <div
                  key={d.date}
                  className={`p-2 rounded-lg border flex flex-col justify-between h-20 ${
                    d.isWorkDay
                      ? 'bg-slate-950/70 border-slate-800'
                      : 'bg-slate-950/30 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                    <span>Jul {dayNum}</span>
                    <span className={d.isWorkDay ? 'text-emerald-400' : 'text-slate-600'}>
                      {d.isWorkDay ? 'WD' : 'WE'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-mono font-bold text-slate-200">
                      {d.rate !== null ? `${(d.rate * 100).toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {d.presentCount}/{d.headcount}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Employee Monthly Summary (5 cols) */}
        <div className="lg:col-span-5 glass-panel hud-corner rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-cyan-400" />
              <h3 className="font-semibold text-xs text-cyan-300 uppercase tracking-wider font-mono">Employee Monthly Summary</h3>
            </div>
            <select
              value={selectedEmp}
              onChange={e => setSelectedEmp(e.target.value)}
              className="bg-slate-950/90 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
            >
              {employees.map(e => (
                <option key={e.emp_code} value={e.emp_code}>
                  {e.emp_code} - {e.name}
                </option>
              ))}
            </select>
          </div>

          {emp && empMonthlyData ? (
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-950/80 rounded-lg border border-cyan-500/20 shadow-inner">
                <div className="font-semibold text-cyan-200 mb-1 flex items-center justify-between">
                  <span>{emp.name}</span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">{emp.emp_code}</span>
                </div>
                <div className="text-slate-400 text-[11px] space-y-0.5">
                  <div>Dept: <span className="text-slate-200">{emp.department}</span></div>
                  <div>Shift: <span className="text-slate-200">{emp.shift_start} - {emp.shift_end} (IST)</span> · Joined: <span className="text-slate-200">{emp.joined_on}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Working Days (R7)</div>
                  <div className="text-base font-bold text-cyan-400 mt-0.5">{empMonthlyData.workingDays}</div>
                </div>
                <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Present Days (R6)</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">{empMonthlyData.presentDays}</div>
                </div>
                <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Attendance %</div>
                  <div className="text-base font-bold text-white mt-0.5">
                    {empMonthlyData.attendancePct !== null ? `${empMonthlyData.attendancePct}%` : '—'}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Late Record</div>
                  <div className="text-base font-bold text-amber-400 mt-0.5">{empMonthlyData.totalLate}m ({empMonthlyData.lateCount}x)</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-6 text-center font-mono">Select employee to inspect summary.</p>
          )}
        </div>
      </div>
    </div>
  );
};
