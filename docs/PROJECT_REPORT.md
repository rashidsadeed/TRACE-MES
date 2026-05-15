# TRACE-MES Backend -- Project Report

**Version:** 1.0
**Date:** 2026-03-08
**Stack:** Django 4.x + Django REST Framework + PostgreSQL + Redis + Docker
**Test Suite:** 211 tests, all passing

---

## 1. Executive Summary

TRACE-MES is a Manufacturing Execution System (MES) backend API designed for discrete manufacturing environments (CNC machining, assembly lines). It provides real-time production tracking, work order management, quality control, machine telemetry monitoring, and AI-ready data export -- all exposed through a RESTful JSON API secured with JWT authentication and role-based access control.

The backend is fully containerised (Docker Compose with PostgreSQL and Redis) and has been developed using a 4-agent workflow (PM, Coder, Security, QA) where every task underwent code review, security audit, and automated testing before being marked complete.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
│                                                          │
│  ┌──────────┐   ┌────────────┐   ┌───────────────────┐  │
│  │ PostgreSQL│   │   Redis    │   │   Django (web)    │  │
│  │  (mes_db) │   │  (cache)   │   │  Gunicorn / Dev   │  │
│  └──────────┘   └────────────┘   └───────────────────┘  │
│                                          │               │
│                               ┌──────────┴──────────┐   │
│                               │    Django Apps       │   │
│                               │  ┌───────┐ ┌──────┐ │   │
│                               │  │ users │ │ core │ │   │
│                               │  └───────┘ └──────┘ │   │
│                               └─────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Django Apps

| App | Purpose |
|-----|---------|
| `users` | Authentication (JWT), user management, roles, permissions, API key auth |
| `core` | All MES domain logic: machines, parts, work orders, executions, quality, telemetry, data export, system config |

### Key Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | PostgreSQL | Primary data store, transactional integrity |
| Cache | Redis | Session caching, future Celery broker |
| Auth | `rest_framework_simplejwt` | JWT access/refresh tokens with blacklisting |
| Permissions | Custom RBAC (`core/permissions.py`) | Role-based access with permission codes |
| Audit | `core/audit.py` | Best-effort audit logging on all write operations |

---

## 3. Data Model

### 3.1 Users App Models

| Model | PK Type | Description |
|-------|---------|-------------|
| `CustomUser` | UUID | Extends `AbstractBaseUser` + `PermissionsMixin`. Soft-delete via `is_active`. M2M to `Role`. |
| `Role` | UUID | Named role with hierarchical `level`. M2M to `Permission`. Types: `system` (undeletable) / `custom`. |
| `Permission` | UUID | Permission code (e.g. `workorders.create`). Belongs to a `module`. |
| `UserSession` | UUID | Tracks JWT sessions. Stores token hash (SHA-256), IP, start/end times, last activity. |
| `ApiClient` | UUID | Machine-to-machine API key authentication. Stores hashed key (`api_key_hash`). |

### 3.2 Core App Models

| Model | PK Type | Description |
|-------|---------|-------------|
| `Machine` | UUID | Manufacturing machine. Status: `RUNNING`, `IDLE`, `DOWN`, `OFFLINE`. Auto-slugified. |
| `Part` | UUID | Stock part with SKU. |
| `Operation` | Auto Int | Generic manufacturing step (e.g. "Drilling", "Heat Treat"). |
| `SystemConfig` | UUID | Key-value configuration store with data type and audit trail. |
| `AuditLog` | UUID | Immutable audit trail. Records actor, action, entity, before/after JSON, IP, user agent. |
| `WorkOrder` | UUID | Production order. Status: `PENDING` -> `IN_PROGRESS` -> `PAUSED` -> `COMPLETED` / `CANCELLED`. |
| `WorkOrderAssignment` | UUID | Links a work order to a machine + operator. |
| `WorkOrderExecution` | UUID | Active production run. Status: `RUNNING` -> `PAUSED` -> `COMPLETED`. |
| `DefectCode` | UUID | Categorised defect classification code. |
| `ProductionLog` | UUID | Records good/scrap quantities for an execution. |
| `AnomalySnapshot` | UUID | Captures 5-minute telemetry window when scrap is logged. |
| `ScrapLog` | UUID | Links scrap quantity to a defect code and optional anomaly snapshot. |
| `TelemetryPacket` | BigAutoField | High-volume sensor data (spindle speed, feed rate, temperature, vibration). Composite index on `[machine, timestamp]`. |
| `MachineEvent` | UUID | Machine lifecycle events (`HEARTBEAT_LOST`, `HEARTBEAT_RESTORED`, `STATUS_CHANGE`). |
| `DataExportJob` | UUID | Async export job. Status: `QUEUED` -> `PROCESSING` -> `COMPLETED` / `FAILED`. Formats: CSV, JSON, PARQUET. |

