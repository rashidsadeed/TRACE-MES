# TRACE-MES Backend — Task List

**PM/Scrum Master:** Lead
**Team:** Coder · Security · QA
**Last Updated:** 2026-03-07

---

## Codebase Audit Summary

### Already Implemented
| Item | Location | Notes |
|---|---|---|
| `Machine` model + CRUD ViewSet | `core/models.py`, `core/views.py` | Basic, no role-based permissions |
| `Part` model + CRUD ViewSet | `core/models.py`, `core/views.py` | Basic, no role-based permissions |
| `Operation` model | `core/models.py` | Model only, no views/serializers |
| `SystemConfig` model | `core/models.py` | Model only, no views/serializers |
| `AuditLog` model | `core/models.py` | Model only, never written to. **BUG: `__str__` uses `self.action_type` but field is `self.action`** |
| `CustomUser` model | `users/models.py` | Full soft-delete logic |
| `UserSession` model | `users/models.py` | Populated by login view |
| `Permission`, `Role` models | `users/models.py` | Models only, no views |
| `ApiClient` model | `users/models.py` | Model only, no auth integration |
| `CustomLoginView` | `users/views.py` | Creates UserSession on login (token hash + IP) |
| `LogoutView` | `users/views.py` | Marks session as ended |
| `HeartbeatView` | `users/views.py` | Updates last_activity, returns 401 on expiry |
| `get_client_ip()` utility | `users/utils.py` | X-Forwarded-For aware |
| Auth URLs wired | `users/urls.py`, `backend/urls.py` | login, refresh, logout, heartbeat |
| JWT login + refresh | `backend/urls.py` | Via `rest_framework_simplejwt` |
| Auth tests | `users/tests.py` | Login, logout, heartbeat, IP utility — written, not yet run in Docker |
| Docker (PostgreSQL + Redis) | `docker-compose.yaml` | Fully wired |

### Missing / Not Implemented
All features from TASK-002 onwards. See tasks below.

---

## Task Definitions

Legend: `[ ] TODO` · `[~] IN PROGRESS` · `[✓] DONE` · `[!] BLOCKED`

---

### PHASE 1 — Auth & User Management

#### TASK-001 · Auth Completion — Logout + UserSession Tracking
**Priority:** CRITICAL
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** Nothing

**Scope:**
- Override `TokenObtainPairView` to create a `UserSession` record (storing token hash, IP, user-agent) on successful login. Wire up as `POST /api/auth/login/`.
- Add `POST /api/auth/logout/` view: extract JWT from header, mark the matching `UserSession` as ended (`ended_at = now()`).
- Add `POST /api/auth/heartbeat/` view: updates `last_activity` on the active session (used by frontend every 60s). Return `401` if session is expired (> 15 min since `last_activity`).
- Wire all new auth URLs into `backend/urls.py`.
- Write a `get_client_ip(request)` utility in `users/utils.py`.

**Files created/modified:**
- `users/views.py` — `CustomLoginView`, `LogoutView`, `HeartbeatView`
- `users/urls.py` — auth routes (login, refresh, logout, heartbeat)
- `users/serializers.py` — `LoginSerializer`, `LogoutSerializer`
- `users/utils.py` — `get_client_ip()` helper
- `backend/urls.py` — includes `users.urls`
- `users/tests.py` — comprehensive tests written

**Acceptance Criteria:**
- Logging in creates a `UserSession` row.
- Logging out sets `ended_at` on that session.
- Heartbeat with inactive session (> 15 min) returns `401`.
- All tests pass in Docker.

