# ShiftSync

ShiftSync is a workforce scheduling and attendance management app for shift-based businesses. It gives business admins, managers, employees, and internal operations users their own dashboards for scheduling, timekeeping, PTO, shift swaps, labor reporting, support tickets, and machine-learning attendance analytics.

The standout feature is an ML service that learns from historical shift attendance and predicts which scheduled employees are at risk of not showing up. Managers can use these predictions before a shift happens to identify coverage risk and make staffing decisions earlier.

## What This Project Does

ShiftSync helps a business manage the day-to-day work around hourly schedules:

- Business owners can sign up, log in, manage employees and managers, schedule shifts, view labor cost reports, and open support requests.
- Managers can manage schedules, open shifts, employee records, PTO approvals, shift swap approvals, and labor reports.
- Employees can see upcoming shifts, clock in and out, request PTO, request shift swaps, and claim open shifts.
- ShiftSync operations users can monitor business accounts, support tickets, revenue/system health, and the ML service.
- The ML service predicts attendance risk for future scheduled shifts.

## Machine Learning No-Show Detection

The `ml-service` folder contains a FastAPI service that trains a LightGBM binary classification model. The model predicts whether an employee is likely to show up for a scheduled shift.

Historical shift records are converted into a target called `showed_up`:

- `worked` and `late` count as showed up.
- Other historical attendance outcomes, such as `no_show` or `called_off`, are treated as not showed up.
- Future `scheduled` shifts are used for prediction, not training.

The model builds features from:

- Shift date: day of week, month, day of month, weekend, Monday, Friday.
- Cyclical time encodings: sine/cosine encodings for day of week and month.
- Shift timing: start hour, duration, early morning, late night.
- Holiday context: whether the shift is adjacent to a known US holiday.
- Employee profile: role, hourly rate, tenure, new-hire flag.
- Attendance history: rolling 7-day, 14-day, and 30-day attendance rates plus 30-day late rate.

Predictions return:

- `show_up_probability`: the estimated probability the employee will attend.
- `on_time_probability`: an estimated on-time probability derived from the show-up probability.
- `risk_level`: `low`, `medium`, or `high`.

Risk thresholds in the service are:

- Low risk: `>= 90%` show-up probability.
- Medium risk: `75%` to `< 90%`.
- High risk: `< 75%`.

The ML model is currently stored in memory inside the FastAPI process. Restarting the ML service clears the loaded model, so it must be trained again before predictions are available.

## Architecture

The repo has three main parts:

```text
shift_sync/
  frontend/      React + Vite user interface
  backend/       Express + TypeScript API
  ml-service/    FastAPI + LightGBM attendance prediction service
```

### Frontend

The frontend is a React app built with Vite, TypeScript, Tailwind CSS, Radix UI components, and Lucide icons.

Important files:

- `frontend/src/app/App.tsx` defines the main routes.
- `frontend/src/context/AuthContext.tsx` stores session tokens and current-user state.
- `frontend/src/app/components/AccountCreation.tsx` handles signup and login.
- `frontend/src/app/components/AdminDashboard.tsx` includes admin workflows and ML attendance analytics.
- `frontend/src/app/components/ManagerDashboard.tsx` contains manager scheduling, approvals, reports, and employee management.
- `frontend/src/app/components/EmployeeDashboard.tsx` contains employee scheduling, timekeeping, PTO, swaps, and open-shift flows.
- `frontend/src/app/components/OpsDashboard.tsx` contains internal operations screens, including ML model training.

The Vite dev server proxies:

- `/api` to the Express backend at `http://localhost:5000`.
- `/ml` to the ML service at `http://localhost:8000`.

Most application calls go through `/api`.

### Backend

The backend is an Express API written in TypeScript. It connects to PostgreSQL with `pg`, handles authentication with JWTs, hashes passwords with `bcrypt`, and validates some request bodies with `zod`.

Important files:

- `backend/src/server.ts` mounts all API routes.
- `backend/src/dbConfig.ts` creates the PostgreSQL connection pool.
- `backend/src/middleware/auth.ts` protects business/admin/manager/employee routes.
- `backend/src/middleware/opsAuth.ts` protects internal operations routes.
- `backend/src/routes/mlRoutes.ts` exposes read-only ML analytics and prediction routes to business admins/managers.
- `backend/src/routes/opsMl.ts` exposes ML training and monitoring routes to ops users.

### ML Service

The ML service is a Python FastAPI app.

Important files:

- `ml-service/ml_service.py` contains the FastAPI app, feature engineering, LightGBM training, prediction, and analytics endpoints.
- `ml-service/ml_cli.py` provides command-line training, prediction, status, and risk commands.
- `ml-service/requirements.txt` lists Python dependencies.

## User Roles

ShiftSync has four practical user types:

- `admin`: business owner account created during signup. Can manage the business, employees, managers, schedules, reports, settings, support requests, and ML analytics.
- `manager`: business employee with manager privileges. Can manage employees, schedules, approvals, open shifts, and reports.
- `employee`: can view shifts, clock in/out, request PTO, request swaps, and claim open shifts.
- `ops`: internal ShiftSync operations user. Can access `/ops` to monitor system health, support tickets, business data, revenue, and ML training.

## Main API Areas

The backend mounts these route groups:

- `/api/signup`: business account creation.
- `/api/login`: login for ops, business admins, managers, and employees.
- `/api/auth`: current user lookup.
- `/api/admin`: business admin dashboard, schedules, employees, managers, reports, support, and settings.
- `/api/manager`: manager dashboard, schedules, approvals, employees, open shifts, and reports.
- `/api/employee`: employee dashboard, timekeeping, schedules, PTO, swaps, and open shifts.
- `/api/ml`: read-only business ML analytics and predictions.
- `/api/ops`: internal operations data.
- `/api/ops/auth`: internal operations login.
- `/api/ops/ml`: internal ML health, training, model info, analytics, and prediction routes.

The ML service itself exposes:

- `GET /health`
- `POST /train?business_id=<id>`
- `POST /predict`
- `GET /model/info`
- `GET /analytics/attendance-trends?business_id=<id>&days=<n>`
- `GET /analytics/risk-employees?business_id=<id>&days=<n>`

## Database Expectations

This project expects a PostgreSQL database. There are no schema migration files in the repo right now, so the database must already contain the tables and columns used by the routes.

Core tables referenced by the code include:

- `businesses`
- `business_types`
- `employee`
- `shifts`
- `shift_swaps`
- `pto_requests`
- `support_tickets`
- `ops_users`

The ML service depends heavily on these `shifts` fields:

- `employee_id`
- `start_date`
- `start_time`
- `end_time`
- `position`
- `status`
- `attendance_status`
- `actual_start_time`
- `actual_end_time`
- `is_holiday_adjacent`

The ML service also joins against employee fields such as:

- `business_id`
- `employee_name`
- `role`
- `employee_position`
- `hourly_rate`
- `hire_date`

For training, a business needs at least 100 historical shift records with non-null attendance status and dates before the current date.

## Local Setup

### Prerequisites

- Node.js and npm.
- Python 3.
- PostgreSQL with the expected ShiftSync schema.

### 1. Backend

Create `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shiftsync
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
JWT_SECRET=replace-this-dev-secret
OPS_JWT_SECRET=replace-this-ops-secret
ML_SERVICE_URL=http://localhost:8000
```

Install and run:

```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:5000`.

### 2. ML Service

Use the same database connection values as the backend. You can place them in an `.env` file inside `ml-service/` or export them in your shell:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shiftsync
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
```

Install and run:

```bash
cd ml-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn ml_service:app --host 127.0.0.1 --port 8000 --reload
```

The ML service runs on `http://localhost:8000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite will print the local frontend URL, usually `http://localhost:5173`.

## Training the Attendance Model

There are two ways to train the model.

### From the Ops Dashboard

1. Start the backend, frontend, and ML service.
2. Log in as an ops user.
3. Go to `/ops`.
4. Open the `ML Service` section.
5. Select a business with enough attendance rows.
6. Click `Train Model`.

Training runs synchronously and replaces the current in-memory model.

### From the CLI

```bash
cd ml-service
source .venv/bin/activate
python ml_cli.py train --business-id 5
```

Other useful commands:

```bash
python ml_cli.py status
python ml_cli.py predict --business-id 5 --date 2026-03-30
python ml_cli.py risk --business-id 5 --days 30
```

## Using Attendance Predictions

After the model is trained:

1. Log in as a business admin or manager.
2. Open the admin analytics page.
3. Choose a future date with scheduled shifts.
4. Run the attendance prediction.

The dashboard will show:

- Expected overall attendance.
- Number of scheduled employees.
- Number of high-risk employees.
- Per-employee show-up probability, on-time probability, and risk level.

This is intended to help managers spot likely no-show coverage gaps before the day of work.

## Build Commands

Backend:

```bash
cd backend
npm run build
npm start
```

Frontend:

```bash
cd frontend
npm run build
npm run preview
```

## Current Limitations

- No database schema or migration files are included in this repo.
- The ML model is kept in memory and is not persisted to disk or object storage.
- The ML service uses direct SQL string interpolation in several places. In a production deployment, parameterized queries should be used consistently.
- The holiday list in the ML service is hardcoded for selected US holidays from 2024 through 2026.
- Some debug logging is still present in the backend and ops auth routes.

## Suggested Next Improvements

- Add database migrations and seed data.
- Persist trained ML models per business.
- Add scheduled retraining.
- Add tests for API routes, timekeeping edge cases, and ML feature generation.
- Improve `.env.example` files so they match the current PostgreSQL configuration.
- Add deployment documentation for the three services.