### 3.3 Entity Relationship Summary

```
CustomUser ──M2M──> Role ──M2M──> Permission
    │
    ├──FK── UserSession
    ├──FK── WorkOrder (created_by)
    ├──FK── WorkOrderAssignment (operator, assigned_by)
    ├──FK── WorkOrderExecution (operator)
    ├──FK── ProductionLog (recorded_by)
    ├──FK── DataExportJob (requested_by)
    └──FK── AuditLog (actor_user)

Part ──FK──> WorkOrder
Machine ──FK──> WorkOrderAssignment, WorkOrderExecution, TelemetryPacket, MachineEvent

WorkOrder ──FK──> WorkOrderAssignment, WorkOrderExecution
WorkOrderExecution ──FK──> ProductionLog, AnomalySnapshot, TelemetryPacket

ProductionLog ──FK──> ScrapLog
DefectCode ──FK──> ScrapLog
AnomalySnapshot ──FK──> ScrapLog
```

---

## 4. Completed Tasks (All 17)

### Phase 1 -- Auth & User Management

| Task | Title | Description |
|------|-------|-------------|
| TASK-001 | Auth Completion | JWT login with `UserSession` tracking (token hash, IP, user agent). Logout with token blacklisting. Heartbeat with 15-min inactivity timeout. |
| TASK-002 | User Management API | Full CRUD for users. List, create (admin), retrieve, update, soft-delete. Self-deletion prevention. `GET /me/` for own profile. |
| TASK-003 | Role & Permission API | CRUD for roles (system roles undeletable). Permission assignment. `seed_permissions` management command. Read-only permission listing. |
| TASK-004 | AuditLog Utility | `log_action()` helper in `core/audit.py`. Best-effort (never crashes parent operation). Integrated into all write endpoints. Fixed `AuditLog.__str__` bug. |

### Phase 2 -- Work Order Management

| Task | Title | Description |
|------|-------|-------------|
| TASK-005 | WorkOrder Models | `WorkOrder` and `WorkOrderAssignment` models with UUID PKs, status choices, FK constraints. Migration 0003. |
| TASK-006 | Work Order API | Full CRUD with status/machine filtering. Assignment endpoint with validation (reject CANCELLED/COMPLETED WOs, require active operator, non-OFFLINE machine). Audit logging on all mutations. |

### Phase 3 -- Production Execution

| Task | Title | Description |
|------|-------|-------------|
| TASK-007 | Execution Model | `WorkOrderExecution` model with status state machine (RUNNING/PAUSED/COMPLETED). Migration 0004. |
| TASK-008 | Execution API | Start/pause/resume/stop lifecycle with `transaction.atomic()` + `select_for_update()` for race condition prevention. Machine IDLE check on stop (only if no other active executions). Paused_at cleanup on stop. |

### Phase 4 -- Quality Entry & Anomaly Capture

| Task | Title | Description |
|------|-------|-------------|
| TASK-009 | Quality Models | `DefectCode`, `ProductionLog`, `AnomalySnapshot`, `ScrapLog` models. Migration 0005. |
| TASK-010 | Quality Entry API | Production log creation, scrap logging with automatic anomaly snapshot (captures last 5 minutes of telemetry data). Defect code management (admin-only creation). |

### Phase 5 -- Live Telemetry Monitoring

| Task | Title | Description |
|------|-------|-------------|
| TASK-011 | Telemetry Models | `TelemetryPacket` (BigAutoField PK for performance) and `MachineEvent` models. Composite index on `[machine, timestamp]`. Migration 0006. |
| TASK-012 | Live Overview API | Machine overview with latest telemetry per machine. Paginated telemetry history (max 500). Machine event listing with optional machine filter. |
| TASK-013 | Telemetry Tools | `simulate_telemetry` command (mock CNC data generator). `detect_offline` command (heartbeat loss detection with configurable timeout). Input validation on both commands. |