**Security Blockers (must resolve before DONE):**
- **BLOCK-1** `backend/backend/settings.py` + `users/views.py` — JWT never blacklisted on logout; token remains valid for 60 min after `LogoutView` runs. Fix: install `rest_framework_simplejwt.token_blacklist`, call `token.blacklist()` in `LogoutView`.
- **BLOCK-2** `backend/backend/settings.py:155` — `ACCESS_TOKEN_LIFETIME = 60 min` is too long for an MES. Reduce to ≤15 min.
- **BLOCK-3** `backend/core/models.py:93` — `AuditLog.__str__` uses `self.action_type`; field is `self.action`. Guaranteed `AttributeError`.
- **BLOCK-4** `backend/backend/settings.py:25` — `SECRET_KEY` hardcoded in source. Move to env var, rotate immediately.
- **BLOCK-5** `backend/backend/settings.py:28` — `DEBUG = True` hardcoded. Move to env var, default `False`.

**Security Warnings (non-blocking, track for follow-up):**
- WARN-1: `X-Forwarded-For` IP spoofing — enforce at nginx layer
- WARN-2: No rate limiting on login endpoint — add `AnonRateThrottle`
- WARN-3: `HeartbeatView` bare `session.save()` — use `.update(last_activity=timezone.now())` for atomicity
- WARN-4: `CustomLoginView` re-decodes JWT to get user — wrap in `try/except ObjectDoesNotExist`
- WARN-5: `0.0.0.0` in `ALLOWED_HOSTS` — remove
- WARN-6: No separate `JWT_SIGNING_KEY` env var — `SECRET_KEY` signs JWTs
- WARN-7: `LogoutSerializer` defined but never wired into `LogoutView`
- WARN-8: `UserSession.objects.create()` can raise `IntegrityError` on token collision — add try/except

**QA Result:** APPROVED — 21/21 tests passed in Docker (PostgreSQL). Command used:
`docker-compose run --entrypoint "" --no-deps web python manage.py test users --verbosity=2`
Note: volume-mount overrides `entrypoint.sh` CRLF fix at runtime — always use `--entrypoint ""` for test runs.

---

#### TASK-002 · User Management API (CRUD + Role Assignment)
**Priority:** HIGH
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-001

**Scope:**
- `GET /api/users/` — list all users (admin/supervisor only)
- `POST /api/users/` — create/register user (admin only), assign initial role
- `GET /api/users/me/` — return current authenticated user's profile + roles
- `GET /api/users/{id}/` — retrieve user detail
- `PATCH /api/users/{id}/` — update user (name, email, roles)
- `DELETE /api/users/{id}/` — soft-delete (calls `user.delete()`, which already sets `is_active=False`)
- Enforce: a user cannot delete their own account.

**Files to create/modify:**
- `users/serializers.py` — `UserSerializer`, `UserCreateSerializer`
- `users/views.py` — `UserViewSet`
- `users/urls.py` — register routes

---

#### TASK-003 · Role & Permission API
**Priority:** MEDIUM
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-002

**Scope:**
- `GET/POST /api/roles/` — list and create roles
- `GET/PATCH/DELETE /api/roles/{id}/` — manage individual role
- `POST /api/roles/{id}/permissions/` — assign permissions to a role
- `GET /api/permissions/` — list all available permissions (read-only)
- Seed management command (`manage.py seed_permissions`) that populates `Permission` table with the system's canonical permission codes (e.g. `users.manage`, `workorders.create`, `quality.entry`, `system.admin`).

**Files to create/modify:**
- `users/serializers.py` — `RoleSerializer`, `PermissionSerializer`
- `users/views.py` — `RoleViewSet`, `PermissionViewSet`
- `users/urls.py`
- `users/management/commands/seed_permissions.py` — new management command

---

#### TASK-004 · AuditLog Utility (Cross-Cutting)
**Priority:** HIGH
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-001

**Scope:**
- Create a reusable `log_action(actor, action, entity_type, entity_id, before, after, request)` helper in `core/audit.py`.
- Integrate into `UserViewSet` (TASK-002) and all subsequent write endpoints.
- The `AuditLog` model already exists — this task is just the helper layer.
- **Also fix the `AuditLog.__str__` bug**: replace `self.action_type` with `self.action` in `core/models.py`.

**Files to create/modify:**
- `core/audit.py` — new helper module
- `core/models.py` — fix `AuditLog.__str__` bug

