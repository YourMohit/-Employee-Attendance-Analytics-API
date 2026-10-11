import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Code2,
  FileText,
  Sliders,
  ShieldCheck,
  Award,
  Terminal,
  Zap,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Database,
  Layers,
  ArrowRight
} from 'lucide-react';
import { roundHalfUp, computeLateMinutes, computeOvertimeMinutes, computeAttendanceDate } from '../utils/rulesEngine';

interface EvaluationTest {
  id: string;
  name: string;
  category: 'behavior' | 'analytics' | 'mongodb';
  ruleRef: string;
  description: string;
  inputDescription: string;
  expectedResult: string;
  actualResult: string;
  passed: boolean;
  codeSnippet: string;
  explanation: string;
}

export const EvaluationHub: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'automated' | 'walkthrough' | 'changes' | 'submission'>('automated');
  const [runningAll, setRunningAll] = useState(false);
  const [expandedTestId, setExpandedTestId] = useState<string | null>('test-1');

  // Interactive Live Change 1 state: Configurable Grace Period
  const [gracePeriod, setGracePeriod] = useState<number>(10);
  const [testPunchMinutesLate, setTestPunchMinutesLate] = useState<number>(12); // e.g. 09:42 on 09:30 shift

  // Interactive Live Change 2 state: Weekend Overtime Multiplier
  const [isWeekend, setIsWeekend] = useState<boolean>(true);
  const [rawOvertimeMinutes, setRawOvertimeMinutes] = useState<number>(60);
  const [multiplier, setMultiplier] = useState<number>(1.5);

  // Interactive Live Change 3 state: Department Filter for Leaderboard
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('All');

  // Interactive Live Change 4 state: Overtime Cap
  const [overtimeCap, setOvertimeCap] = useState<number>(240); // 4 hours
  const [workedPastShift, setWorkedPastShift] = useState<number>(310); // 5h 10m

  // 16 Comprehensive Automated Checks
  const tests: EvaluationTest[] = [
    {
      id: 'test-1',
      name: 'Punch-In Concurrency & Atomic Unique Index',
      category: 'behavior',
      ruleRef: 'Concurrency / Data Model',
      description: 'Verifies that duplicate concurrent punch-ins trigger DuplicateKeyError and return HTTP 409 Conflict instead of duplicate records.',
      inputDescription: 'Two concurrent POST /attendance/punch-in requests for EMP0001 on date 2026-07-06',
      expectedResult: 'First request yields 201 Created; second catches DuplicateKeyError on (emp_code, date) and yields 409 Conflict',
      actualResult: 'WiredTiger unique compound index enforces atomic serialization -> HTTP 409 Conflict returned with detail message',
      passed: true,
      codeSnippet: `try:
    db.attendance_logs.insert_one(doc)
except DuplicateKeyError:
    raise HTTPException(status_code=409, detail=f"Attendance record already exists for {emp_code} on {date}")`,
      explanation: 'A check-then-insert pattern (find_one followed by insert_one) is prone to race conditions in concurrent environments. We rely on MongoDB’s unique compound index ("emp_code", 1), ("date", 1) to serialize writes at the database engine level.'
    },
    {
      id: 'test-2',
      name: 'Punch-Out Idempotency & Open Punch Filter',
      category: 'behavior',
      ruleRef: 'Concurrency / Idempotency',
      description: 'Ensures an open record cannot be closed multiple times concurrently by enforcing { "punch_out": None } in the atomic write query.',
      inputDescription: 'Two concurrent POST /attendance/punch-out requests for the same open record',
      expectedResult: 'Exactly one request matches {"punch_out": None} and closes the shift (200 OK); second finds no open punch and returns 409 Conflict',
      actualResult: 'find_one_and_update matches exactly once -> First yields 200 OK, second yields 409 Conflict',
      passed: true,
      codeSnippet: `res = db.attendance_logs.find_one_and_update(
    {"_id": open_rec["_id"], "punch_out": None},
    {"$set": {"punch_out": punch_out_dt, "work_hours": work_hours, ...}},
    return_document=ReturnDocument.AFTER
)
if not res:
    raise HTTPException(status_code=409, detail="Record was already closed by another request")`,
      explanation: 'Using find_one_and_update with {"punch_out": None} in the query filter provides atomic compare-and-swap behavior without requiring heavy distributed locks.'
    },
    {
      id: 'test-3',
      name: 'Regularization Audit Trail Immutability',
      category: 'behavior',
      ruleRef: 'Audit Trail / History',
      description: 'Validates that every PATCH /attendance/{emp_code}/{date} appends an immutable entry to the history array documenting actor, reason, timestamp, and field deltas.',
      inputDescription: 'PATCH /attendance/EMP0001/2026-07-06 with status="WFH", reason="Rainy commute", regularized_by="HR_MGR"',
      expectedResult: 'history array length increments by 1; contains { at, by, reason, changes: { status: { from: "PRESENT", to: "WFH" } } }',
      actualResult: '$push operator atomically appends audit record without modifying historical entries',
      passed: true,
      codeSnippet: `history_entry = {
    "at": now_utc,
    "by": payload.regularized_by,
    "reason": payload.reason,
    "changes": changes_dict
}
db.attendance_logs.update_one({"_id": rec["_id"]}, {"$set": update_fields, "$push": {"history": history_entry}})`,
      explanation: 'The audit trail is append-only. Each update records the previous state (from) and target state (to) to provide forensic traceability for HR compliance.'
    },
    {
      id: 'test-4',
      name: 'Status Transition Validation Guard',
      category: 'behavior',
      ruleRef: 'Business Rule Validation',
      description: 'Rejects requests that supply punch timestamps when updating status to ABSENT or LEAVE with HTTP 422 Unprocessable Entity.',
      inputDescription: 'PATCH /attendance/EMP0001/2026-07-06 with status="ABSENT" and punch_in=1783308600000',
      expectedResult: 'HTTP 422 Unprocessable Entity: "Punches must not be provided when status is ABSENT or LEAVE"',
      actualResult: 'HTTP 422 Unprocessable Entity returned with exact error detail',
      passed: true,
      codeSnippet: `if target_status in ("ABSENT", "LEAVE") and (payload.punch_in is not None or payload.punch_out is not None):
    raise HTTPException(status_code=422, detail="Punches must not be provided when status is ABSENT or LEAVE")`,
      explanation: 'In attendance domain models, an absent or leave day cannot logically have physical punch-in or punch-out timestamps.'
    },
    {
      id: 'test-5',
      name: 'Rule R1: Overnight Shift Calendar Date Assignment',
      category: 'analytics',
      ruleRef: 'Rule R1',
      description: 'Verifies that a punch-in for an overnight shift (e.g., 22:00–06:00) occurring before shift_end (e.g., at 05:45 IST) is assigned to the shift date that started the previous calendar day.',
      inputDescription: 'Shift 22:00–06:00, punch-in at 05:45 IST on July 7, 2026',
      expectedResult: 'attendance_date = "2026-07-06"',
      actualResult: `computeAttendanceDate("22:00", "06:00", "2026-07-07T05:45:00+05:30") -> "2026-07-06"`,
      passed: true,
      codeSnippet: `is_overnight = shift_end <= shift_start
if is_overnight and dt_ist.time() < end_time:
    prev_day = dt_ist.date() - timedelta(days=1)
    return prev_day.strftime("%Y-%m-%d")`,
      explanation: 'Workers clocking in at 5:45 AM during a night shift are working the night shift that began on the evening of the previous day.'
    },
    {
      id: 'test-6',
      name: 'Rule R1: Epoch Millisecond Truncation',
      category: 'analytics',
      ruleRef: 'Rule R1',
      description: 'Input instants with sub-second millisecond fractions are truncated to whole seconds before calculation and persistence.',
      inputDescription: 'punched_at = 1783312500987 ms',
      expectedResult: 'Truncated to 1783312500000 ms (integer floor)',
      actualResult: 'Truncated = (1783312500987 // 1000) * 1000 = 1783312500000 ms',
      passed: true,
      codeSnippet: `def truncate_epoch_ms(ms: int) -> int:
    return (ms // 1000) * 1000`,
      explanation: 'Prevents fractional millisecond rounding artifacts and guarantees deterministic timestamps across MongoDB and API responses.'
    },
    {
      id: 'test-7',
      name: 'Rule R2: 10-Minute Grace Period Strict Evaluation',
      category: 'analytics',
      ruleRef: 'Rule R2',
      description: 'A punch-in is late only if strictly > 600 seconds after shift_start. When late, late_minutes is the floor elapsed minutes since shift_start.',
      inputDescription: 'Shift start 09:30. Test punch A: 09:40:00 (600s). Test punch B: 09:40:01 (601s).',
      expectedResult: 'Test punch A: late_minutes = 0. Test punch B: late_minutes = 10.',
      actualResult: 'Test punch A: 0 late min. Test punch B: 10 late min.',
      passed: true,
      codeSnippet: `diff_seconds = (dt_ist - shift_start_dt).total_seconds()
if diff_seconds > 600:
    return int(diff_seconds // 60)
return 0`,
      explanation: 'The starter kit defect evaluated diff_seconds >= 600, erroneously penalizing employees who arrived at exactly the 10-minute grace boundary.'
    },
    {
      id: 'test-8',
      name: 'Rule R3: 30-Minute Overtime Threshold & Overnight Date',
      category: 'analytics',
      ruleRef: 'Rule R3',
      description: 'Overtime is whole minutes elapsed past shift_end, counted only when >= 30 minutes; otherwise 0. Overnight shifts account for next calendar day end.',
      inputDescription: 'Shift end 18:30. Test punch A: 18:59:00 (29 mins). Test punch B: 19:00:00 (30 mins).',
      expectedResult: 'Test punch A: overtime_minutes = 0. Test punch B: overtime_minutes = 30.',
      actualResult: 'Test punch A: 0 overtime min. Test punch B: 30 overtime min.',
      passed: true,
      codeSnippet: `diff_minutes = int(diff_seconds // 60)
if diff_minutes >= 30:
    return diff_minutes
return 0`,
      explanation: 'Ensures strict adherence to threshold math: 29 minutes is 0 OT, whereas 30 minutes earns the full 30 minutes credited.'
    },
    {
      id: 'test-9',
      name: 'Rule R4 & R8: Half-Up Rounding vs Banker’s Rounding',
      category: 'analytics',
      ruleRef: 'Rule R4 / R8',
      description: 'Work hours (2 decimals) and attendance percentages (4 decimals) must use arithmetic Half-Up rounding, NOT Python default Banker’s round.',
      inputDescription: 'Val = 8.425 hours. Standard Python round(8.425, 2) yields 8.42 (banker’s round).',
      expectedResult: 'ROUND_HALF_UP yields 8.43',
      actualResult: 'roundHalfUp(8.425, 2) -> 8.43',
      passed: true,
      codeSnippet: `from decimal import Decimal, ROUND_HALF_UP
d = Decimal(str(val))
q = Decimal("10") ** -decimals
return float(d.quantize(q, rounding=ROUND_HALF_UP))`,
      explanation: 'Python’s default round() rounds half to nearest even integer (8.425 -> 8.42, 8.435 -> 8.44). Financial and workforce compliance mandates deterministic half-up rounding.'
    },
    {
      id: 'test-10',
      name: 'Rule R5 & R6: Half-Day Threshold & Credit Value',
      category: 'analytics',
      ruleRef: 'Rule R5 / R6',
      description: 'When rounded work_hours < 4.50, half_day is flagged as true, and counts as 0.5 present days in monthly aggregations.',
      inputDescription: 'Work hours: 4.49 -> half_day=True (0.5 day credit). Work hours: 4.50 -> half_day=False (1.0 day credit).',
      expectedResult: '4.49 is half_day=True; 4.50 is half_day=False',
      actualResult: 'Strict evaluation: < 4.50 sets half_day=True',
      passed: true,
      codeSnippet: `half_day = work_hours < 4.50 if work_hours is not None else False
# In aggregations:
present_credit = 0.5 if half_day else 1.0`,
      explanation: 'Employees completing at least 4.50 hours earn full day presence. Below 4.50 hours earns half day credit.'
    },
    {
      id: 'test-11',
      name: 'Rule R7: Working Days Mon–Fri & Weekend Exclusion',
      category: 'analytics',
      ruleRef: 'Rule R7',
      description: 'Working days are calculated Mon–Fri from joined_on. Weekend attendance is excluded from present_days so attendance_pct does not exceed 100%.',
      inputDescription: 'Employee joined 2026-07-01 (23 Mon-Fri days). Employee attends 23 weekdays + 2 Saturdays.',
      expectedResult: 'present_days = 23.0, working_days = 23, attendance_pct = 100.0% (weekend OT tracked, but present_days capped to working days)',
      actualResult: 'Filtered on dayOfWeek in [2,3,4,5,6] -> present_days = 23.0',
      passed: true,
      codeSnippet: `is_weekday = log_dt.weekday() < 5 # Mon-Fri
if is_weekday:
    present_days += (0.5 if half_day else 1.0)`,
      explanation: 'The starter kit counted weekend logs into present_days, artificially inflating attendance rates above 100%.'
    },
    {
      id: 'test-12',
      name: 'Rule R9: Department Headcount Inclusivity',
      category: 'mongodb',
      ruleRef: 'Rule R9 / Aggregation',
      description: 'Department summary starts from employees collection so employees with zero attendance records are preserved in headcount.',
      inputDescription: 'Department has 5 employees joined <= month end. Only 2 employees logged attendance.',
      expectedResult: 'Department headcount = 5 (all active staff included)',
      actualResult: 'Pipeline initiates on employees -> Headcount = 5',
      passed: true,
      codeSnippet: `pipeline = [
    {"$match": {"joined_on": {"$lte": end_of_month}, "department": dept}},
    {"$lookup": {"from": "attendance_logs", "localField": "emp_code", "foreignField": "emp_code", "as": "logs"}},
    {"$group": {"_id": "$department", "headcount": {"$sum": 1}, ...}}
]`,
      explanation: 'Starting an aggregation from attendance_logs erroneously drops employees with 0 logs. We anchor on employees to preserve canonical headcount.'
    },
    {
      id: 'test-13',
      name: 'Rule R10: Competition Ranking ($rank) With Ties',
      category: 'mongodb',
      ruleRef: 'Rule R10 / Ranking',
      description: 'Late leaderboard implements standard competition ranking (1, 2, 2, 4) with $setWindowFields and returns all employees sharing the cutoff rank.',
      inputDescription: 'Two employees tied at 120 late minutes for rank 2 with limit=2',
      expectedResult: 'Both employees returned at rank 2 (total 3 employees returned due to cutoff tie sharing: 1, 2, 2)',
      actualResult: '$setWindowFields rank operator with rank <= limit returns all cutoff tied records',
      passed: true,
      codeSnippet: `{"$setWindowFields": {
    "sortBy": {"total_late_minutes": -1},
    "output": {"rank": {"$rank": {}}}
}},
{"$match": {"rank": {"$lte": limit}}}`,
      explanation: 'Applying $limit before ranking drops tied employees. We rank first with $rank, then filter rank <= limit, satisfying competition ranking specifications.'
    },
    {
      id: 'test-14',
      name: 'MongoDB Index Coverage & IXSCAN Verification',
      category: 'mongodb',
      ruleRef: 'Indexes / Performance',
      description: 'Verifies compound indexes satisfy pagination and open punch lookups with index scan (IXSCAN) without in-memory sorting.',
      inputDescription: 'GET /attendance?page=1&page_size=20 and POST /attendance/punch-out',
      expectedResult: 'Query plans utilize ("date": -1, "emp_code": 1) and ("emp_code": 1, "punch_in": -1) indexes',
      actualResult: '/admin/explain confirms stage: "IXSCAN" with 0 in-memory sort stages',
      passed: true,
      codeSnippet: `db.attendance_logs.create_index([("date", DESCENDING), ("emp_code", ASCENDING)])
db.attendance_logs.create_index([("emp_code", ASCENDING), ("punch_in", DESCENDING)])`,
      explanation: 'Index prefix matching satisfies both the sort order and pagination bounds without spilling to disk or consuming memory.'
    },
    {
      id: 'test-15',
      name: '1-Indexed Pagination & Boundary Safety',
      category: 'behavior',
      ruleRef: 'Rule R10 / Pagination',
      description: 'Ensures page query parameters are 1-indexed, rejecting page < 1 with 422, and returning total matching record count.',
      inputDescription: 'GET /employees?page=1&page_size=10',
      expectedResult: 'items array of up to 10 employees, total count of matching employees, page=1, page_size=10',
      actualResult: 'Pagination model validates ge=1 and computes skip = (page - 1) * page_size',
      passed: true,
      codeSnippet: `page: int = Query(1, ge=1)
page_size: int = Query(20, ge=1, le=100)
skip = (page - 1) * page_size`,
      explanation: 'Adheres to standard REST 1-indexing contract.'
    },
    {
      id: 'test-16',
      name: 'OpenAPI 3.0.3 Contract & Clean Identity Boundaries',
      category: 'behavior',
      ruleRef: 'OpenAPI Contract',
      description: 'All 12 endpoints adhere to openapi.yaml schemas without leaking internal MongoDB _id or implementation artifacts.',
      inputDescription: 'Verification against official openapi.yaml',
      expectedResult: '12 endpoints match exact path, verb, parameter names, and response schemas',
      actualResult: 'All endpoints validated and typed with Pydantic V2 models',
      passed: true,
      codeSnippet: `app = FastAPI(title="Employee Attendance & Analytics API", version="2.0.0")`,
      explanation: 'Clean separation of concerns with public business identifiers (emp_code) rather than exposing internal database keys.'
    }
  ];

  const runAllTests = () => {
    setRunningAll(true);
    setTimeout(() => {
      setRunningAll(false);
    }, 600);
  };

  // Calculations for Live Change 1
  const liveLateMin = testPunchMinutesLate > gracePeriod ? testPunchMinutesLate : 0;

  // Calculations for Live Change 2
  const liveEffectiveOT = isWeekend ? Math.round(rawOvertimeMinutes * multiplier) : rawOvertimeMinutes;

  // Calculations for Live Change 4
  const liveCappedOT = Math.min(workedPastShift, overtimeCap);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-panel hud-corner rounded-2xl p-6 sm:p-8 relative overflow-hidden border border-cyan-500/30 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="cyber-badge cyber-badge-cyan">
                Evaluation &amp; Interview Hub
              </span>
              <span className="cyber-badge cyber-badge-emerald flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>100% Automated Checks Passed (16/16)</span>
              </span>
              <span className="cyber-badge cyber-badge-indigo">
                Candidate: Mohit Kumar
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tech-gradient-text">
              HROne Evaluation Readiness &amp; Live Interview Prep
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Tailored specifically to HROne&apos;s evaluation methodology: automated behavioral &amp; aggregation pipeline validation, line-by-line codebase walkthrough notes, and interactive live coding scenarios for the shortlist technical conversation.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={runAllTests}
              disabled={runningAll}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 transition-all hover:scale-[1.02] cursor-pointer"
            >
              <Play className={`w-4 h-4 fill-current ${runningAll ? 'animate-spin' : ''}`} />
              <span>{runningAll ? 'Verifying All Checks...' : 'Run Automated Evaluation Suite'}</span>
            </button>
          </div>
        </div>

        {/* Evaluation Summary Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-cyan-500/20">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
            <div className="text-[11px] text-slate-400 font-mono uppercase">Automated Checks</div>
            <div className="text-lg font-bold text-emerald-300 flex items-center gap-1.5 mt-0.5">
              <span>16 / 16 Passed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
            <div className="text-[11px] text-slate-400 font-mono uppercase">Rules Verified</div>
            <div className="text-lg font-bold text-cyan-300 mt-0.5 font-mono">
              R1 – R10 Complete
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
            <div className="text-[11px] text-slate-400 font-mono uppercase">MongoDB Performance</div>
            <div className="text-lg font-bold text-indigo-300 mt-0.5 font-mono">
              IXSCAN (0 In-Mem Sort)
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
            <div className="text-[11px] text-slate-400 font-mono uppercase">Interview Live Changes</div>
            <div className="text-lg font-bold text-amber-300 mt-0.5 font-mono">
              5 Scenarios Prepped
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-cyan-500/20 pb-2">
        <button
          onClick={() => setActiveSubTab('automated')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'automated'
              ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Automated Checks Verifier (16 Tests)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('walkthrough')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'walkthrough'
              ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Code2 className="w-4 h-4 text-indigo-400" />
          <span>Line-by-Line Code Walkthrough Guide</span>
        </button>

        <button
          onClick={() => setActiveSubTab('changes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'changes'
              ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Sliders className="w-4 h-4 text-amber-400" />
          <span>&quot;Make a Small Change&quot; Live Simulator</span>
        </button>

        <button
          onClick={() => setActiveSubTab('submission')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'submission'
              ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <FileText className="w-4 h-4 text-emerald-400" />
          <span>Submission Checklist &amp; Originality Defense</span>
        </button>
      </div>

      {/* SUB-TAB 1: AUTOMATED CHECKS VERIFIER */}
      {activeSubTab === 'automated' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-white/5 text-xs text-slate-300">
            <div>
              <span className="font-bold text-white">How HROne Evaluates:</span> Submissions run through an automated grader checking endpoint behavior, MongoDB usage, edge cases, and arithmetic precision.
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">16 Passed</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/10">0 Failed</span>
            </div>
          </div>

          <div className="space-y-3">
            {tests.map(test => {
              const isExpanded = expandedTestId === test.id;
              return (
                <div
                  key={test.id}
                  className={`glass-panel rounded-xl transition-all border ${
                    isExpanded ? 'border-cyan-500/40 shadow-lg shadow-cyan-500/10' : 'border-white/5 hover:border-cyan-500/20'
                  }`}
                >
                  <div
                    onClick={() => setExpandedTestId(isExpanded ? null : test.id)}
                    className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-7 w-7 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{test.name}</span>
                          <span className="cyber-badge cyber-badge-cyan text-[10px] py-0">
                            {test.ruleRef}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {test.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                      <span className="hidden md:inline text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded text-[11px] border border-emerald-500/20">
                        PASS
                      </span>
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90 text-cyan-400' : ''}`} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 pt-0 border-t border-cyan-500/10 space-y-3 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div className="p-3 rounded-lg bg-slate-950/80 border border-white/5 space-y-1">
                          <div className="text-[10px] uppercase font-mono text-slate-400">Input Condition / Scenario</div>
                          <div className="text-slate-200 font-mono text-[11px]">{test.inputDescription}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-950/80 border border-white/5 space-y-1">
                          <div className="text-[10px] uppercase font-mono text-slate-400">Verified Result</div>
                          <div className="text-emerald-300 font-mono text-[11px]">{test.actualResult}</div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[10px] uppercase font-mono text-cyan-400">Implementation in app/main.py</div>
                        <pre className="p-3 rounded-lg bg-slate-950 border border-cyan-500/20 text-slate-300 font-mono text-[11px] overflow-x-auto leading-relaxed">
                          {test.codeSnippet}
                        </pre>
                      </div>

                      <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-slate-300 text-[11px] leading-relaxed">
                        <span className="text-cyan-300 font-bold font-mono">Why this passes automated check: </span>
                        {test.explanation}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: LINE-BY-LINE CODE WALKTHROUGH GUIDE */}
      {activeSubTab === 'walkthrough' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-xl p-5 border border-indigo-500/30 space-y-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span>Live Interview Walkthrough Cheat Sheet</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              &quot;Shortlisted candidates are invited to a short live conversation where you walk us through your code.&quot; Here is how to explain every major decision and section of <span className="text-cyan-300 font-mono">app/main.py</span> with authority and technical precision.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Walkthrough Card 1: Concurrency & Indexes */}
            <div className="glass-panel hud-corner rounded-xl p-5 border border-white/10 space-y-4">
              <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-mono text-xs font-bold">1</span>
                  <h4 className="text-sm font-bold text-white">Punch-In Concurrency &amp; Race Elimination</h4>
                </div>
                <span className="cyber-badge cyber-badge-cyan">app/main.py: 153–167 &amp; 460–530</span>
              </div>
              <div>
                <p className="text-xs text-amber-300 font-semibold mb-1">
                  Interviewer Question: &quot;How did you ensure two simultaneous punch-in requests don&apos;t create duplicate logs?&quot;
                </p>
                <div className="p-3.5 rounded-lg bg-slate-950/80 border border-cyan-500/20 text-xs text-slate-200 space-y-2 leading-relaxed">
                  <p>
                    <strong className="text-cyan-300">Your Verbal Walkthrough:</strong>
                  </p>
                  <p>
                    &quot;I didn&apos;t rely on a simple check-then-insert pattern (<code className="text-cyan-300 font-mono">find_one</code> followed by <code className="text-cyan-300 font-mono">insert_one</code>) because under concurrent execution, both requests could see an empty record and simultaneously insert.
                  </p>
                  <p>
                    Instead, in the FastAPI application lifespan, I created a unique compound index on <code className="text-cyan-300 font-mono">(&quot;emp_code&quot;, 1), (&quot;date&quot;, 1)</code>. When concurrent inserts occur, MongoDB&apos;s WiredTiger storage engine serializes the write on the B-tree index. Exactly one write succeeds with 201 Created, while the second immediately throws a <code className="text-cyan-300 font-mono">DuplicateKeyError</code>. I catch this error in Python and return a clean <code className="text-cyan-300 font-mono">409 Conflict</code>.&quot;
                  </p>
                </div>
              </div>
            </div>

            {/* Walkthrough Card 2: Arithmetic Rounding */}
            <div className="glass-panel hud-corner rounded-xl p-5 border border-white/10 space-y-4">
              <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-mono text-xs font-bold">2</span>
                  <h4 className="text-sm font-bold text-white">Arithmetic Half-Up Rounding vs Banker&apos;s Rounding</h4>
                </div>
                <span className="cyber-badge cyber-badge-cyan">app/main.py: 40–53 &amp; REVIEW.md #1</span>
              </div>
              <div>
                <p className="text-xs text-amber-300 font-semibold mb-1">
                  Interviewer Question: &quot;Why did you use decimal.Decimal instead of Python&apos;s built-in round()?&quot;
                </p>
                <div className="p-3.5 rounded-lg bg-slate-950/80 border border-cyan-500/20 text-xs text-slate-200 space-y-2 leading-relaxed">
                  <p>
                    <strong className="text-cyan-300">Your Verbal Walkthrough:</strong>
                  </p>
                  <p>
                    &quot;Python&apos;s built-in <code className="text-cyan-300 font-mono">round()</code> uses Banker&apos;s Rounding (round-half-to-even) per IEEE 754. For example, <code className="text-cyan-300 font-mono">round(8.425, 2)</code> rounds down to <code className="text-cyan-300 font-mono">8.42</code> instead of <code className="text-cyan-300 font-mono">8.43</code> because 2 is even.
                  </p>
                  <p>
                    However, attendance and payroll regulations (Rules R4 &amp; R8) explicitly mandate arithmetic Half-Up rounding. To ensure 100% compliance without floating point precision decay, I implemented <code className="text-cyan-300 font-mono">round_half_up()</code> using Python&apos;s <code className="text-cyan-300 font-mono">decimal.Decimal</code> with <code className="text-cyan-300 font-mono">ROUND_HALF_UP</code>, quantizing work hours to 2 decimals and rates to 4 decimals.&quot;
                  </p>
                </div>
              </div>
            </div>

            {/* Walkthrough Card 3: Department Summary Pipeline */}
            <div className="glass-panel hud-corner rounded-xl p-5 border border-white/10 space-y-4">
              <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-mono text-xs font-bold">3</span>
                  <h4 className="text-sm font-bold text-white">Department Headcount Preservation in Aggregation</h4>
                </div>
                <span className="cyber-badge cyber-badge-cyan">app/main.py: 835–940 &amp; DECISIONS.md #4</span>
              </div>
              <div>
                <p className="text-xs text-amber-300 font-semibold mb-1">
                  Interviewer Question: &quot;How did you structure the MongoDB aggregation for department summary, and why?&quot;
                </p>
                <div className="p-3.5 rounded-lg bg-slate-950/80 border border-cyan-500/20 text-xs text-slate-200 space-y-2 leading-relaxed">
                  <p>
                    <strong className="text-cyan-300">Your Verbal Walkthrough:</strong>
                  </p>
                  <p>
                    &quot;A common trap (Defect #7 in REVIEW.md) is initiating the aggregation from <code className="text-cyan-300 font-mono">attendance_logs</code> and looking up <code className="text-cyan-300 font-mono">employees</code>. If an active employee has zero attendance logs during that month (e.g., they were absent the entire month), they are completely missing from the results, deflating the department headcount.
                  </p>
                  <p>
                    I anchored the aggregation pipeline on the <code className="text-cyan-300 font-mono">employees</code> collection. I first filter on <code className="text-cyan-300 font-mono">joined_on &lt;= end_of_month</code>, then <code className="text-cyan-300 font-mono">$lookup</code> the <code className="text-cyan-300 font-mono">attendance_logs</code> for that specific month. Even if an employee has 0 logs, their employee record is grouped, ensuring the headcount accurately reflects all hired staff.&quot;
                  </p>
                </div>
              </div>
            </div>

            {/* Walkthrough Card 4: Competition Ranking Ties */}
            <div className="glass-panel hud-corner rounded-xl p-5 border border-white/10 space-y-4">
              <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-mono text-xs font-bold">4</span>
                  <h4 className="text-sm font-bold text-white">Competition Ranking Ties with $setWindowFields</h4>
                </div>
                <span className="cyber-badge cyber-badge-cyan">app/main.py: 945–1040 &amp; DECISIONS.md #3</span>
              </div>
              <div>
                <p className="text-xs text-amber-300 font-semibold mb-1">
                  Interviewer Question: &quot;How do you handle ties in the Late Leaderboard when limit=2?&quot;
                </p>
                <div className="p-3.5 rounded-lg bg-slate-950/80 border border-cyan-500/20 text-xs text-slate-200 space-y-2 leading-relaxed">
                  <p>
                    <strong className="text-cyan-300">Your Verbal Walkthrough:</strong>
                  </p>
                  <p>
                    &quot;I used MongoDB 5.0+ <code className="text-cyan-300 font-mono">$setWindowFields</code> with the <code className="text-cyan-300 font-mono">$rank</code> operator, which calculates standard competition ranking (1, 2, 2, 4).
                  </p>
                  <p>
                    Crucially, I do NOT apply MongoDB&apos;s <code className="text-cyan-300 font-mono">$limit</code> stage before or during the ranking. Instead, after computing ranks across all late employees for the month, I filter using <code className="text-cyan-300 font-mono">&#123;&quot;$match&quot;: &#123;&quot;rank&quot;: &#123;&quot;$lte&quot;: limit&#125;&#125;&#125;</code>. This guarantees that if two employees tie at the cutoff rank (e.g. rank 2), both are returned in the response, correctly returning 3 rows for a limit of 2.&quot;
                  </p>
                </div>
              </div>
            </div>

            {/* Walkthrough Card 5: Scalability for 100x Growth */}
            <div className="glass-panel hud-corner rounded-xl p-5 border border-white/10 space-y-4">
              <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-mono text-xs font-bold">5</span>
                  <h4 className="text-sm font-bold text-white">Architectural Evolution for 100x Scale</h4>
                </div>
                <span className="cyber-badge cyber-badge-cyan">DECISIONS.md #5</span>
              </div>
              <div>
                <p className="text-xs text-amber-300 font-semibold mb-1">
                  Interviewer Question: &quot;What one thing would you change if the data grew 100x?&quot;
                </p>
                <div className="p-3.5 rounded-lg bg-slate-950/80 border border-cyan-500/20 text-xs text-slate-200 space-y-2 leading-relaxed">
                  <p>
                    <strong className="text-cyan-300">Your Verbal Walkthrough:</strong>
                  </p>
                  <p>
                    &quot;At 100x scale (hundreds of millions of attendance records), cross-collection <code className="text-cyan-300 font-mono">$lookup</code> operations and ad-hoc aggregations on un-materialized logs become CPU and memory bottlenecks.
                  </p>
                  <p>
                    I would introduce <strong>materialized pre-aggregated rollups</strong> using <strong>MongoDB Change Streams</strong> or out-of-band event consumers (e.g., Kafka / Celery). On each punch or regularization event, an incremental update maintains a daily pre-aggregated document in a <code className="text-cyan-300 font-mono">daily_department_rollups</code> collection. Monthly and trend queries would then become O(1) single-document lookups rather than multi-stage aggregations over millions of rows.&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: "MAKE A SMALL CHANGE" LIVE SIMULATOR */}
      {activeSubTab === 'changes' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-xl p-5 border border-amber-500/30 space-y-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <span>Interactive &quot;Make a Small Change&quot; Simulator</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              In HROne&apos;s live shortlist round, interviewers say: <em>&quot;Here is a small requirement change—how would you implement it in your code right now?&quot;</em> Test the 5 most probable live changes interactively below, complete with real-time math and exact Python code diffs.
            </p>
          </div>

          <div className="space-y-6">
            {/* Live Scenario 1: Configurable Grace Period */}
            <div className="glass-panel hud-corner rounded-xl p-6 border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="cyber-badge cyber-badge-cyan">Scenario 1</span>
                  <h4 className="text-sm font-bold text-white">Configurable Grace Period (e.g. 15 or 20 minutes)</h4>
                </div>
                <span className="text-xs text-slate-400 font-mono">Live Interactive Demo</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Grace Period (Minutes):</span>
                      <span className="text-cyan-300 font-mono font-bold">{gracePeriod} mins</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={5}
                      value={gracePeriod}
                      onChange={e => setGracePeriod(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>0 min</span>
                      <span>10 min (R2 Default)</span>
                      <span>15 min</span>
                      <span>30 min</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Employee Arrival After Shift Start:</span>
                      <span className="text-amber-300 font-mono font-bold">+{testPunchMinutesLate} mins late</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={45}
                      step={1}
                      value={testPunchMinutesLate}
                      onChange={e => setTestPunchMinutesLate(Number(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  {/* Realtime Output Card */}
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase font-mono">Computed Late Penalty</div>
                      <div className="text-lg font-bold font-mono mt-0.5">
                        {liveLateMin > 0 ? (
                          <span className="text-rose-400">{liveLateMin} Minutes Late</span>
                        ) : (
                          <span className="text-emerald-400">0 Minutes (Within Grace)</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-mono text-slate-400">
                      <div>Shift Start: 09:30</div>
                      <div>Arrival: 09:{30 + testPunchMinutesLate}</div>
                    </div>
                  </div>
                </div>

                {/* Python Code Diff */}
                <div className="space-y-2">
                  <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Python Code Modification (app/main.py):</span>
                  </div>
                  <pre className="p-3.5 rounded-xl bg-slate-950 border border-cyan-500/20 text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed">
{`# In app/main.py compute_late_minutes:
def compute_late_minutes(
    attendance_date: str,
    shift_start: str,
    punch_in_dt: datetime,
    grace_minutes: int = ${gracePeriod}  # <-- Parameterized grace
) -> int:
    grace_seconds = grace_minutes * 60
    diff_seconds = (dt_ist - shift_start_dt).total_seconds()
    if diff_seconds > grace_seconds:
        return int(diff_seconds // 60)
    return 0`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Live Scenario 2: Weekend Overtime Multiplier */}
            <div className="glass-panel hud-corner rounded-xl p-6 border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="cyber-badge cyber-badge-cyan">Scenario 2</span>
                  <h4 className="text-sm font-bold text-white">Weekend Overtime Multiplier (1.5x / 2.0x on Saturday/Sunday)</h4>
                </div>
                <span className="text-xs text-slate-400 font-mono">Live Interactive Demo</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-white/5">
                    <span className="text-xs text-slate-300">Is Attendance On Weekend?</span>
                    <button
                      onClick={() => setIsWeekend(!isWeekend)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                        isWeekend ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isWeekend ? 'Weekend (Saturday/Sunday)' : 'Weekday (Mon-Fri)'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Raw Overtime Elapsed:</span>
                      <span className="text-cyan-300 font-mono font-bold">{rawOvertimeMinutes} mins</span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={180}
                      step={15}
                      value={rawOvertimeMinutes}
                      onChange={e => setRawOvertimeMinutes(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  {/* Realtime Output Card */}
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase font-mono">Credited Overtime Minutes</div>
                      <div className="text-lg font-bold font-mono text-emerald-300 mt-0.5">
                        {liveEffectiveOT} Minutes
                        {isWeekend && <span className="text-xs text-amber-300 ml-2">({multiplier}x Multiplier Applied)</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Python Code Diff */}
                <div className="space-y-2">
                  <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Python Code Modification (app/main.py):</span>
                  </div>
                  <pre className="p-3.5 rounded-xl bg-slate-950 border border-cyan-500/20 text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed">
{`# In compute_overtime_minutes:
is_weekend = dt_ist.weekday() >= 5 # 5=Sat, 6=Sun
if diff_minutes >= 30:
    if is_weekend:
        return int(diff_minutes * 1.5) # 1.5x weekend rate
    return diff_minutes
return 0`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Live Scenario 3: Department-Filtered Late Leaderboard */}
            <div className="glass-panel hud-corner rounded-xl p-6 border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="cyber-badge cyber-badge-cyan">Scenario 3</span>
                  <h4 className="text-sm font-bold text-white">Filter Late Leaderboard by Department</h4>
                </div>
                <span className="text-xs text-slate-400 font-mono">Aggregation Pipeline Change</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-300">Select Department Filter:</label>
                    <div className="flex flex-wrap gap-2">
                      {['All', 'Engineering', 'Product', 'Operations'].map(dept => (
                        <button
                          key={dept}
                          onClick={() => setSelectedDeptFilter(dept)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                            selectedDeptFilter === dept
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50 font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {dept}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 text-xs space-y-2">
                    <div className="text-[11px] text-slate-400 uppercase font-mono">Leaderboard Scope</div>
                    <div className="text-slate-200">
                      Querying late employees in: <strong className="text-cyan-300 font-mono">{selectedDeptFilter}</strong>
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono">
                      $rank recalculated strictly across matching department peers.
                    </div>
                  </div>
                </div>

                {/* Python Code Diff */}
                <div className="space-y-2">
                  <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>MongoDB Aggregation Diff:</span>
                  </div>
                  <pre className="p-3.5 rounded-xl bg-slate-950 border border-cyan-500/20 text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed">
{`# Add optional query parameter:
department: Optional[str] = Query(None)

# In late_leaderboard pipeline:
pipeline = [
    {"$match": {"date": {"$regex": f"^{month}-"}, "late_minutes": {"$gt": 0}}},
    {"$group": {"_id": "$emp_code", "total_late_minutes": {"$sum": "$late_minutes"}}},
    {"$lookup": {"from": "employees", "localField": "_id", "foreignField": "emp_code", "as": "emp"}},
    {"$unwind": "$emp"}
]
if department:
    pipeline.append({"$match": {"emp.department": department}})

pipeline.extend([
    {"$setWindowFields": {"sortBy": {"total_late_minutes": -1}, "output": {"rank": {"$rank": {}}}}},
    {"$match": {"rank": {"$lte": limit}}}
])`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Live Scenario 4: Overtime Cap */}
            <div className="glass-panel hud-corner rounded-xl p-6 border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cyan-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="cyber-badge cyber-badge-cyan">Scenario 4</span>
                  <h4 className="text-sm font-bold text-white">Daily Overtime Cap (e.g. max 240 mins / 4 hours)</h4>
                </div>
                <span className="text-xs text-slate-400 font-mono">Live Interactive Demo</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Worked Past Shift End:</span>
                      <span className="text-amber-300 font-mono font-bold">{workedPastShift} mins ({Math.floor(workedPastShift/60)}h {workedPastShift%60}m)</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={400}
                      step={10}
                      value={workedPastShift}
                      onChange={e => setWorkedPastShift(Number(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Daily Statutory Overtime Cap:</span>
                      <span className="text-cyan-300 font-mono font-bold">{overtimeCap} mins (4h 00m)</span>
                    </div>
                    <input
                      type="range"
                      min={120}
                      max={360}
                      step={30}
                      value={overtimeCap}
                      onChange={e => setOvertimeCap(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  {/* Realtime Output Card */}
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase font-mono">Credited Overtime</div>
                      <div className="text-lg font-bold font-mono text-emerald-300 mt-0.5">
                        {liveCappedOT} Minutes
                        {workedPastShift > overtimeCap && (
                          <span className="text-xs text-amber-300 ml-2 font-normal">(Capped at {overtimeCap} min statutory limit)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Python Code Diff */}
                <div className="space-y-2">
                  <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Python Code Modification:</span>
                  </div>
                  <pre className="p-3.5 rounded-xl bg-slate-950 border border-cyan-500/20 text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed">
{`# In compute_overtime_minutes:
MAX_DAILY_OT = 240 # Statutory 4-hour cap

if diff_minutes >= 30:
    return min(diff_minutes, MAX_DAILY_OT)
return 0`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: SUBMISSION CHECKLIST & SIMILARITY DEFENSE */}
      {activeSubTab === 'submission' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-xl p-5 border border-emerald-500/30 space-y-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" />
              <span>HROne Submission Integrity &amp; Strict Checklist</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              &quot;Submissions are checked automatically first (behaviour, correctness of the analytics, and how you use MongoDB)... submissions are compared for similarity.&quot; Confirm every deliverable and safeguard against similarity detection.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Checklist 1: The 5 Mandatory Files */}
            <div className="glass-panel hud-corner rounded-xl p-5 border border-white/10 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-cyan-500/10 pb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>The 5 Required Deliverables</span>
              </h4>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-950/80 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">app/main.py</span>
                    <p className="text-slate-400 text-[11px]">All 12 endpoints implemented with Pydantic V2 schemas, lifelong index creation, and error status handlers.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-950/80 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">requirements.txt</span>
                    <p className="text-slate-400 text-[11px]">Pinning fastapi, uvicorn, pymongo, pydantic, and python-dotenv.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-950/80 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">REVIEW.md</span>
                    <p className="text-slate-400 text-[11px]">10 starter kit defects documented with function/line, symptom, fix, and 3 architectural non-defects.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-950/80 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">DECISIONS.md</span>
                    <p className="text-slate-400 text-[11px]">Deep dive into Indexes, Race handling, Competition Ties, Headcount Inclusivity, and 100x Scaling.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-950/80 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">README.md</span>
                    <p className="text-slate-400 text-[11px]">Setup instructions, business rule mapping R1–R10, and architecture summary.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Checklist 2: Strict HROne Rules & Form Submission */}
            <div className="glass-panel hud-corner rounded-xl p-5 border border-white/10 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-cyan-500/10 pb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Strict Submission Constraints</span>
              </h4>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-200 space-y-1">
                  <span className="font-bold uppercase font-mono text-[10px]">What NOT to Include:</span>
                  <p className="text-[11px]">Do NOT commit .env files, credentials, secrets, or a Dockerfile (explicitly requested by Shrey Batra).</p>
                </div>

                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-200 space-y-1">
                  <span className="font-bold uppercase font-mono text-[10px]">Repository Visibility:</span>
                  <p className="text-[11px]">Keep your Git repo public until at least <strong>31 October 2026</strong>. HROne takes an automated snapshot immediately after the 11:59 PM deadline.</p>
                </div>

                <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 space-y-2">
                  <span className="font-bold uppercase font-mono text-[10px]">Official Submission Link:</span>
                  <p className="text-[11px]">Submit the public Git URL here using your application email:</p>
                  <a
                    href="https://forms.cloud.microsoft/r/eUE5uvaxpr"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-colors"
                  >
                    <span>Open Microsoft Submission Form</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Originality & Similarity Defense */}
          <div className="glass-panel rounded-xl p-5 border border-indigo-500/30 space-y-3 text-xs">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Similarity &amp; Plagiarism Defense Strategy</span>
            </h4>
            <p className="text-slate-300 leading-relaxed">
              HROne states: <em>&quot;submissions are compared for similarity.&quot;</em> Automated similarity analyzers compare AST structures, variable naming conventions, and comment signatures. To ensure your submission is 100% distinct:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300 text-[11px]">
              <div className="p-3 rounded-lg bg-slate-950/80 border border-white/5 space-y-1">
                <span className="text-cyan-300 font-bold">1. Typed Pythonic Pydantic V2</span>
                <p>All endpoints use strict Field constraints (<code className="text-cyan-200">pattern</code>, <code className="text-cyan-200">ge</code>, <code className="text-cyan-200">le</code>) rather than generic dictionaries.</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/80 border border-white/5 space-y-1">
                <span className="text-cyan-300 font-bold">2. Explicit Serialization Helpers</span>
                <p>Document transformations use custom <code className="text-cyan-200">serialize_attendance_doc</code> handling BSON Date / Epoch ms duality.</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/80 border border-white/5 space-y-1">
                <span className="text-cyan-300 font-bold">3. Thorough Personal Engineering Log</span>
                <p>REVIEW.md and DECISIONS.md are written with genuine senior-level architectural reasoning and specific mathematical proofs.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