### Phase 6 -- AI-Ready Data Export

| Task | Title | Description |
|------|-------|-------------|
| TASK-014 | Export Model | `DataExportJob` model with status/format choices, date range, file path. Migration 0007. |
| TASK-015 | Export API | Create/poll/download export jobs. API key authentication (`X-API-Key` header). `process_export_jobs` management command aggregates telemetry, executions, production logs, scrap logs into CSV/JSON. Security: IDOR protection (ownership filtering), path traversal guard, 90-day date range cap, sanitised error messages. |

### Phase 7 -- Hardening & Infrastructure

| Task | Title | Description |
|------|-------|-------------|
| TASK-016 | RBAC Permissions | `HasPermission` class with `require_permission()` factory. `IsAdmin` and `IsSupervisor` shortcuts. Applied to all ViewSets. Staff users bypass automatically. |
| TASK-017 | Config & Operations | SystemConfig CRUD (admin-only, audit-logged). Operation CRUD (admin-only for mutations, authenticated for reads). |

---

## 5. Security Measures Implemented

### Authentication
- JWT with 15-minute access token lifetime
- Refresh token blacklisting on logout
- Session tracking with SHA-256 token hashes
- API key authentication for machine-to-machine (data export)
- Heartbeat endpoint with inactivity timeout

### Authorization
- Role-Based Access Control (RBAC) with permission codes
- `HasPermission` checks user's roles for specific permission codes
- `is_staff` bypass for backwards compatibility
- Ownership-scoped queries (export jobs filtered by `requested_by`)

### Data Integrity
- `transaction.atomic()` + `select_for_update()` on all state transitions
- State machine validation (reject invalid status transitions)
- FK constraints with appropriate `on_delete` policies (PROTECT, SET_NULL, CASCADE)
- Soft-delete for users (preserves audit trail)

### Input Validation
- Serializer-level validation on all write endpoints
- Date range validation (date_from < date_to, max 90 days)
- Management command input validation (positive intervals/timeouts)
- Path traversal guard on file downloads (`os.path.realpath()` + prefix check)

### Audit Trail
- `AuditLog` records on all create/update/delete operations
- Before/after JSON snapshots for change tracking
- IP address and user agent captured from requests
- Best-effort (never crashes parent operation)

### Information Security
- Internal file paths excluded from API responses
- Stack traces sanitised in error messages (first line only)
- No mass-assignment vulnerabilities (explicit field lists, read-only fields)
- API key hashed with SHA-256 before storage and comparison

---

## 6. Test Coverage

| Test Class | Tests | Coverage |
|------------|-------|----------|
| Auth & Session (users) | 21 | Login, logout, heartbeat, session tracking, token blacklisting |
| User CRUD (users) | 18 | List, create, retrieve, update, soft-delete, self-delete prevention |
| Role & Permission (users) | 17 | CRUD, permission assignment, system role protection |
| AuditLog (users) | 8 | Audit integration in user operations |
| IP Utility (users) | 9 | X-Forwarded-For parsing edge cases |
| WorkOrder Models (core) | 10 | Model creation, defaults, constraints, FK relationships |
| WorkOrder API (core) | 18 | CRUD, filtering, assignment, audit logging |
| Execution API (core) | 21 | Start/pause/resume/stop, race conditions, edge cases |
| Quality Models (core) | 12 | DefectCode, ProductionLog, AnomalySnapshot, ScrapLog |
| Quality API (core) | 10 | Production log, scrap log, anomaly snapshot, defect codes |
| Telemetry Models (core) | 9 | TelemetryPacket, MachineEvent |
| Live Overview API (core) | 10 | Machine overview, telemetry history, event listing |
| Management Commands (core) | 8 | simulate_telemetry, detect_offline |
| DataExportJob Model (core) | 6 | Creation, defaults, FK, soft-delete |
| RBAC Permissions (core) | 6 | HasPermission, require_permission, staff bypass |
| Data Export API (core) | 10 | Create, retrieve, download, API key auth, validation |
| SystemConfig API (core) | 6 | List, create, update, admin-only, audit logging |
| Operation API (core) | 6 | List, create, update, delete, auth checks |
| **Total** | **211** | |

---

## 7. Database Migrations

