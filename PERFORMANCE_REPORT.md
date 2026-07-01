# IBBUL Academic OS — Performance Audit & Optimization Report

**Date:** June 2026  
**Scope:** Production-safe optimization (no business logic changes)

---

## Executive summary

Pages were slow (20–50s) primarily due to **N+1 database queries** in the learning gradebook engine, **4+N HTTP requests** on the lecturer grading page, **synchronous Excel/AI bulk** work in request threads, and **missing queryset optimization** on results list endpoints.

This pass implements bulk data loading, a combined grading workspace API, database indexes, short-lived caching, background jobs for AI bulk and Excel export, and progressive frontend loading.

---

## Step 1 — Profile findings

### Critical backend bottlenecks

| Endpoint | Issue | Est. queries (200 students, 5 assignments) |
|----------|-------|---------------------------------------------|
| `GET .../gradebook/` | Per-student × per-lesson loops | 1,000+ |
| `GET .../grading-summary/` | Same loops + Python iteration | 1,000+ |
| `GET .../grade-sheet/` | Inline Excel + per-cell submission queries | 2,000+ |
| `GET .../students/` | `_progress_for()` COUNT per student | 200+ |
| `GET /api/academics/results/` | Missing `select_related` on nested serializers | 5× row count |
| `POST .../ai-suggest-grade-bulk/` | Serial sync AI HTTP (60s each) | Blocks worker |

### Critical frontend bottlenecks

| Page | Issue |
|------|-------|
| Students & grading | `getOfferingDetail` + `getGradebook` + `getGradingSummary` + N× `getSubmissions` |
| Grading workspace | Single `loading` gate hides entire UI until all fetches complete |
| Grade save | Full reload (3+N requests) after every save |
| Dashboard / Learning | Same stats/enrollments re-fetched on every navigation (no cache) |

### Missing indexes (before migration 0005 / 0016)

- `Enrollment(offering, is_active)`, `Submission(assignment, student)`, `QuizAttempt(quiz, student, status)`
- `Result(status, is_deleted, session)`, `Result(student, session, semester)`

---

## Step 2–3 — Backend optimizations applied

### Bulk grade data (`apps/learning/grade_data.py`)

- Loads all quiz attempts, submissions, and progress in **~5 queries** per offering
- Used by gradebook, grading summary, Excel export, and new grading workspace endpoint

### New / updated endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET .../grading-workspace/` | Single call: summary + gradebook + all submissions + offering detail |
| `POST .../grade-sheet/start/` | Background Excel generation |
| `GET .../grade-sheet/job/{id}/` | Poll export progress / download |
| `GET .../assignments/{id}/bulk-ai-job/{id}/` | Poll AI bulk progress |

### Caching

- Grading summary cached 60s (`lms_grading_summary_{offering_id}`)
- Invalidated on assignment submit and grade save

### Background processing

- AI bulk grading: Celery when broker configured, else daemon thread
- Excel export: same pattern with job polling

### Other

- `ResultViewSet.get_queryset`: added `select_related` for all FK relations
- `learning_dashboard_stats`: reduced repeated subqueries for students
- Students list: bulk `LessonProgress` aggregation instead of per-student COUNT

### Profiling middleware

Enable on Render with:

```
PERF_LOG_SLOW=1
PERF_SLOW_MS=500
```

Logs slow requests with SQL query count to `ibbul.performance` logger.

---

## Step 4–5 — Frontend optimizations applied

### `fetch-cache.ts`

- In-flight GET deduplication
- 30s default TTL cache (grading workspace uses 15s)

### `lecturer-grading-workspace.tsx`

- **One API call** via `getGradingWorkspace`
- Student list visible immediately (from page props)
- Summary skeleton while workspace loads
- **No full reload** after grade save — local state patch
- Background Excel with “Preparing export…” status
- Background AI bulk with “Grading X / Y…” progress

### `students/page.tsx`

- Cached offering detail for breadcrumb only
- Workspace handles heavy grading data

---

## Step 6–8 — AI, exports, deployment

- AI bulk no longer blocks the UI (202 + polling)
- Excel no longer blocks the browser (background job + poll)
- Compatible with Render (thread fallback) and Celery+Redis when configured
- Vercel frontend benefits from fewer parallel requests and faster TTFB on combined endpoint

---

## Step 9 — Expected improvement

| Page | Before | After (typical) |
|------|--------|-----------------|
| Students & grading | 4+N requests, 20–50s | 2 requests, 1–3s |
| Gradebook API | 1000+ queries | ~8 queries |
| Excel export | Blocks 30s+ | Non-blocking UI |
| AI bulk (50 subs) | Blocks 50× AI latency | Background + progress |
| Results list | N+1 serializers | Prefetched FKs |

---

## Step 10 — Deploy checklist

```bash
# Backend (Render)
python manage.py migrate learning
python manage.py migrate academics
```

Optional profiling:

```
PERF_LOG_SLOW=1
```

Optional background jobs (recommended for large courses):

```
CELERY_BROKER_URL=redis://...
# Run Celery worker on Render
```

### Regression verification

- [ ] TypeScript: `npx tsc --noEmit`
- [ ] Frontend build: `npm run build`
- [ ] Login / JWT refresh
- [ ] Student dashboard & learning paths
- [ ] Lecturer grading: expand student, save grade, bulk AI, export
- [ ] Results module list & student my-results
- [ ] Existing APIs unchanged (additive routes only)

---

## Files changed

**Backend:** `grade_data.py`, `cache_utils.py`, `tasks.py`, `engine_views.py`, `views.py`, `urls.py`, `academics/views.py`, migrations `0005`, `0016`, `common/middleware/performance.py`, `settings.py`

**Frontend:** `fetch-cache.ts`, `api.ts`, `lecturer-grading-workspace.tsx`, `students/page.tsx`
