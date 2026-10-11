# DECISIONS.md

### 1. Indexes
* `employees`: Unique `{"emp_code": 1}` guarantees unique business codes and prevents duplicate creation races. Compound `{"department": 1, "joined_on": 1}` optimizes department filtering and period headcount evaluations.
* `attendance_logs`: Unique compound `{"emp_code": 1, "date": 1}` guarantees at most one record per employee per day and eliminates punch-in race conditions. Compound `{"date": -1, "emp_code": 1}` satisfies sorted pagination without in-memory sorting. Compound `{"emp_code": 1, "punch_in": -1}` accelerates open punch lookup during punch-out.
* **Rejected index**: A single index on `status` was rejected due to low cardinality (only 5 distinct states), which incurs write overhead with minimal scan selectivity.

### 2. Punch-in Race
When two identical requests arrive simultaneously, both compute the same attendance date and attempt `insert_one`. MongoDB's unique compound index on `("emp_code", "date")` forces atomic serialization at the WiredTiger engine level. Exactly one insert wins (yielding 201); the second triggers a `DuplicateKeyError`, caught by our handler to return 409 Conflict.

### 3. Ties
We compute ranks using MongoDB's `$rank` window function (standard competition ranking: 1, 2, 2, 4). The `limit` clause filters on `rank <= limit` *after* rank assignment. Both tied employees share the cutoff rank and are returned, intentionally yielding more than `limit` rows.

### 4. Headcount
The aggregation pipeline initiates on `employees` (filtering `joined_on <= end_of_month`) and performs a `$lookup` to join `attendance_logs`. Grouping occurs on employees first, preserving all active employees in headcount even when their joined logs array is empty.

### 5. One Thing to Change for 100x Data
At 100x scale, running cross-collection lookups for every analytics query becomes prohibitive. I would maintain pre-aggregated daily summaries via MongoDB Change Streams or out-of-band rollups, querying materialized aggregates for O(1) reporting.