---

### PHASE 2 — Work Order Management

#### TASK-005 · WorkOrder & WorkOrderAssignment Models + Migrations
**Priority:** HIGH
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-001

**Scope (new models in `core/models.py`):**

`WorkOrder`:
- `id` (UUID), `code` (unique char), `description` (text), `part` (FK → Part), `target_qty` (int), `priority` (int default 1)
- `status`: `PENDING | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED`
- `created_by` (FK → CustomUser), `created_at`, `updated_at`

`WorkOrderAssignment`:
- `id` (UUID), `work_order` (FK → WorkOrder), `machine` (FK → Machine), `operator` (FK → CustomUser)
- `assigned_at`, `assigned_by` (FK → CustomUser)

Run `makemigrations` inside Docker.

**Files to modify:**
- `core/models.py`
- New migration file

---

#### TASK-006 · Work Order API
**Priority:** HIGH
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-005, TASK-004

**Scope:**
- `GET /api/workorders/` — list work orders (filter by status, machine)
- `POST /api/workorders/` — create work order (status starts as `PENDING`), write AuditLog
- `GET /api/workorders/{id}/` — retrieve detail
- `PATCH /api/workorders/{id}/` — update fields (not status directly)
- `POST /api/workorders/{id}/assign/` — assign machine + operator, create `WorkOrderAssignment`, write AuditLog
- `GET /api/workorders/{id}/assignments/` — list assignments for a work order

**Files to create/modify:**
- `core/serializers.py` — `WorkOrderSerializer`, `WorkOrderAssignmentSerializer`
- `core/views.py` — `WorkOrderViewSet`
- `core/urls.py` — register routes

---

### PHASE 3 — Production Execution

#### TASK-007 · WorkOrderExecution Model + Migration
**Priority:** HIGH
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-005

**Scope (new model in `core/models.py`):**

`WorkOrderExecution`:
- `id` (UUID), `work_order` (FK → WorkOrder), `machine` (FK → Machine), `operator` (FK → CustomUser)
- `status`: `RUNNING | PAUSED | COMPLETED`
- `started_at`, `paused_at` (nullable), `completed_at` (nullable)

Run `makemigrations` inside Docker.

---

#### TASK-008 · Production Execution API
**Priority:** HIGH
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-007, TASK-004

**Scope:**
- `POST /api/executions/start/` — start execution: set `WorkOrder → IN_PROGRESS`, `Machine → RUNNING`, create `WorkOrderExecution`
- `POST /api/executions/{id}/pause/` — set execution `status = PAUSED`, update `paused_at`, set `WorkOrder → PAUSED`
- `POST /api/executions/{id}/resume/` — set execution `status = RUNNING`, set `WorkOrder → IN_PROGRESS`
- `POST /api/executions/{id}/stop/` — complete: set `WorkOrder → COMPLETED`, `Machine → IDLE`, `execution.completed_at = now()`
- State validation: reject invalid transitions (e.g. pausing a completed execution).

**Files to create/modify:**
- `core/serializers.py`
- `core/views.py` — `ExecutionViewSet`
- `core/urls.py`

---

### PHASE 4 — Quality Entry & Anomaly Capture

#### TASK-009 · Quality Models + Migrations
**Priority:** MEDIUM
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-007

**Scope (new models in `core/models.py`):**

`DefectCode`: `id` (UUID), `code` (unique char), `description` (text), `category` (char)

`ProductionLog`:
- `id` (UUID), `execution` (FK → WorkOrderExecution), `recorded_by` (FK → CustomUser)
- `good_qty` (int), `scrap_qty` (int), `recorded_at`

`AnomalySnapshot`:
- `id` (UUID), `execution` (FK → WorkOrderExecution), `captured_at`
- `telemetry_window_json` (JSONField — last 5 min of telemetry)

`ScrapLog`:
- `id` (UUID), `production_log` (FK → ProductionLog), `defect_code` (FK → DefectCode)
- `qty` (int), `anomaly_snapshot` (FK → AnomalySnapshot, nullable)