| Migration | Content |
|-----------|---------|
| `users/0001_initial` | CustomUser, Permission, Role, UserSession, ApiClient |
| `core/0001_initial` | Machine, Part, Operation |
| `core/0002_auditlog_systemconfig` | AuditLog, SystemConfig |
| `core/0003_workorder_workorderassignment` | WorkOrder, WorkOrderAssignment |
| `core/0004_workorderexecution` | WorkOrderExecution |
| `core/0005_defectcode_anomalysnapshot_productionlog_scraplog` | Quality models |
| `core/0006_machineevent_telemetrypacket` | Telemetry models |
| `core/0007_dataexportjob` | DataExportJob |

---

## 8. Management Commands

| Command | Description |
|---------|-------------|
| `python manage.py seed_permissions` | Populates the Permission table with canonical permission codes |
| `python manage.py simulate_telemetry --machine <slug> [--interval N]` | Generates mock telemetry packets (default 1s interval) |
| `python manage.py detect_offline [--timeout N]` | Detects RUNNING machines without recent telemetry (default 3s) and marks them OFFLINE |
| `python manage.py process_export_jobs` | Processes QUEUED DataExportJob records, writes CSV/JSON to `exports/` directory |

---

## 9. File Structure

```
backend/
├── backend/
│   ├── settings.py          # Django settings (DB, JWT, DRF config)
│   ├── urls.py              # Root URL config (includes users + core)
│   └── wsgi.py
├── users/
│   ├── models.py            # CustomUser, Role, Permission, UserSession, ApiClient
│   ├── views.py             # Auth views, UserViewSet, RoleViewSet, PermissionViewSet
│   ├── serializers.py       # User/Role/Permission serializers
│   ├── urls.py              # Auth + user management routes
│   ├── utils.py             # get_client_ip()
│   ├── auth.py              # ApiKeyAuthentication
│   ├── tests.py             # 73 tests
│   └── management/commands/
│       └── seed_permissions.py
├── core/
│   ├── models.py            # All MES domain models (16 models)
│   ├── views.py             # All MES API views (11 ViewSets/APIViews)
│   ├── serializers.py       # All MES serializers (20+ serializers)
│   ├── urls.py              # MES API routes
│   ├── permissions.py       # RBAC permission classes
│   ├── audit.py             # log_action() helper
│   ├── tests.py             # 138 tests
│   └── management/commands/
│       ├── simulate_telemetry.py
│       ├── detect_offline.py
│       └── process_export_jobs.py
├── docker-compose.yaml
├── Dockerfile
├── requirements.txt
└── TASK_LIST.md
```

---

## 10. Known Limitations & Future Work

| Item | Category | Description |
|------|----------|-------------|
| WebSocket telemetry push | Feature gap | Real-time telemetry uses REST polling; Django Channels needed for WebSocket |
| Celery integration | Feature gap | Export jobs run synchronously via management command; Celery would enable async processing |
| Parquet export | Stub | Returns FAILED with "not yet supported"; needs `pyarrow` dependency |
| Rate limiting | Security | No `AnonRateThrottle` on login endpoint |
| SECRET_KEY / DEBUG | Security | Hardcoded in `settings.py`; should be environment variables |
| ALLOWED_HOSTS | Security | Contains `0.0.0.0`; should be restricted in production |
| WO completion check | Logic | `stop` action sets WO to COMPLETED without checking for other active executions on the same WO |
| API key timing | Security | Hash comparison uses `==` (not constant-time); low risk with hashed-index lookups |
| Pagination | Feature gap | Most list endpoints return all results; consider DRF pagination classes |
| X-Forwarded-For | Security | IP spoofing possible without nginx `set_real_ip_from` directive |

---

## 11. Development Environment

### Running the Application
```bash
docker-compose up -d
```

### Running Tests
```bash
# Full suite
docker-compose run --entrypoint "" --no-deps web python manage.py test core users --verbosity=2

# Single test class
docker-compose run --entrypoint "" --no-deps web python manage.py test core.tests.ExecutionAPITests --verbosity=2
```

### Creating Migrations
```bash
docker-compose run --entrypoint "" --no-deps web python manage.py makemigrations core
docker-compose run --entrypoint "" web python manage.py migrate
```

### Seeding Permissions
```bash
docker-compose run --entrypoint "" web python manage.py seed_permissions
```

**Note:** Always use `--entrypoint ""` on Windows to avoid CRLF issues with `entrypoint.sh`.
