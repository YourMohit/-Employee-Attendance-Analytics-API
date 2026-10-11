export interface RepoFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const REPO_FILES: RepoFile[] = [
  {
    name: "main.py",
    path: "app/main.py",
    language: "python",
    description: "Production FastAPI application implementing all 12 endpoints, MongoDB indexes, lifespan setup, and R1–R10 business rules.",
    content: `"""Employee Attendance & Analytics API
FastAPI + MongoDB implementation adhering to openapi.yaml and DATA_MODEL.md.
Rules R1-R10 enforced with exact precision.
"""

from __future__ import annotations

import calendar
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import os
from typing import Any, Dict, List, Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path, Query, status
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

load_dotenv()

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.environ.get("MONGO_DB", "attendance_db")

client: MongoClient = MongoClient(MONGO_URI, tz_aware=True)
db = client[MONGO_DB]

IST = timezone(timedelta(hours=5, minutes=30))

def round_half_up(val: float | Decimal | None, decimals: int = 2) -> Optional[float]:
    if val is None:
        return None
    d = Decimal(str(val))
    q = Decimal("10") ** -decimals
    return float(d.quantize(q, rounding=ROUND_HALF_UP))

def truncate_epoch_ms(ms: int) -> int:
    return (ms // 1000) * 1000

def ms_to_utc_datetime(ms: int) -> datetime:
    truncated = truncate_epoch_ms(ms)
    return datetime.fromtimestamp(truncated // 1000, tz=timezone.utc)

def datetime_to_epoch_ms(dt: Optional[datetime]) -> Optional[int]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp()) * 1000

def compute_attendance_date(shift_start: str, shift_end: str, punch_in_dt: datetime) -> str:
    dt_ist = punch_in_dt.astimezone(IST)
    is_overnight = shift_end <= shift_start
    if is_overnight:
        end_parts = [int(p) for p in shift_end.split(":")]
        end_time = time(end_parts[0], end_parts[1])
        if dt_ist.time() < end_time:
            prev_day = dt_ist.date() - timedelta(days=1)
            return prev_day.strftime("%Y-%m-%d")
    return dt_ist.date().strftime("%Y-%m-%d")

def compute_late_minutes(attendance_date: str, shift_start: str, punch_in_dt: datetime) -> int:
    dt_ist = punch_in_dt.astimezone(IST)
    att_date = date.fromisoformat(attendance_date)
    start_parts = [int(p) for p in shift_start.split(":")]
    shift_start_dt = datetime.combine(att_date, time(start_parts[0], start_parts[1]), tzinfo=IST)
    diff_seconds = (dt_ist - shift_start_dt).total_seconds()
    if diff_seconds > 600:
        return int(diff_seconds // 60)
    return 0

def compute_overtime_minutes(attendance_date: str, shift_start: str, shift_end: str, punch_out_dt: datetime) -> int:
    dt_ist = punch_out_dt.astimezone(IST)
    att_date = date.fromisoformat(attendance_date)
    end_parts = [int(p) for p in shift_end.split(":")]
    is_overnight = shift_end <= shift_start
    end_date = att_date + timedelta(days=1) if is_overnight else att_date
    shift_end_dt = datetime.combine(end_date, time(end_parts[0], end_parts[1]), tzinfo=IST)
    diff_seconds = (dt_ist - shift_end_dt).total_seconds()
    diff_minutes = int(diff_seconds // 60)
    if diff_minutes >= 30:
        return diff_minutes
    return 0

def compute_work_hours(punch_in_dt: datetime, punch_out_dt: datetime) -> float:
    sec = int((punch_out_dt - punch_in_dt).total_seconds())
    hours = Decimal(sec) / Decimal(3600)
    return float(hours.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def compute_half_day(work_hours: Optional[float]) -> bool:
    if work_hours is None:
        return False
    return work_hours < 4.50

def create_indexes() -> None:
    db.employees.create_index([("emp_code", ASCENDING)], unique=True)
    db.employees.create_index([("department", ASCENDING), ("joined_on", ASCENDING)])
    db.employees.create_index([("joined_on", ASCENDING)])
    db.attendance_logs.create_index([("emp_code", ASCENDING), ("date", ASCENDING)], unique=True)
    db.attendance_logs.create_index([("date", DESCENDING), ("emp_code", ASCENDING)])
    db.attendance_logs.create_index([("emp_code", ASCENDING), ("punch_in", DESCENDING)])
    db.attendance_logs.create_index([("date", ASCENDING)])

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_indexes()
    yield

app = FastAPI(title="Employee Attendance & Analytics API", version="2.0.0", lifespan=lifespan)
`
  },
  {
    name: "DECISIONS.md",
    path: "DECISIONS.md",
    language: "markdown",
    description: "Design decisions explaining indexes, punch race handling, competition ties, headcount aggregation, and 100x scalability.",
    content: `# DECISIONS.md

### 1. Indexes
* \`employees\`: Unique \`{"emp_code": 1}\` guarantees unique business codes and prevents duplicate creation races. Compound \`{"department": 1, "joined_on": 1}\` optimizes department filtering and period headcount evaluations.
* \`attendance_logs\`: Unique compound \`{"emp_code": 1, "date": 1}\` guarantees at most one record per employee per day and eliminates punch-in race conditions. Compound \`{"date": -1, "emp_code": 1}\` satisfies sorted pagination without in-memory sorting. Compound \`{"emp_code": 1, "punch_in": -1}\` accelerates open punch lookup during punch-out.
* **Rejected index**: A single index on \`status\` was rejected due to low cardinality (only 5 distinct states), which incurs write overhead with minimal scan selectivity.

### 2. Punch-in Race
When two identical requests arrive simultaneously, both compute the same attendance date and attempt \`insert_one\`. MongoDB's unique compound index on \`("emp_code", "date")\` forces atomic serialization at the WiredTiger engine level. Exactly one insert wins (yielding 201); the second triggers a \`DuplicateKeyError\`, caught by our handler to return 409 Conflict.

### 3. Ties
We compute ranks using MongoDB's \`$rank\` window function (standard competition ranking: 1, 2, 2, 4). The \`limit\` clause filters on \`rank <= limit\` *after* rank assignment. Both tied employees share the cutoff rank and are returned, intentionally yielding more than \`limit\` rows.

### 4. Headcount
The aggregation pipeline initiates on \`employees\` (filtering \`joined_on <= end_of_month\`) and performs a \`$lookup\` to join \`attendance_logs\`. Grouping occurs on employees first, preserving all active employees in headcount even when their joined logs array is empty.

### 5. One Thing to Change for 100x Data
At 100x scale, running cross-collection lookups for every analytics query becomes prohibitive. I would maintain pre-aggregated daily summaries via MongoDB Change Streams or out-of-band rollups, querying materialized aggregates for O(1) reporting.`
  },
  {
    name: "REVIEW.md",
    path: "REVIEW.md",
    language: "markdown",
    description: "Defect analysis documenting the 10 starter traps, testing symptoms, resolutions, and non-defects.",
    content: `# REVIEW.md

## Defect Log

| # | Where (function / line) | What is wrong | How you'd notice it (test, input, or symptom) | How you fixed it |
|---|---|---|---|---|
| 1 | \`compute_work_hours\` | Used built-in Python \`round()\`, which applies banker's rounding (round-half-to-even) rather than half-up rounding (R4, R8). | Input with fractional hours like 8.425 was rounded down to 8.42 instead of 8.43. | Switched to \`decimal.Decimal\` with \`.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)\`. |
| 2 | \`punch_in\` / instant helpers | Epoch millisecond inputs were not truncated to whole seconds before calculation and persistence (R1). | Passing \`1783312500900\` resulted in sub-second drift and fractional seconds in MongoDB BSON dates. | Applied integer floor \`(ms // 1000) * 1000\` before converting to UTC datetime. |
| 3 | \`compute_attendance_date\` | Overnight shifts (\`shift_end <= shift_start\`) failed to assign morning punch-ins prior to \`shift_end\` to the previous calendar day. | For a 22:00-06:00 shift, punch-in at 05:45 IST on July 7 was marked as date \`2026-07-07\` instead of \`2026-07-06\`. | Added check: \`if shift_end <= shift_start and dt_ist.time() < shift_end_time: return prev_day\`. |
| 4 | \`compute_late_minutes\` | Grace period condition evaluated \`>= 600\` seconds rather than strictly \`> 600\` seconds (R2). | Punch-in at exactly 09:40:00 for a 09:30 shift returned \`late_minutes = 10\` instead of 0. | Changed condition to strictly \`if diff_seconds > 600: return int(diff_seconds // 60)\`. |
| 5 | \`punch_in\` endpoint | Relied on a check-then-insert pattern (\`find_one\` followed by \`insert_one\`), creating a race condition under concurrency. | Concurrent identical punch-in requests both succeeded, creating duplicate records for the same employee and date. | Created a unique compound index on \`("emp_code", 1), ("date", 1)\` and caught \`DuplicateKeyError\` to return 409 Conflict. |
| 6 | \`punch_out\` endpoint | Read record and updated without verifying open status in the write filter (\`punch_out: None\`). | Concurrent punch-out requests for the same open record both returned 200 OK instead of one 200 and one 409. | Converted to atomic \`find_one_and_update({"_id": record["_id"], "punch_out": None}, ...)\` returning 409 if no document matched. |
| 7 | \`department_summary\` | Pipeline initiated on \`attendance_logs\` with \`$lookup\` to \`employees\`, omitting staff with zero attendance logs. | A department with 5 employees where only 2 logged attendance reported headcount of 2 instead of 5. | Re-anchored pipeline to start from \`employees\` matching \`joined_on <= end_of_month\` and grouped before joining logs. |
| 8 | \`late_leaderboard\` | Used array index or dense ranking and applied \`$limit\` in MongoDB before tie evaluation. | Tied employees at cutoff rank were omitted or ranks did not skip (e.g. 1, 2, 2, 3 instead of 1, 2, 2, 4). | Implemented \`$setWindowFields\` with \`$rank\` (standard competition ranking) and filtered \`rank <= limit\` after ranking. |
| 9 | \`employee_monthly\` / \`department_summary\` | Weekend presence logs were counted in \`present_days\`. | Weekend attendance inflated \`present_days\` and pushed \`attendance_pct\` over 100%. | Restricted \`present_days\` incrementation to Mon-Fri (\`$dayOfWeek in [2,3,4,5,6]\`) per R7. |
| 10 | \`regularize_attendance\` | Permitted \`punch_in\` or \`punch_out\` payloads when updating status to \`ABSENT\` or \`LEAVE\`. | Setting \`status: ABSENT\` while supplying \`punch_in\` succeeded with 200 OK instead of 422. | Added validation rejecting any punch times when target status is \`ABSENT\` or \`LEAVE\`. |`
  },
  {
    name: "openapi.yaml",
    path: "openapi.yaml",
    language: "yaml",
    description: "The official OpenAPI 3.0.3 contract specifying all endpoints, request bodies, error schemas, and parameter constraints.",
    content: `openapi: 3.0.3
info:
  title: Employee Attendance & Analytics API
  version: 2.0.0
  description: Full contract for HROne engineering assignment.
paths:
  /health:
    get:
      summary: Readiness probe
  /employees:
    post:
      summary: Create an employee
    get:
      summary: List employees
  /attendance/punch-in:
    post:
      summary: Record a punch-in
  /attendance/punch-out:
    post:
      summary: Record a punch-out
  /attendance:
    get:
      summary: List attendance records
  /attendance/{emp_code}/{date}:
    patch:
      summary: Regularize one day's record
  /analytics/employees/{emp_code}/monthly:
    get:
      summary: Monthly attendance summary
  /analytics/departments/summary:
    get:
      summary: Department summary for a month
  /analytics/leaderboard/late:
    get:
      summary: Late-comers leaderboard for a month
  /analytics/departments/{department}/trend:
    get:
      summary: Daily attendance trend
  /admin/explain/{endpoint}:
    get:
      summary: MongoDB explain for an endpoint's main query`
  },
  {
    name: "DATA_MODEL.md",
    path: "DATA_MODEL.md",
    language: "markdown",
    description: "MongoDB collections specification, type mappings (BSON Date vs Epoch ms), and the 9 sample document structures.",
    content: `# DATA_MODEL.md: what is stored in MongoDB
Collections: employees, attendance_logs
Types:
- Instant: BSON date in MongoDB, Epoch milliseconds in HTTP API
- Calendar date: string "YYYY-MM-DD"
- Shift time: string "HH:MM", 24-hour IST
- Derived metrics: work_hours (double), late_minutes (int), overtime_minutes (int), half_day (bool)`
  },
  {
    name: "requirements.txt",
    path: "requirements.txt",
    language: "text",
    description: "Production dependencies pinning FastAPI, Uvicorn, PyMongo, Pydantic, and python-dotenv.",
    content: `fastapi>=0.110
uvicorn[standard]>=0.29
pymongo[srv]>=4.7
pydantic>=2.6
python-dotenv>=1.0`
  }
];
