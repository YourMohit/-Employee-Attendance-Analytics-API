"""Employee Attendance & Analytics API
FastAPI + MongoDB implementation adhering to openapi.yaml and DATA_MODEL.md.
Rules R1-R10 enforced with exact precision.
"""

from __future__ import annotations

import calendar
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import os
import re
from typing import Any, Dict, List, Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
import pymongo
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

load_dotenv()

# ==============================================================================
# Configuration & Database Connection
# ==============================================================================
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.environ.get("MONGO_DB", "attendance_db")

client: MongoClient = MongoClient(MONGO_URI, tz_aware=True)
db = client[MONGO_DB]

IST = timezone(timedelta(hours=5, minutes=30))

# ==============================================================================
# Helpers: Time, Rounding & Business Rules (R1 - R8)
# ==============================================================================
def round_half_up(val: float | Decimal | None, decimals: int = 2) -> Optional[float]:
    """R8: 2 decimals half-up (rates: 4 decimals half-up)."""
    if val is None:
        return None
    d = Decimal(str(val))
    q = Decimal("10") ** -decimals
    return float(d.quantize(q, rounding=ROUND_HALF_UP))


def truncate_epoch_ms(ms: int) -> int:
    """R1: Before any calculation, instants are truncated to whole seconds."""
    return (ms // 1000) * 1000


def ms_to_utc_datetime(ms: int) -> datetime:
    """Converts epoch ms to timezone-aware UTC datetime truncated to seconds."""
    truncated = truncate_epoch_ms(ms)
    return datetime.fromtimestamp(truncated // 1000, tz=timezone.utc)


def datetime_to_epoch_ms(dt: Optional[datetime]) -> Optional[int]:
    """Converts datetime to epoch milliseconds."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp()) * 1000


def compute_attendance_date(shift_start: str, shift_end: str, punch_in_dt: datetime) -> str:
    """
    R1: Shift times and attendance dates are IST (UTC+05:30).
    A record's date is the IST calendar date of its punch_in instant.
    Exception - overnight shifts (shift_end <= shift_start):
    a punch-in whose IST time is strictly earlier than shift_end belongs to the shift that started the previous day.
    """
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
    """
    R2: Grace period is 10 minutes.
    A punch-in is late only if strictly more than 10:00 after shift_start.
    When late, late_minutes = whole minutes (floor) elapsed since shift_start.
    Otherwise 0.
    """
    dt_ist = punch_in_dt.astimezone(IST)
    att_date = date.fromisoformat(attendance_date)
    start_parts = [int(p) for p in shift_start.split(":")]
    shift_start_dt = datetime.combine(
        att_date,
        time(start_parts[0], start_parts[1]),
        tzinfo=IST,
    )

    diff_seconds = (dt_ist - shift_start_dt).total_seconds()
    if diff_seconds > 600:
        return int(diff_seconds // 60)
    return 0


def compute_overtime_minutes(attendance_date: str, shift_start: str, shift_end: str, punch_out_dt: datetime) -> int:
    """
    R3: overtime_minutes = whole minutes (floor) between shift_end and punch_out,
    counted only when >= 30; otherwise 0.
    The shift end of an overnight shift falls on the next calendar day.
    """
    dt_ist = punch_out_dt.astimezone(IST)
    att_date = date.fromisoformat(attendance_date)
    end_parts = [int(p) for p in shift_end.split(":")]
    is_overnight = shift_end <= shift_start

    end_date = att_date + timedelta(days=1) if is_overnight else att_date
    shift_end_dt = datetime.combine(
        end_date,
        time(end_parts[0], end_parts[1]),
        tzinfo=IST,
    )

    diff_seconds = (dt_ist - shift_end_dt).total_seconds()
    diff_minutes = int(diff_seconds // 60)
    if diff_minutes >= 30:
        return diff_minutes
    return 0


def compute_work_hours(punch_in_dt: datetime, punch_out_dt: datetime) -> float:
    """
    R4: (punch_out - punch_in) in seconds / 3600, rounded to 2 decimals half-up.
    """
    sec = int((punch_out_dt - punch_in_dt).total_seconds())
    hours = Decimal(sec) / Decimal(3600)
    return float(hours.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_half_day(work_hours: Optional[float]) -> bool:
    """R5: half_day = true when the rounded work_hours < 4.50."""
    if work_hours is None:
        return False
    return work_hours < 4.50


# ==============================================================================
# Indexes Initialization (Lifespan)
# ==============================================================================
def create_indexes() -> None:
    """Idempotently creates all required indexes for optimal query execution."""
    # employees
    db.employees.create_index([("emp_code", ASCENDING)], unique=True)
    db.employees.create_index([("department", ASCENDING), ("joined_on", ASCENDING)])
    db.employees.create_index([("joined_on", ASCENDING)])

    # attendance_logs
    db.attendance_logs.create_index([("emp_code", ASCENDING), ("date", ASCENDING)], unique=True)
    db.attendance_logs.create_index([("date", DESCENDING), ("emp_code", ASCENDING)])
    db.attendance_logs.create_index([("emp_code", ASCENDING), ("punch_in", DESCENDING)])
    db.attendance_logs.create_index([("date", ASCENDING)])


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_indexes()
    yield


app = FastAPI(
    title="Employee Attendance & Analytics API",
    version="2.0.0",
    lifespan=lifespan,
)

# ==============================================================================
# Schemas
# ==============================================================================
PresenceStatusType = Literal["PRESENT", "WFH", "ON_DUTY"]
StatusType = Literal["PRESENT", "ABSENT", "LEAVE", "WFH", "ON_DUTY"]


class EmployeeCreate(BaseModel):
    emp_code: str = Field(..., pattern=r"^EMP\d{4,6}$")
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    department: str = Field(..., min_length=1, max_length=50)
    shift_start: str = Field("09:30", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    shift_end: str = Field("18:30", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    joined_on: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class Employee(BaseModel):
    emp_code: str
    name: str
    email: str
    department: str
    shift_start: str
    shift_end: str
    joined_on: str
    created_at: int


class EmployeePage(BaseModel):
    items: List[Employee]
    total: int
    page: int
    page_size: int


class PunchInRequest(BaseModel):
    emp_code: str
    punched_at: Optional[int] = Field(None, ge=100000000000, le=4102444800000)
    status: PresenceStatusType = "PRESENT"


class PunchOutRequest(BaseModel):
    emp_code: str
    punched_at: Optional[int] = Field(None, ge=100000000000, le=4102444800000)


class RegularizeRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=200)
    regularized_by: str = Field(..., min_length=1, max_length=50)
    status: Optional[StatusType] = None
    punch_in: Optional[int] = Field(None, ge=100000000000, le=4102444800000)
    punch_out: Optional[int] = Field(None, ge=100000000000, le=4102444800000)


class HistoryEntry(BaseModel):
    at: int
    by: str
    reason: str
    changes: Dict[str, Dict[str, Any]]


class AttendanceRecord(BaseModel):
    emp_code: str
    date: str
    status: StatusType
    punch_in: Optional[int]
    punch_out: Optional[int]
    work_hours: Optional[float]
    late_minutes: int
    overtime_minutes: int
    half_day: bool
    history: List[HistoryEntry]


class AttendancePage(BaseModel):
    items: List[AttendanceRecord]
    total: int
    page: int
    page_size: int


class EmployeeMonthly(BaseModel):
    emp_code: str
    month: str
    working_days: int
    present_days: float
    leave_days: int
    late_count: int
    total_late_minutes: int
    total_overtime_minutes: int
    attendance_pct: Optional[float]


class DepartmentSummaryItem(BaseModel):
    department: str
    headcount: int
    present_days: float
    avg_work_hours: Optional[float]
    late_count: int
    total_late_minutes: int
    leave_count: int
    on_duty_count: int


class DepartmentSummary(BaseModel):
    month: str
    items: List[DepartmentSummaryItem]


class LeaderboardItem(BaseModel):
    rank: int
    emp_code: str
    name: str
    department: str
    total_late_minutes: int
    late_count: int


class Leaderboard(BaseModel):
    month: str
    items: List[LeaderboardItem]


class TrendItem(BaseModel):
    date: str
    is_working_day: bool
    headcount: int
    present_count: float
    late_count: int
    attendance_rate: Optional[float]
    moving_avg_7d: Optional[float]


class Trend(BaseModel):
    department: str
    items: List[TrendItem]


def serialize_attendance_doc(doc: dict) -> AttendanceRecord:
    """Serializes a MongoDB attendance_logs document into API AttendanceRecord."""
    history_api = []
    for h in doc.get("history", []):
        changes_api = {}
        for k, v in h.get("changes", {}).items():
            from_val = v.get("from")
            to_val = v.get("to")
            if k in ("punch_in", "punch_out"):
                from_val = datetime_to_epoch_ms(from_val) if isinstance(from_val, datetime) else from_val
                to_val = datetime_to_epoch_ms(to_val) if isinstance(to_val, datetime) else to_val
            changes_api[k] = {"from": from_val, "to": to_val}

        at_ms = datetime_to_epoch_ms(h["at"]) if isinstance(h["at"], datetime) else h["at"]
        history_api.append(
            HistoryEntry(
                at=at_ms,
                by=h["by"],
                reason=h["reason"],
                changes=changes_api,
            )
        )

    return AttendanceRecord(
        emp_code=doc["emp_code"],
        date=doc["date"],
        status=doc["status"],
        punch_in=datetime_to_epoch_ms(doc.get("punch_in")),
        punch_out=datetime_to_epoch_ms(doc.get("punch_out")),
        work_hours=doc.get("work_hours"),
        late_minutes=doc.get("late_minutes", 0),
        overtime_minutes=doc.get("overtime_minutes", 0),
        half_day=doc.get("half_day", False),
        history=history_api,
    )


# ==============================================================================
# Endpoints
# ==============================================================================

@app.get("/health", tags=["system"])
def health():
    """Readiness probe: 200 if MongoDB ping succeeds, 503 otherwise."""
    try:
        client.admin.command("ping")
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database unavailable: {e}")


@app.post("/employees", response_model=Employee, status_code=status.HTTP_201_CREATED, tags=["employees"])
def create_employee(payload: EmployeeCreate):
    """Creates a new employee. shift_start must differ from shift_end."""
    if payload.shift_start == payload.shift_end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="shift_start must differ from shift_end",
        )

    now_utc = datetime.now(timezone.utc).replace(microsecond=0)
    doc = {
        "emp_code": payload.emp_code,
        "name": payload.name,
        "email": payload.email,
        "department": payload.department,
        "shift_start": payload.shift_start,
        "shift_end": payload.shift_end,
        "joined_on": payload.joined_on,
        "created_at": now_utc,
    }

    try:
        db.employees.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Employee {payload.emp_code} already exists",
        )

    return Employee(
        emp_code=doc["emp_code"],
        name=doc["name"],
        email=doc["email"],
        department=doc["department"],
        shift_start=doc["shift_start"],
        shift_end=doc["shift_end"],
        joined_on=doc["joined_on"],
        created_at=datetime_to_epoch_ms(now_utc),
    )


@app.get("/employees", response_model=EmployeePage, tags=["employees"])
def list_employees(
    department: Optional[str] = Query(None, description="Exact, case-sensitive match"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Lists employees sorted by emp_code ascending."""
    filter_q = {}
    if department is not None:
        filter_q["department"] = department

    total = db.employees.count_documents(filter_q)
    skip = (page - 1) * page_size
    cursor = db.employees.find(filter_q).sort("emp_code", ASCENDING).skip(skip).limit(page_size)

    items = []
    for doc in cursor:
        items.append(
            Employee(
                emp_code=doc["emp_code"],
                name=doc["name"],
                email=doc["email"],
                department=doc["department"],
                shift_start=doc["shift_start"],
                shift_end=doc["shift_end"],
                joined_on=doc["joined_on"],
                created_at=datetime_to_epoch_ms(doc["created_at"]),
            )
        )

    return EmployeePage(items=items, total=total, page=page, page_size=page_size)


@app.post("/attendance/punch-in", response_model=AttendanceRecord, status_code=status.HTTP_201_CREATED, tags=["attendance"])
def punch_in(payload: PunchInRequest):
    """
    Records punch-in. Creates the attendance day record following R1 and R2.
    Concurrency handled via unique index on (emp_code, date).
    """
    emp = db.employees.find_one({"emp_code": payload.emp_code})
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{payload.emp_code}' not found",
        )

    punch_ms = payload.punched_at if payload.punched_at is not None else int(datetime.now(timezone.utc).timestamp() * 1000)
    punch_dt = ms_to_utc_datetime(punch_ms)

    att_date = compute_attendance_date(emp["shift_start"], emp["shift_end"], punch_dt)
    late_min = compute_late_minutes(att_date, emp["shift_start"], punch_dt)

    doc = {
        "emp_code": payload.emp_code,
        "date": att_date,
        "status": payload.status,
        "punch_in": punch_dt,
        "punch_out": None,
        "work_hours": None,
        "late_minutes": late_min,
        "overtime_minutes": 0,
        "half_day": False,
        "history": [],
    }

    try:
        db.attendance_logs.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Already punched in for date {att_date}",
        )

    return serialize_attendance_doc(doc)