Run `makemigrations` inside Docker.

---

#### TASK-010 · Quality Entry API
**Priority:** MEDIUM
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-009

**Scope:**
- `POST /api/quality/production-log/` — log good/scrap qty for an execution
- `POST /api/quality/scrap-log/` — log scrap with a defect code; auto-trigger anomaly snapshot capture: query last 5 min of `TelemetryPacket` for the machine, store as `AnomalySnapshot`, link to `ScrapLog`
- `GET /api/quality/defect-codes/` — list available defect codes (read-only)
- `POST /api/quality/defect-codes/` — create defect code (admin only)

**Files to create/modify:**
- `core/serializers.py`
- `core/views.py`
- `core/urls.py`

---

### PHASE 5 — Live Telemetry Monitoring

#### TASK-011 · Telemetry Models + Migrations
**Priority:** MEDIUM
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-007

**Scope (new models in `core/models.py`):**

`TelemetryPacket`:
- `id` (UUID, or auto int for performance), `machine` (FK → Machine), `execution` (FK → WorkOrderExecution, nullable)
- `timestamp`, `spindle_speed` (float), `feed_rate` (float), `temperature` (float), `vibration` (float)
- Add `db_index=True` on `timestamp` and `machine`.

`MachineEvent`:
- `id` (UUID), `machine` (FK → Machine), `event_type` (char: `HEARTBEAT_LOST | HEARTBEAT_RESTORED | STATUS_CHANGE`)
- `timestamp`, `details` (JSONField, nullable)

Run `makemigrations` inside Docker.

---

#### TASK-012 · Live Overview REST Endpoint
**Priority:** MEDIUM
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-011

**Scope:**
- `GET /api/live/overview/` — return all machines with their current status and the most recent `TelemetryPacket` for each (if available).
- `GET /api/live/telemetry/{machine_id}/` — return last N telemetry packets for a machine (paginated, default 100).
- `GET /api/live/events/` — recent `MachineEvent` list.

**Files to create/modify:**
- `core/serializers.py`
- `core/views.py`
- `core/urls.py`

---

#### TASK-013 · Mock Telemetry Generator + Connection Loss Detection
**Priority:** MEDIUM
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-011

**Scope:**
- Django management command `manage.py simulate_telemetry --machine <slug>` that generates `TelemetryPacket` rows every second for a given machine (simulating a CNC feed).
- A Django management command `manage.py detect_offline` that scans machines with `status=RUNNING` and checks if a `TelemetryPacket` was received in the last 3 seconds; if not, sets `Machine.status = OFFLINE` and creates a `MachineEvent(HEARTBEAT_LOST)`.
- Note: WebSocket/real-time push is descoped for now (requires Django Channels); REST polling via `GET /api/live/overview/` is sufficient for Phase 5.

**Files to create:**
- `core/management/commands/simulate_telemetry.py`
- `core/management/commands/detect_offline.py`

---

### PHASE 6 — AI-Ready Data Export

#### TASK-014 · DataExportJob Model + Migration
**Priority:** LOW
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-009, TASK-011

**Scope (new model in `core/models.py`):**

`DataExportJob`:
- `id` (UUID), `requested_by` (FK → CustomUser, nullable for API key clients)
- `status`: `QUEUED | PROCESSING | COMPLETED | FAILED`
- `format`: `CSV | JSON | PARQUET`
- `date_from`, `date_to` (DateTimeField)
- `file_path` (char, nullable), `error_message` (text, nullable)
- `created_at`, `completed_at` (nullable)

Run `makemigrations` inside Docker.

---

#### TASK-015 · Data Export API + Background Processing
**Priority:** LOW
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-014

