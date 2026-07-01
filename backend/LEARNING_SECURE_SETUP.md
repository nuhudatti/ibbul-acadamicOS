# Learning Module — Secure Assessment & Grading Setup

Deploy steps for the IBBUL Academic OS learning extensions (production-safe).

## 1. Database migration (Render)

After pushing backend code, run on Render shell or release command:

```bash
python manage.py migrate learning
```

Migration `0003_secure_assessment_extensions` adds optional fields with safe defaults. Existing quizzes and assignments continue working unchanged.

## 2. Backend environment variables (Render)

| Variable | Purpose | Example |
|----------|---------|---------|
| `AI_GRADING_ENABLED` | Enable AI grading suggestions | `true` |
| `AI_API_URL` | Ollama-compatible API base | `http://127.0.0.1:11434` |
| `AI_MODEL` | Model name | `mistral` |
| `AI_TIMEOUT` | Seconds before AI timeout | `60` |

Without AI vars, the system uses rule-based similarity grading only. Lecturers always approve final scores.

## 3. Frontend (Vercel)

Deploy the platform app as usual. No new frontend env vars required.

## 4. Feature summary

### Quiz timeout fix
- Timer expiry now **grades partial answers** (30-second server grace window).
- Timed-out attempts count in gradebook averages.

### Secure assessment mode
- Fullscreen on start (best effort on mobile).
- Tab switch / blur / fullscreen exit logged.
- Configurable max violations → auto-submit.
- Copy/paste/right-click blocked during exam.

### Short answer questions
- Lecturers: Quiz builder → **Short answer** type + model answer.
- Auto-graded via similarity to model answer.

### Plagiarism (MVP)
- Assignment submit: cosine + string overlap vs other submissions.
- Flag shown to lecturer in grading workspace.

### AI grading (optional)
- Lecturer clicks **AI suggest** on a submission.
- Fills suggested score + feedback; lecturer must **Save grade**.

### Grade sheet export
- Learning → Course → Students → **Export grade sheet** (Excel).
- Columns: matric, name, each quiz/assignment, averages, final grade.

## 5. API endpoints (new)

| Method | Path |
|--------|------|
| POST | `/api/learning/quizzes/{id}/log_violation/` |
| POST | `/api/learning/assignments/{id}/ai-suggest-grade/` |
| GET | `/api/learning/offerings/{id}/grade-sheet/` |

Existing routes unchanged.

## 6. Verification checklist

1. Start a timed quiz → let timer hit 0 → confirm submit succeeds and score appears.
2. Switch tab during quiz → violation logged → auto-submit at max violations.
3. Add short-answer question → student submits → score calculated.
4. Submit assignment → similarity report on duplicate text.
5. Export grade sheet → open `.xlsx` in Excel.
6. AI suggest (if enabled) → review → save manual grade.

## 7. Mobile notes

iOS/Android browsers limit true fullscreen and app-switch blocking. The system **logs events** and applies **auto-submit rules** rather than OS-level lockdown. This is intentional for web-based assessment.