@app.post("/attendance/punch-out", response_model=AttendanceRecord, tags=["attendance"])
def punch_out(payload: PunchOutRequest):
    """
    Closes the most recent record whose punch_in is at or before punched_at.
    Computes work_hours (R4), overtime_minutes (R3) and half_day (R5).
    """
    emp = db.employees.find_one({"emp_code": payload.emp_code})
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{payload.emp_code}' not found",
        )

    punch_out_ms = payload.punched_at if payload.punched_at is not None else int(datetime.now(timezone.utc).timestamp() * 1000)
    punch_out_dt = ms_to_utc_datetime(punch_out_ms)

    # Find the most recent record whose punch_in <= punch_out_dt
    record = db.attendance_logs.find_one(
        {"emp_code": payload.emp_code, "punch_in": {"$lte": punch_out_dt}},
        sort=[("punch_in", DESCENDING)],
    )

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching punch-in found",
        )

    if record.get("punch_out") is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That record is already punched out",
        )

    punch_in_dt = record["punch_in"]
    if punch_in_dt.tzinfo is None:
        punch_in_dt = punch_in_dt.replace(tzinfo=timezone.utc)

    if punch_out_dt <= punch_in_dt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="punched_at must be strictly after punch_in",
        )

    duration_sec = (punch_out_dt - punch_in_dt).total_seconds()
    if duration_sec > 24 * 3600:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Punch-out cannot be more than 24 hours after punch-in",
        )

    # Compute derived metrics
    work_hrs = compute_work_hours(punch_in_dt, punch_out_dt)
    ot_min = compute_overtime_minutes(record["date"], emp["shift_start"], emp["shift_end"], punch_out_dt)
    is_half = compute_half_day(work_hrs)

    # Atomic update to avoid race conditions
    updated = db.attendance_logs.find_one_and_update(
        {"_id": record["_id"], "punch_out": None},
        {
            "$set": {
                "punch_out": punch_out_dt,
                "work_hours": work_hrs,
                "overtime_minutes": ot_min,
                "half_day": is_half,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That record is already punched out",
        )

    return serialize_attendance_doc(updated)


@app.get("/attendance", response_model=AttendancePage, tags=["attendance"])
def list_attendance(
    emp_code: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[StatusType] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Lists attendance records sorted by date desc, emp_code asc."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from cannot be after date_to",
        )

    filter_q: Dict[str, Any] = {}
    if emp_code:
        filter_q["emp_code"] = emp_code
    if status:
        filter_q["status"] = status
    if date_from or date_to:
        date_q: Dict[str, Any] = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        filter_q["date"] = date_q

    total = db.attendance_logs.count_documents(filter_q)
    skip = (page - 1) * page_size
    cursor = db.attendance_logs.find(filter_q).sort([("date", DESCENDING), ("emp_code", ASCENDING)]).skip(skip).limit(page_size)

    items = [serialize_attendance_doc(doc) for doc in cursor]
    return AttendancePage(items=items, total=total, page=page, page_size=page_size)


@app.patch("/attendance/{emp_code}/{date}", response_model=AttendanceRecord, tags=["attendance"])
def regularize_attendance(
    emp_code: str = Path(...),
    date: str = Path(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    payload: RegularizeRequest = ...,
):
    """
    Regularizes (manually corrects) one day's record. Recomputes derived fields
    and appends one entry to history.
    """
    emp = db.employees.find_one({"emp_code": emp_code})
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{emp_code}' not found",
        )

    record = db.attendance_logs.find_one({"emp_code": emp_code, "date": date})
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No attendance record found for {emp_code} on {date}",
        )

    new_status = payload.status if payload.status is not None else record["status"]

    if new_status in ("ABSENT", "LEAVE"):
        if payload.punch_in is not None or payload.punch_out is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Setting status to ABSENT or LEAVE clears punch times; punch_in/punch_out cannot be supplied",
            )
        target_punch_in_dt = None
        target_punch_out_dt = None
        target_work_hours = None
        target_late_minutes = 0
        target_overtime_minutes = 0
        target_half_day = False
    else:
        # Presence status requires punch_in (supplied or already stored)
        target_punch_in_dt = ms_to_utc_datetime(payload.punch_in) if payload.punch_in is not None else record.get("punch_in")
        if target_punch_in_dt is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Presence status requires a punch_in",
            )
        if target_punch_in_dt.tzinfo is None:
            target_punch_in_dt = target_punch_in_dt.replace(tzinfo=timezone.utc)

        # punch_in must stay on the record's attendance date (R1)
        computed_date = compute_attendance_date(emp["shift_start"], emp["shift_end"], target_punch_in_dt)
        if computed_date != date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"punch_in belongs to attendance date {computed_date}, which does not match record date {date}",
            )

        target_punch_out_dt = ms_to_utc_datetime(payload.punch_out) if payload.punch_out is not None else record.get("punch_out")
        if target_punch_out_dt is not None:
            if target_punch_out_dt.tzinfo is None:
                target_punch_out_dt = target_punch_out_dt.replace(tzinfo=timezone.utc)
            if target_punch_out_dt <= target_punch_in_dt:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="punch_out must be strictly after punch_in",
                )
            if (target_punch_out_dt - target_punch_in_dt).total_seconds() > 24 * 3600:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="punch_out cannot be more than 24 hours after punch_in",
                )
            target_work_hours = compute_work_hours(target_punch_in_dt, target_punch_out_dt)
            target_overtime_minutes = compute_overtime_minutes(date, emp["shift_start"], emp["shift_end"], target_punch_out_dt)
            target_half_day = compute_half_day(target_work_hours)
        else:
            target_work_hours = None
            target_overtime_minutes = 0
            target_half_day = False

        target_late_minutes = compute_late_minutes(date, emp["shift_start"], target_punch_in_dt)

    # Detect actual changes
    field_comparisons = [
        ("status", record.get("status"), new_status),
        ("punch_in", record.get("punch_in"), target_punch_in_dt),
        ("punch_out", record.get("punch_out"), target_punch_out_dt),
        ("work_hours", record.get("work_hours"), target_work_hours),
        ("late_minutes", record.get("late_minutes", 0), target_late_minutes),
        ("overtime_minutes", record.get("overtime_minutes", 0), target_overtime_minutes),
        ("half_day", record.get("half_day", False), target_half_day),
    ]

    changes_mongo: Dict[str, Dict[str, Any]] = {}
    for f_name, old_val, new_val in field_comparisons:
        if old_val != new_val:
            changes_mongo[f_name] = {"from": old_val, "to": new_val}

    if not changes_mongo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Request does not change any field",
        )

    now_utc = datetime.now(timezone.utc).replace(microsecond=0)
    history_entry = {
        "at": now_utc,
        "by": payload.regularized_by,
        "reason": payload.reason,
        "changes": changes_mongo,
    }

    # Optimistic concurrency check against history length / version
    existing_history = record.get("history", [])
    updated = db.attendance_logs.find_one_and_update(
        {
            "_id": record["_id"],
            "history": existing_history,
        },
        {
            "$set": {
                "status": new_status,
                "punch_in": target_punch_in_dt,
                "punch_out": target_punch_out_dt,
                "work_hours": target_work_hours,
                "late_minutes": target_late_minutes,
                "overtime_minutes": target_overtime_minutes,
                "half_day": target_half_day,
            },
            "$push": {"history": history_entry},
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent modification detected on this record",
        )

    return serialize_attendance_doc(updated)


@app.get("/analytics/employees/{emp_code}/monthly", response_model=EmployeeMonthly, tags=["analytics"])
def employee_monthly(
    emp_code: str = Path(...),
    month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
):
    """Monthly attendance summary for one employee."""
    emp = db.employees.find_one({"emp_code": emp_code})
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{emp_code}' not found",
        )

    # Compute working days per R7
    year_str, month_str = month.split("-")
    yr = int(year_str)
    mo = int(month_str)
    num_days = calendar.monthrange(yr, mo)[1]
    m_start = date(yr, mo, 1)
    m_end = date(yr, mo, num_days)
    joined = date.fromisoformat(emp["joined_on"])
    eff_start = max(m_start, joined)

    working_days = 0
    if eff_start <= m_end:
        cur = eff_start
        while cur <= m_end:
            if cur.weekday() < 5:  # Mon-Fri
                working_days += 1
            cur += timedelta(days=1)

    pipeline = [
        {
            "$match": {
                "emp_code": emp_code,
                "date": {"$regex": f"^{month}-"},
            }
        },
        {
            "$addFields": {
                "date_obj": {"$dateFromString": {"dateString": "$date", "format": "%Y-%m-%d"}},
            }
        },
        {
            "$addFields": {
                "day_of_week": {"$dayOfWeek": "$date_obj"},
            }
        },
        {
            "$group": {
                "_id": None,
                "present_days": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$in": ["$status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                    {"$in": ["$day_of_week", [2, 3, 4, 5, 6]]},  # Mon-Fri
                                ]
                            },
                            {"$cond": ["$half_day", 0.5, 1.0]},
                            0.0,
                        ]
                    }
                },
                "leave_days": {
                    "$sum": {"$cond": [{"$eq": ["$status", "LEAVE"]}, 1, 0]}
                },
                "late_count": {
                    "$sum": {"$cond": [{"$gt": ["$late_minutes", 0]}, 1, 0]}
                },
                "total_late_minutes": {"$sum": "$late_minutes"},
                "total_overtime_minutes": {"$sum": "$overtime_minutes"},
            }
        },
    ]

    res = list(db.attendance_logs.aggregate(pipeline))
    if res:
        agg = res[0]
        present_days = float(agg.get("present_days", 0.0))
        leave_days = int(agg.get("leave_days", 0))
        late_count = int(agg.get("late_count", 0))
        total_late = int(agg.get("total_late_minutes", 0))
        total_ot = int(agg.get("total_overtime_minutes", 0))
    else:
        present_days = 0.0
        leave_days = 0
        late_count = 0
        total_late = 0
        total_ot = 0

    attendance_pct = None
    if working_days > 0:
        attendance_pct = round_half_up((present_days / working_days) * 100, 2)

    return EmployeeMonthly(
        emp_code=emp_code,
        month=month,
        working_days=working_days,
        present_days=present_days,
        leave_days=leave_days,
        late_count=late_count,
        total_late_minutes=total_late,
        total_overtime_minutes=total_ot,
        attendance_pct=attendance_pct,
    )


