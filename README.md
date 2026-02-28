# Student Assignment Tracker

A simple full-stack app to manage students and track assignment completion status.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript (`public/`)
- Backend: Express serverless API (`api/index.js`)
- Deployment: Vercel
- Persistence:
	- **Primary**: Upstash Redis (`students` key)
	- **Fallback**:
		- Local development (`NODE_ENV !== production`): `students.json`
		- Production without env vars: in-memory (non-persistent)

## Features

- Add student with `rollNo`, `name`, and assignment statuses
- View all students in a table
- Edit student name + assignment completion
- Delete student
- Toast notifications for success/error states

## API Endpoints

- `GET /api/students` → list students
- `POST /api/students` → create student
- `PUT /api/students/:rollNo` → update student
- `DELETE /api/students/:rollNo` → delete student

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

3. Start local dev server:

	 ```bash
	 npm run dev
	 ```

4. Open the app at `http://localhost:3000`.

## Vercel Deployment

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add environment variables in Vercel Project Settings:
	 - `UPSTASH_REDIS_REST_URL`
	 - `UPSTASH_REDIS_REST_TOKEN`
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

## Manual Test Checklist

- Add a student from the form
- Verify student appears in table
- Edit student and save
- Delete student
- Refresh and verify persistence:
	- With Upstash configured: data remains
	- Local without Upstash: data remains via `students.json`

## Troubleshooting

- `404` on `/api/students`:
	- Run with `npm run dev` (uses `vercel dev`)
- Data not persisting on Vercel:
	- Ensure Upstash env vars are set correctly
- CORS issues:
	- API already enables CORS; verify you are calling same-origin `/api/*`