import React, { useState } from 'react';
import { CheckCircle2, Clock, Moon, Sun, Scale, HelpCircle } from 'lucide-react';
import {
  computeAttendanceDate,
  computeLateMinutes,
  computeOvertimeMinutes,
  computeWorkHours,
  computeHalfDay,
  roundHalfUp,
  truncateToSeconds
} from '../utils/rulesEngine';

export const RulesLab: React.FC = () => {
  // R1 State
  const [r1ShiftStart, setR1ShiftStart] = useState('22:00');
  const [r1ShiftEnd, setR1ShiftEnd] = useState('06:00');
  const [r1PunchDate, setR1PunchDate] = useState('2026-07-07');
  const [r1PunchTime, setR1PunchTime] = useState('05:45');

  // R2 State
  const [r2ShiftStart, setR2ShiftStart] = useState('09:30');
  const [r2PunchTime, setR2PunchTime] = useState('09:40:01');

  // R3 State
  const [r3ShiftEnd, setR3ShiftEnd] = useState('18:30');
  const [r3PunchOut, setR3PunchOut] = useState('19:10:00');

  // R4 State
  const [r4DurationSec, setR4DurationSec] = useState(30330); // 8.425 hours

  // Calculate R1
  const r1UtcMs = new Date(`${r1PunchDate}T${r1PunchTime}:00Z`).getTime() - (5.5 * 3600 * 1000);
  const r1ResultDate = computeAttendanceDate(r1ShiftStart, r1ShiftEnd, r1UtcMs);

  // Calculate R2
  const [r2H, r2M, r2S] = r2PunchTime.split(':').map(Number);
  const r2PunchMs = Date.UTC(2026, 6, 6, r2H || 0, r2M || 0, r2S || 0) - (5.5 * 3600 * 1000);
  const r2LateMin = computeLateMinutes('2026-07-06', r2ShiftStart, r2PunchMs);

  // Calculate R3
  const [r3H, r3M, r3S] = r3PunchOut.split(':').map(Number);
  const r3PunchOutMs = Date.UTC(2026, 6, 6, r3H || 0, r3M || 0, r3S || 0) - (5.5 * 3600 * 1000);
  const r3OtMin = computeOvertimeMinutes('2026-07-06', '09:30', r3ShiftEnd, r3PunchOutMs);

  // Calculate R4
  const rawHours = r4DurationSec / 3600;
  const standardRound = Math.round(rawHours * 100) / 100;
  const halfUpRound = roundHalfUp(rawHours, 2);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2 mb-1">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          Business Rules Validation Laboratory (R1 – R10)
        </h2>
        <p className="text-xs text-slate-400">
          Interactive validator demonstrating edge cases, boundary conditions, and algorithmic decisions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rule R1: Overnight Shifts */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-sm text-slate-200">Rule R1: Overnight Shift Date</h3>
            </div>
            <span className="text-[11px] font-mono text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
              IST (UTC+05:30)
            </span>
          </div>

          <p className="text-xs text-slate-400">
            When <code className="text-indigo-300 font-mono">shift_end &lt;= shift_start</code>, a punch-in prior to shift_end belongs to the previous calendar day.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <label className="text-slate-400 block mb-1">Shift Start</label>
              <input
                type="text"
                value={r1ShiftStart}
                onChange={e => setR1ShiftStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Shift End</label>
              <input
                type="text"
                value={r1ShiftEnd}
                onChange={e => setR1ShiftEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Punch IST Date</label>
              <input
                type="date"
                value={r1PunchDate}
                onChange={e => setR1PunchDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Punch IST Time</label>
              <input
                type="text"
                value={r1PunchTime}
                onChange={e => setR1PunchTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 rounded-lg border border-indigo-900/50 flex items-center justify-between font-mono text-xs">
            <span className="text-slate-400">Computed Attendance Date:</span>
            <span className="text-sm font-bold text-emerald-400">{r1ResultDate}</span>
          </div>
        </div>

        {/* Rule R2: Grace Period & Late Minutes */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-sm text-slate-200">Rule R2: 10-Min Grace Period</h3>
            </div>
            <span className="text-[11px] font-mono text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
              Strictly &gt; 10:00
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Late ONLY if strictly &gt; 10:00 after shift_start. When late, measured from shift_start, not grace end!
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <label className="text-slate-400 block mb-1">Shift Start</label>
              <input
                type="text"
                value={r2ShiftStart}
                onChange={e => setR2ShiftStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Punch In Time (HH:MM:SS)</label>
              <input
                type="text"
                value={r2PunchTime}
                onChange={e => setR2PunchTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setR2PunchTime('09:40:00')}
              className="px-2 py-1 bg-slate-800 text-[11px] font-mono rounded hover:bg-slate-700 text-slate-300"
            >
              Test 09:40:00 (On Grace)
            </button>
            <button
              onClick={() => setR2PunchTime('09:40:01')}
              className="px-2 py-1 bg-slate-800 text-[11px] font-mono rounded hover:bg-slate-700 text-slate-300"
            >
              Test 09:40:01 (1s Late)
            </button>
            <button
              onClick={() => setR2PunchTime('10:15:59')}
              className="px-2 py-1 bg-slate-800 text-[11px] font-mono rounded hover:bg-slate-700 text-slate-300"
            >
              Test 10:15:59 (45m)
            </button>
          </div>

          <div className="p-3 bg-slate-950/80 rounded-lg border border-amber-900/50 flex items-center justify-between font-mono text-xs">
            <span className="text-slate-400">Computed late_minutes:</span>
            <span className="text-sm font-bold text-amber-400">{r2LateMin} minutes</span>
          </div>
        </div>

        {/* Rule R3: Overtime >= 30 Minutes */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-sm text-slate-200">Rule R3: Overtime Minimum</h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
              Threshold &gt;= 30m
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Whole minutes elapsed past shift_end, counted only when &gt;= 30 minutes; otherwise 0.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <label className="text-slate-400 block mb-1">Shift End</label>
              <input
                type="text"
                value={r3ShiftEnd}
                onChange={e => setR3ShiftEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Punch Out Time</label>
              <input
                type="text"
                value={r3PunchOut}
                onChange={e => setR3PunchOut(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setR3PunchOut('18:35:00')}
              className="px-2 py-1 bg-slate-800 text-[11px] font-mono rounded hover:bg-slate-700 text-slate-300"
            >
              Test 18:35 (5 min &lt; 30)
            </button>
            <button
              onClick={() => setR3PunchOut('19:10:00')}
              className="px-2 py-1 bg-slate-800 text-[11px] font-mono rounded hover:bg-slate-700 text-slate-300"
            >
              Test 19:10 (40 min &gt;= 30)
            </button>
          </div>

          <div className="p-3 bg-slate-950/80 rounded-lg border border-emerald-900/50 flex items-center justify-between font-mono text-xs">
            <span className="text-slate-400">Computed overtime_minutes:</span>
            <span className="text-sm font-bold text-emerald-400">{r3OtMin} minutes</span>
          </div>
        </div>

        {/* Rule R4 & R8: Half-Up Rounding vs Banker's Rounding */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-purple-400" />
              <h3 className="font-semibold text-sm text-slate-200">Rule R4 & R8: Half-Up Rounding</h3>
            </div>
            <span className="text-[11px] font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800">
              ROUND_HALF_UP
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Python's built-in <code className="text-rose-400 font-mono">round()</code> uses round-half-to-even (banker's rounding), which fails R4! Decimal with ROUND_HALF_UP is required.
          </p>

          <div className="space-y-2 text-xs font-mono">
            <label className="text-slate-400 block">Duration in Seconds (e.g. 30330s = 8.425 hours)</label>
            <input
              type="number"
              value={r4DurationSec}
              onChange={e => setR4DurationSec(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 bg-rose-950/40 rounded-lg border border-rose-900/50">
              <div className="text-[11px] text-rose-300">Banker's round() [Trap]</div>
              <div className="text-sm font-bold text-rose-400 mt-1">{standardRound}</div>
            </div>
            <div className="p-3 bg-emerald-950/40 rounded-lg border border-emerald-900/50">
              <div className="text-[11px] text-emerald-300">Half-Up [Correct R4]</div>
              <div className="text-sm font-bold text-emerald-400 mt-1">{halfUpRound}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