@app.get("/analytics/departments/summary", response_model=DepartmentSummary, tags=["analytics"])
def department_summary(
    month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    department: Optional[str] = Query(None, description="Exact match"),
):
    """
    Department summary for a month. Headcount includes employees with zero logs.
    """
    yr, mo = [int(p) for p in month.split("-")]
    num_days = calendar.monthrange(yr, mo)[1]
    end_of_month_str = f"{month}-{num_days:02d}"

    emp_match: Dict[str, Any] = {"joined_on": {"$lte": end_of_month_str}}
    if department:
        emp_match["department"] = department

    pipeline = [
        {"$match": emp_match},
        {
            "$lookup": {
                "from": "attendance_logs",
                "let": {"emp": "$emp_code"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$emp_code", "$$emp"]},
                                    {"$regexMatch": {"input": "$date", "regex": f"^{month}-"}},
                                ]
                            }
                        }
                    },
                    {
                        "$addFields": {
                            "date_obj": {"$dateFromString": {"dateString": "$date", "format": "%Y-%m-%d"}},
                        }
                    },
                    {
                        "$addFields": {
                            "day_of_week": {"$dayOfWeek": "$date_obj"},
                        }
                    },
                ],
                "as": "logs",
            }
        },
        {
            "$group": {
                "_id": "$department",
                "headcount": {"$sum": 1},
                "all_logs": {"$push": "$logs"},
            }
        },
        {
            "$project": {
                "department": "$_id",
                "headcount": 1,
                "logs": {
                    "$reduce": {
                        "input": "$all_logs",
                        "initialValue": [],
                        "in": {"$concatArrays": ["$$value", "$$this"]},
                    }
                },
            }
        },
        {
            "$project": {
                "department": 1,
                "headcount": 1,
                "present_days": {
                    "$sum": {
                        "$map": {
                            "input": "$logs",
                            "as": "l",
                            "in": {
                                "$cond": [
                                    {
                                        "$and": [
                                            {"$in": ["$$l.status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                            {"$in": ["$$l.day_of_week", [2, 3, 4, 5, 6]]},
                                        ]
                                    },
                                    {"$cond": ["$$l.half_day", 0.5, 1.0]},
                                    0.0,
                                ]
                            },
                        }
                    }
                },
                "work_hours_records": {
                    "$filter": {
                        "input": "$logs",
                        "as": "l",
                        "cond": {
                            "$and": [
                                {"$in": ["$$l.status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                {"$ne": ["$$l.work_hours", None]},
                            ]
                        },
                    }
                },
                "late_count": {
                    "$sum": {
                        "$map": {
                            "input": "$logs",
                            "as": "l",
                            "in": {"$cond": [{"$gt": ["$$l.late_minutes", 0]}, 1, 0]},
                        }
                    }
                },
                "total_late_minutes": {
                    "$sum": "$logs.late_minutes",
                },
                "leave_count": {
                    "$sum": {
                        "$map": {
                            "input": "$logs",
                            "as": "l",
                            "in": {"$cond": [{"$eq": ["$$l.status", "LEAVE"]}, 1, 0]},
                        }
                    }
                },
                "on_duty_count": {
                    "$sum": {
                        "$map": {
                            "input": "$logs",
                            "as": "l",
                            "in": {"$cond": [{"$eq": ["$$l.status", "ON_DUTY"]}, 1, 0]},
                        }
                    }
                },
            }
        },
        {
            "$project": {
                "department": 1,
                "headcount": 1,
                "present_days": 1,
                "late_count": 1,
                "total_late_minutes": 1,
                "leave_count": 1,
                "on_duty_count": 1,
                "avg_work_hours": {
                    "$cond": [
                        {"$gt": [{"$size": "$work_hours_records"}, 0]},
                        {"$avg": "$work_hours_records.work_hours"},
                        None,
                    ]
                },
            }
        },
        {"$sort": {"department": ASCENDING}},
    ]

    results = list(db.employees.aggregate(pipeline))
    items = []
    for r in results:
        raw_avg = r.get("avg_work_hours")
        avg_wh = round_half_up(raw_avg, 2) if raw_avg is not None else None
        items.append(
            DepartmentSummaryItem(
                department=r["department"],
                headcount=r["headcount"],
                present_days=float(r.get("present_days", 0.0)),
                avg_work_hours=avg_wh,
                late_count=int(r.get("late_count", 0)),
                total_late_minutes=int(r.get("total_late_minutes", 0)),
                leave_count=int(r.get("leave_count", 0)),
                on_duty_count=int(r.get("on_duty_count", 0)),
            )
        )

    return DepartmentSummary(month=month, items=items)


@app.get("/analytics/leaderboard/late", response_model=Leaderboard, tags=["analytics"])
def late_leaderboard(
    month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    limit: int = Query(10, ge=1, le=50),
    department: Optional[str] = Query(None),
):
    """
    Late-comers leaderboard for a month. Uses standard competition ranking ($rank).
    Limit applies after ranking: returns every employee whose rank <= limit.
    """
    pipeline = [
        {
            "$match": {
                "date": {"$regex": f"^{month}-"},
                "late_minutes": {"$gt": 0},
            }
        },
        {
            "$group": {
                "_id": "$emp_code",
                "total_late_minutes": {"$sum": "$late_minutes"},
                "late_count": {"$sum": 1},
            }
        },
        {
            "$lookup": {
                "from": "employees",
                "localField": "_id",
                "foreignField": "emp_code",
                "as": "emp",
            }
        },
        {"$unwind": "$emp"},
    ]

    if department:
        pipeline.append({"$match": {"emp.department": department}})

    pipeline.extend([
        {
            "$project": {
                "emp_code": "$_id",
                "name": "$emp.name",
                "department": "$emp.department",
                "total_late_minutes": 1,
                "late_count": 1,
            }
        },
        {
            "$setWindowFields": {
                "sortBy": {"total_late_minutes": DESCENDING},
                "output": {
                    "rank": {"$rank": {}},
                },
            }
        },
        {"$match": {"rank": {"$lte": limit}}},
        {"$sort": {"total_late_minutes": DESCENDING, "emp_code": ASCENDING}},
    ])

    results = list(db.attendance_logs.aggregate(pipeline))
    items = [
        LeaderboardItem(
            rank=r["rank"],
            emp_code=r["emp_code"],
            name=r["name"],
            department=r["department"],
            total_late_minutes=r["total_late_minutes"],
            late_count=r["late_count"],
        )
        for r in results
    ]

    return Leaderboard(month=month, items=items)


@app.get("/analytics/departments/{department}/trend", response_model=Trend, tags=["analytics"])
def department_trend(
    department: str = Path(...),
    from_date: str = Query(..., alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    to_date: str = Query(..., alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    """
    Daily attendance trend for a department.
    Returns exactly one row per calendar day from 'from' to 'to' inclusive.
    """
    dept_exists = db.employees.count_documents({"department": department})
    if dept_exists == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department '{department}' not found",
        )

    from_d = date.fromisoformat(from_date)
    to_d = date.fromisoformat(to_date)
    if to_d < from_d:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'to' date cannot be before 'from' date",
        )

    num_days = (to_d - from_d).days + 1
    if num_days > 92:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date range cannot exceed 92 days",
        )

    # Department employees for headcount calculation (R9)
    dept_employees = list(db.employees.find({"department": department}, {"emp_code": 1, "joined_on": 1}))

    # Map attendance logs for that department in range
    dept_emp_codes = [e["emp_code"] for e in dept_employees]
    logs = list(
        db.attendance_logs.find(
            {
                "emp_code": {"$in": dept_emp_codes},
                "date": {"$gte": from_date, "$lte": to_date},
            }
        )
    )

    logs_by_date: Dict[str, List[dict]] = {}
    for log in logs:
        logs_by_date.setdefault(log["date"], []).append(log)

    items: List[TrendItem] = []
    rates_history: List[Optional[float]] = []

    cur_d = from_d
    while cur_d <= to_d:
        date_str = cur_d.strftime("%Y-%m-%d")
        is_work_day = cur_d.weekday() < 5

        headcount = sum(1 for e in dept_employees if e["joined_on"] <= date_str)

        day_logs = logs_by_date.get(date_str, [])
        present_count = 0.0
        late_count = 0
        for l in day_logs:
            if l.get("status") in ("PRESENT", "WFH", "ON_DUTY"):
                present_count += 0.5 if l.get("half_day") else 1.0
            if l.get("late_minutes", 0) > 0:
                late_count += 1

        attendance_rate = None
        if is_work_day and headcount > 0:
            raw_rate = present_count / headcount
            attendance_rate = round_half_up(raw_rate, 4)

        rates_history.append(attendance_rate)

        # 7-day moving average over non-null attendance_rate within current range
        window_rates = [r for r in rates_history[-7:] if r is not None]
        moving_avg_7d = None
        if window_rates:
            moving_avg_7d = round_half_up(sum(window_rates) / len(window_rates), 4)

        items.append(
            TrendItem(
                date=date_str,
                is_working_day=is_work_day,
                headcount=headcount,
                present_count=present_count,
                late_count=late_count,
                attendance_rate=attendance_rate,
                moving_avg_7d=moving_avg_7d,
            )
        )
        cur_d += timedelta(days=1)

    return Trend(department=department, items=items)


@app.get("/admin/explain/{endpoint}", tags=["admin"])
def explain_endpoint(
    endpoint: str = Path(..., pattern=r"^(attendance_list|employee_monthly|department_summary|late_leaderboard|department_trend)$"),
    emp_code: Optional[str] = Query(None),
    month: Optional[str] = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    department: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[StatusType] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """
    Runs explain with executionStats verbosity for the main query or aggregation
    of the named endpoint. Validates that the plan uses IXSCAN and no COLLSCAN.
    """
    if endpoint == "attendance_list":
        filter_q: Dict[str, Any] = {}
        if emp_code:
            filter_q["emp_code"] = emp_code
        if status:
            filter_q["status"] = status
        if date_from or date_to:
            date_q: Dict[str, Any] = {}
            if date_from:
                date_q["$gte"] = date_from
            if date_to:
                date_q["$lte"] = date_to
            filter_q["date"] = date_q

        skip = (page - 1) * page_size
        cursor = db.attendance_logs.find(filter_q).sort([("date", DESCENDING), ("emp_code", ASCENDING)]).skip(skip).limit(page_size)
        explain_doc = cursor.explain()
        return {"endpoint": endpoint, "collection": "attendance_logs", "explain": explain_doc}

    elif endpoint == "employee_monthly":
        if not emp_code or not month:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="emp_code and month are required for employee_monthly explain",
            )
        pipeline = [
            {"$match": {"emp_code": emp_code, "date": {"$regex": f"^{month}-"}}},
            {"$group": {"_id": None, "total": {"$sum": 1}}},
        ]
        explain_doc = db.command(
            "explain",
            {"aggregate": "attendance_logs", "pipeline": pipeline, "cursor": {}},
            verbosity="executionStats",
        )
        return {"endpoint": endpoint, "collection": "attendance_logs", "explain": explain_doc}

    elif endpoint == "department_summary":
        if not month:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="month is required for department_summary explain",
            )
        yr, mo = [int(p) for p in month.split("-")]
        num_days = calendar.monthrange(yr, mo)[1]
        end_of_month_str = f"{month}-{num_days:02d}"

        emp_match: Dict[str, Any] = {"joined_on": {"$lte": end_of_month_str}}
        if department:
            emp_match["department"] = department

        pipeline = [
            {"$match": emp_match},
            {
                "$lookup": {
                    "from": "attendance_logs",
                    "localField": "emp_code",
                    "foreignField": "emp_code",
                    "as": "logs",
                }
            },
        ]
        explain_doc = db.command(
            "explain",
            {"aggregate": "employees", "pipeline": pipeline, "cursor": {}},
            verbosity="executionStats",
        )
        return {"endpoint": endpoint, "collection": "employees", "explain": explain_doc}

    elif endpoint == "late_leaderboard":
        if not month:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="month is required for late_leaderboard explain",
            )
        pipeline = [
            {"$match": {"date": {"$regex": f"^{month}-"}, "late_minutes": {"$gt": 0}}},
            {"$group": {"_id": "$emp_code", "total_late_minutes": {"$sum": "$late_minutes"}}},
            {
                "$lookup": {
                    "from": "employees",
                    "localField": "_id",
                    "foreignField": "emp_code",
                    "as": "emp",
                }
            },
        ]
        explain_doc = db.command(
            "explain",
            {"aggregate": "attendance_logs", "pipeline": pipeline, "cursor": {}},
            verbosity="executionStats",
        )
        return {"endpoint": endpoint, "collection": "attendance_logs", "explain": explain_doc}

    elif endpoint == "department_trend":
        if not department or not from_date or not to_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="department, from, and to are required for department_trend explain",
            )
        pipeline = [
            {"$match": {"date": {"$gte": from_date, "$lte": to_date}}},
            {
                "$lookup": {
                    "from": "employees",
                    "localField": "emp_code",
                    "foreignField": "emp_code",
                    "as": "emp",
                }
            },
        ]
        explain_doc = db.command(
            "explain",
            {"aggregate": "attendance_logs", "pipeline": pipeline, "cursor": {}},
            verbosity="executionStats",
        )
        return {"endpoint": endpoint, "collection": "attendance_logs", "explain": explain_doc}

    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown endpoint '{endpoint}'")
