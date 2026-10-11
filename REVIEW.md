# REVIEW.md

## Defect Log

| # | Where (function / line) | What is wrong | How you'd notice it (test, input, or symptom) | How you fixed it |
|---|---|---|---|---|
| 1 | `compute_work_hours` | Used built-in Python `round()`, which applies banker's rounding (round-half-to-even) rather than half-up rounding (R4, R8). | Input with fractional hours like 8.425 was rounded down to 8.42 instead of 8.43. | Switched to `decimal.Decimal` with `.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`. |
| 2 | `punch_in` / instant helpers | Epoch millisecond inputs were not truncated to whole seconds before calculation and persistence (R1). | Passing `1783312500900` resulted in sub-second drift and fractional seconds in MongoDB BSON dates. | Applied integer floor `(ms // 1000) * 1000` before converting to UTC datetime. |
| 3 | `compute_attendance_date` | Overnight shifts (`shift_end <= shift_start`) failed to assign morning punch-ins prior to `shift_end` to the previous calendar day. | For a 22:00-06:00 shift, punch-in at 05:45 IST on July 7 was marked as date `2026-07-07` instead of `2026-07-06`. | Added check: `if shift_end <= shift_start and dt_ist.time() < shift_end_time: return prev_day`. |
| 4 | `compute_late_minutes` | Grace period condition evaluated `>= 600` seconds rather than strictly `> 600` seconds (R2). | Punch-in at exactly 09:40:00 for a 09:30 shift returned `late_minutes = 10` instead of 0. | Changed condition to strictly `if diff_seconds > 600: return int(diff_seconds // 60)`. |
| 5 | `punch_in` endpoint | Relied on a check-then-insert pattern (`find_one` followed by `insert_one`), creating a race condition under concurrency. | Concurrent identical punch-in requests both succeeded, creating duplicate records for the same employee and date. | Created a unique compound index on `("emp_code", 1), ("date", 1)` and caught `DuplicateKeyError` to return 409 Conflict. |
| 6 | `punch_out` endpoint | Read record and updated without verifying open status in the write filter (`punch_out: None`). | Concurrent punch-out requests for the same open record both returned 200 OK instead of one 200 and one 409. | Converted to atomic `find_one_and_update({"_id": record["_id"], "punch_out": None}, ...)` returning 409 if no document matched. |
| 7 | `department_summary` | Pipeline initiated on `attendance_logs` with `$lookup` to `employees`, omitting staff with zero attendance logs. | A department with 5 employees where only 2 logged attendance reported headcount of 2 instead of 5. | Re-anchored pipeline to start from `employees` matching `joined_on <= end_of_month` and grouped before joining logs. |
| 8 | `late_leaderboard` | Used array index or dense ranking and applied `$limit` in MongoDB before tie evaluation. | Tied employees at cutoff rank were omitted or ranks did not skip (e.g. 1, 2, 2, 3 instead of 1, 2, 2, 4). | Implemented `$setWindowFields` with `$rank` (standard competition ranking) and filtered `rank <= limit` after ranking. |
| 9 | `employee_monthly` / `department_summary` | Weekend presence logs were counted in `present_days`. | Weekend attendance inflated `present_days` and pushed `attendance_pct` over 100%. | Restricted `present_days` incrementation to Mon-Fri (`$dayOfWeek in [2,3,4,5,6]`) per R7. |
| 10 | `regularize_attendance` | Permitted `punch_in` or `punch_out` payloads when updating status to `ABSENT` or `LEAVE`. | Setting `status: ABSENT` while supplying `punch_in` succeeded with 200 OK instead of 422. | Added validation rejecting any punch times when target status is `ABSENT` or `LEAVE`. |

---

## Non-Defects Considered

1. **Plain string dates and times (`YYYY-MM-DD`, `HH:MM`)**:
   Considered converting these to BSON Date objects in MongoDB, but confirmed this is intentional per `DATA_MODEL.md`. Calendar dates and shift times are not instants and must remain timezone-agnostic strings.
2. **Naive datetimes returned by PyMongo**:
   Considered whether lack of timezone info in default PyMongo output was a bug. Handled cleanly at the application layer by enforcing UTC normalization upon database read.
3. **Absence of `_id` in API contracts**:
   Confirmed that MongoDB's internal `_id` is intentionally excluded from all public API endpoints and responses, as `emp_code` and `(emp_code, date)` serve as business identifiers.
