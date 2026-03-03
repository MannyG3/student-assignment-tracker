# Student Assignment Tracker

A simple full-stack app to manage students and track assignment completion status.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript (`public/`)
- Backend: Express serverless API (`api/index.js`)
- Deployment: Vercel
- Authentication: Admin password login with signed bearer token
- Persistence:
	- **Primary**: Upstash Redis (`students` key)
	- **Fallback**:
		- Local development (`NODE_ENV !== production`): `students.json`
		- Production without env vars: in-memory (non-persistent)

## Features

- Role-based access control with `admin`, `faculty`, `student`
- Password admin login + SSO-mock login flow (SSO-ready architecture)
- Add student with `rollNo`, `name`, `className`, `subject`, `semester`, and assignment statuses
- View/update students with role-based restrictions
- Audit logs for assignment status changes and record lifecycle actions
- Reporting API + CSV export + JSON backup endpoint
- Rate limiting, health endpoint, and API metrics endpoint
- CI test gate via GitHub Actions

## API Endpoints

Authentication
- `GET /api/auth/config` → auth capabilities (`passwordEnabled`, `ssoEnabled`)
- `POST /api/auth/login` → admin password login
- `POST /api/auth/sso/mock` → SSO-style login with role mapping (for local/dev and integration)
- `GET /api/auth/session` → validate current token and return user claims

Students
- `GET /api/students` → list students (student role only sees own roll number)
- `POST /api/students` → create student (`admin`, `faculty`)
- `PUT /api/students/:rollNo` → update student (`admin`, `faculty`; student can update own assignment status only)
- `DELETE /api/students/:rollNo` → delete student (`admin` only)

Governance and Ops
- `GET /api/audit-logs` → audit trail (`admin`, `faculty`)
- `GET /api/reports/summary` → aggregated reporting (`admin`, `faculty`)
- `GET /api/reports/export.csv` → CSV export (`admin`, `faculty`)
- `GET /api/backup` → JSON backup (`admin`)
- `GET /api/metrics` → request/error/rate-limit metrics (`admin`)
- `GET /api/health` → service health + uptime

When auth is enabled, protected endpoints require `Authorization: Bearer <token>`.

Request body for create/update:

```json
{
	"rollNo": "101",
	"name": "Jane Doe",
	"assignments": {
		"assignment1": { "completed": true, "date": "2/28/2026" },
		"assignment2": { "completed": false, "date": "" },
		"assignment3": { "completed": false, "date": "" },
		"assignment4": { "completed": false, "date": "" },
		"assignment5": { "completed": false, "date": "" }
	}
}
```

## Local Setup

1. Install dependencies:

	 ```bash
	 npm install
	 ```

2. (Optional, recommended) Configure Upstash Redis env vars:

	 ```bash
	 export UPSTASH_REDIS_REST_URL="https://...upstash.io"
	 export UPSTASH_REDIS_REST_TOKEN="..."
	 ```

3. Configure auth and role mapping:

	 ```bash
	 export ADMIN_PASSWORD="change-this-now"
	 export AUTH_SECRET="long-random-secret-value"
	 export ADMIN_EMAILS="admin1@college.edu,admin2@college.edu"
	 export FACULTY_EMAILS="faculty1@college.edu,faculty2@college.edu"
	 export STUDENT_EMAILS="student1@college.edu,student2@college.edu"
	 ```

4. Start local dev server:

	 ```bash
	 npm run dev
	 ```

5. Open the app at `http://localhost:3000`.

## Vercel Deployment

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add environment variables in Vercel Project Settings:
	 - `UPSTASH_REDIS_REST_URL`
	 - `UPSTASH_REDIS_REST_TOKEN`
	 - `ADMIN_PASSWORD`
	 - `AUTH_SECRET`
	 - `ADMIN_EMAILS`
	 - `FACULTY_EMAILS`
	 - `STUDENT_EMAILS`
	 - `RATE_LIMIT_WINDOW_MS` (optional)
	 - `RATE_LIMIT_MAX` (optional)
4. Deploy.

`vercel.json` routes:
- `/` → `public/index.html`
- `/api/*` → `api/index.js`
- static assets → `public/*`

## Persistence Notes

- With Upstash configured, data persists across deploys/restarts.
- Without Upstash:
	- Local dev uses `students.json` and persists locally.
	- Production fallback is in-memory and **not persistent**.

## Authentication Notes

- If `ADMIN_PASSWORD` is not set, auth is disabled (demo mode).
- If `ADMIN_PASSWORD` is set, users must log in via the frontend before viewing or editing students.
- `AUTH_SECRET` should be a strong random string in production.
- Rotate `ADMIN_PASSWORD` and `AUTH_SECRET` regularly for better security.

## Manual Test Checklist

- Add a student from the form
- Verify student appears in table
- Edit student and save
- Delete student
- Refresh and verify persistence:
	- With Upstash configured: data remains
	- Local without Upstash: data remains via `students.json`
- If auth is enabled:
	- Wrong password should fail login
	- Successful login should allow CRUD operations
	- Logout should block access until login again

## Troubleshooting

- `404` on `/api/students`:
	- Run with `npm run dev` (uses `vercel dev`)
- Data not persisting on Vercel:
	- Ensure Upstash env vars are set correctly
- CORS issues:
	- API already enables CORS; verify you are calling same-origin `/api/*`

## College-Ready Improvements (Recommended)

1. **Role-based access control**
	- Add roles: `admin`, `faculty`, `student`
	- Restrict delete/update permissions by role

2. **Real user identities**
	- Replace shared admin password with SSO/OAuth (Google Workspace or Microsoft Entra)
	- Map authenticated users to faculty/student records

3. **Audit logs**
	- Log who updated assignment status, when, and what changed
	- Keep immutable audit history for compliance

4. **Data model upgrades**
	- Add `department`, `semester`, `subject`, `batch`, and `section`
	- Track assignments by subject and due dates instead of fixed `assignment1..5`

5. **Reporting & export**
	- Add attendance/completion reports by class and subject
	- Export CSV for faculty and administration

6. **Operational hardening**
	- Add request rate limiting and input sanitization
	- Add uptime/error monitoring (Sentry/Logtail)
	- Set up automated backups of Redis data

7. **Testing & quality gates**
	- Add API integration tests and frontend smoke tests
	- Require CI checks before merge/deploy