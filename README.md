# Employee Attendance & Analytics API

A high-performance Attendance and Workforce Analytics API built with **Python 3.11+**, **FastAPI**, and **MongoDB 7.0**, adhering strictly to the assignment OpenAPI 3.0.3 specification and business rules R1–R10.

---

## Architecture & Features

* **Concurrency-Safe Operations**:
  * Atomic punch-in using unique compound index `(emp_code, date)` to eliminate check-then-insert race conditions.
  * Atomic punch-out using `find_one_and_update` on unclosed punch records to prevent duplicate close actions.
  * Optimistic concurrency on manual regularizations to safeguard the audit trail (`history`).
* **Strict Business Rules (R1–R10)**:
  * **R1**: IST calendar dates and overnight shift handling (`shift_end <= shift_start`). Instants truncated to whole seconds.
  * **R2**: 10-minute grace period; late calculation from `shift_start` when elapsed time strictly exceeds 10:00.
  * **R3**: Overtime calculation for whole minutes >= 30 past `shift_end` (accounting for overnight shift days).
  * **R4 & R8**: Work hours and percentage calculations with exact 2-decimal / 4-decimal **half-up rounding** via `decimal.Decimal` (not banker's rounding).
  * **R5 & R6**: Half-day threshold (< 4.50 hours = 0.5 present day). Presence statuses: `PRESENT`, `WFH`, `ON_DUTY`.
  * **R7**: Working days computed Mon–Fri from employee's `joined_on`. Weekend logs excluded from `present_days` but included in late/overtime.
  * **R9**: Department headcount includes all employees hired on or before the period, even with zero attendance logs.
  * **R10**: 1-indexed pagination with total matching count.
* **Aggregations & Leaderboard**:
  * Standard competition ranking (`$rank` with ties sharing rank, skipping next: 1, 2, 2, 4).
  * 92-day department attendance trend with 7-day moving average.
  * Explain endpoint (`/admin/explain/{endpoint}`) running with `executionStats` confirming `IXSCAN` on high-volume collections.

---

## Quickstart

### 1. Requirements & Virtual Environment
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment Variables
Create a `.env` file (or provide environment variables directly):
```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB=attendance_db
```

### 3. Seed Sample Data (Optional)
```bash
python sample_seed.py
```

### 4. Run the API Server
```bash
uvicorn app.main:app --port 8000 --reload
```
Interactive API docs are available at `http://localhost:8000/docs`.

---

## File Structure

* `app/main.py`: Complete FastAPI application with endpoints, business rules, schemas, and lifecycle index setup.
* `DATA_MODEL.md`: Specification of MongoDB collections, field types, and sample documents.
* `DECISIONS.md`: Design rationale covering indexes, race conditions, tie handling, headcount, and 100x scalability.
* `REVIEW.md`: Defect analysis of common starter traps, symptoms, fixes, and architectural non-defects.
* `openapi.yaml`: Full OpenAPI 3.0.3 contract.
* `sample_seed.py`: MongoDB Extended JSON seed loader.
* `sample_data/`: Seed files for `employees.json` and `attendance_logs.json`.