**Scope:**
- `POST /api/export/jobs/` — create a `DataExportJob` (status=`QUEUED`), return `202 Accepted` with `jobId`.
- `GET /api/export/jobs/{id}/` — poll job status.
- `GET /api/export/jobs/{id}/download/` — stream the file when `status=COMPLETED`.
- Background processing: implement as a Django management command `manage.py process_export_jobs` (Celery is deferred; use synchronous processing triggered manually for now). Aggregates TelemetryPackets, WorkOrderExecutions, ProductionLogs, ScrapLogs and writes CSV/JSON to a local `exports/` directory.
- API Key authentication: check `X-API-Key` header against `ApiClient.api_key_hash` (SHA-256). Create a custom DRF authentication class `ApiKeyAuthentication` in `users/auth.py`.

**Files to create/modify:**
- `core/serializers.py`
- `core/views.py`
- `core/urls.py`
- `users/auth.py` — `ApiKeyAuthentication` class

---

### PHASE 7 — Hardening & Infrastructure

#### TASK-016 · Role-Based Permission Classes
**Priority:** HIGH (needed before any production use)
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-003

**Scope:**
- Create custom DRF permission classes in `core/permissions.py`:
  - `HasPermission('code')` — checks if the authenticated user's roles include a given permission code.
  - `IsAdmin` — shorthand for `sys.admin`.
  - `IsSupervisor` — shorthand for `workorders.manage`.
- Apply appropriate permission classes to all existing and new ViewSets.
- Update `Machine` and `Part` ViewSets to require specific role permissions instead of just `IsAuthenticated`.

**Files to create/modify:**
- `core/permissions.py` — new
- `core/views.py` — apply permissions
- `users/views.py` — apply permissions

---

#### TASK-017 · SystemConfig & Operation APIs
**Priority:** LOW
**Assigned To:** Coder · Security · QA — ALL APPROVED
**Status:** `[✓] DONE`
**Depends On:** TASK-016

**Scope:**
- `GET/POST/PATCH /api/config/` — manage `SystemConfig` key-value pairs (admin only), write AuditLog on change.
- `GET/POST/PUT/DELETE /api/operations/` — CRUD for `Operation` model.

---

## Sprint 1 — Completed

| Task | Description | Owner | Status |
|---|---|---|---|
| TASK-001 | Auth Completion (logout + UserSession) | All | `[✓] DONE` |
| TASK-002 | User Management API (CRUD + Role Assignment) | All | `[✓] DONE` |

---

## Sprint 2 — Completed

| Task | Description | Owner | Status |
|---|---|---|---|
| TASK-004 | AuditLog Utility + `core/urls.py` fix | All | `[✓] DONE` |
| TASK-005 | WorkOrder & Assignment Models | All | `[✓] DONE` |
| TASK-006 | Work Order API | All | `[✓] DONE` |
| TASK-007 | WorkOrderExecution Model | All | `[✓] DONE` |
| TASK-003 | Role & Permission API | All | `[✓] DONE` |
| TASK-008 | Production Execution API | All | `[✓] DONE` |

---

## Sprint 3 — Active Tasks

| Task | Description | Owner | Status |
|---|---|---|---|
| TASK-009 | Quality Models + Migrations | All | `[✓] DONE` |
| TASK-011 | Telemetry Models + Migrations | All | `[✓] DONE` |
| TASK-016 | Role-Based Permission Classes | All | `[✓] DONE` |
| TASK-010 | Quality Entry API | All | `[✓] DONE` |
| TASK-012 | Live Overview REST Endpoint | All | `[✓] DONE` |
| TASK-013 | Mock Telemetry Generator | All | `[✓] DONE` |
| TASK-014 | DataExportJob Model + Migration | All | `[✓] DONE` |
| TASK-015 | Data Export API | All | `[✓] DONE` |
| TASK-017 | SystemConfig & Operation APIs | All | `[✓] DONE` |

---

## Completion Criteria (per task)

A task is only marked `[✓] DONE` when:
1. **Coder** submits code and notifies **Security** and **QA**.
2. **Security** reviews and finds no blocking vulnerabilities.
3. **QA** writes tests and all pass inside Docker (`docker exec ... python manage.py test`).
4. **PM** updates status here.
