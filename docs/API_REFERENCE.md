# TRACE-MES Backend -- API Reference

**Base URL:** `http://localhost:8000/api/`
**Content Type:** `application/json`
**Authentication:** JWT Bearer token (unless otherwise noted)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User Management](#2-user-management)
3. [Roles & Permissions](#3-roles--permissions)
4. [Machines](#4-machines)
5. [Parts](#5-parts)
6. [Work Orders](#6-work-orders)
7. [Production Execution](#7-production-execution)
8. [Quality & Defect Tracking](#8-quality--defect-tracking)
9. [Live Telemetry](#9-live-telemetry)
10. [Data Export](#10-data-export)
11. [System Configuration](#11-system-configuration)
12. [Operations](#12-operations)
13. [Error Handling](#13-error-handling)
14. [Authentication Details](#14-authentication-details)

---

## 1. Authentication

All endpoints require authentication unless stated otherwise. Two mechanisms are supported:

- **JWT Bearer Token** -- Include `Authorization: Bearer <access_token>` header.
- **API Key** (export endpoints only) -- Include `X-API-Key: <raw_key>` header.

### POST /api/auth/login/

Authenticate a user and receive JWT tokens.

**Auth required:** No

**Request body:**
```json
{
  "username": "operator1",
  "password": "securePass123!"
}
```

**Response `200 OK`:**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIs...",
  "refresh": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Side effect:** Creates a `UserSession` record with the token hash, client IP, and user agent.

---

### POST /api/auth/refresh/

Refresh an expired access token using a refresh token.

**Auth required:** No

**Request body:**
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response `200 OK`:**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### POST /api/auth/logout/

End the current session and optionally blacklist the refresh token.

**Auth required:** Yes (Bearer token)

**Request body (optional):**
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response `200 OK`:**
```json
{
  "detail": "Logged out successfully."
}
```

**Response `404`:** No active session found for this token.

---

### POST /api/auth/heartbeat/

Update session activity timestamp. Returns `401` if the session has been inactive for more than 15 minutes.

**Auth required:** Yes (Bearer token)

**Response `200 OK`:**
```json
{
  "detail": "Session active.",
  "last_activity": "2026-03-08T14:30:00Z"
}
```

**Response `401`:**
```json
{
  "detail": "Session expired due to inactivity."
}
```

---

## 2. User Management

### GET /api/users/

List all active users.

**Auth required:** Admin (`is_staff`)

**Response `200 OK`:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "operator1",
    "email": "op1@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "is_active": true,
    "is_staff": false,
    "roles": [
      {
        "id": "...",
        "name": "Operator",
        "level": 1
      }
    ]
  }
]
```

---

### POST /api/users/

Create a new user.

**Auth required:** Admin (`is_staff`)

**Request body:**
```json
{
  "username": "newuser",
  "email": "new@example.com",
  "password": "securePass123!",
  "first_name": "Jane",
  "last_name": "Smith",
  "role": ["<role-uuid>"]
}
```

**Response `201 Created`:** Returns the full user object.

---

### GET /api/users/me/

Get the authenticated user's own profile.

**Auth required:** Yes (any authenticated user)

**Response `200 OK`:** Returns the user object with roles.

---

### GET /api/users/{id}/

Retrieve a specific user.

**Auth required:** Yes (any authenticated user)

---

### PATCH /api/users/{id}/

Update user fields (name, email, roles).

**Auth required:** Admin (`is_staff`)

**Request body (all fields optional):**
```json
{
  "first_name": "Updated",
  "email": "updated@example.com",
  "role": ["<role-uuid>"]
}
```

**Response `200 OK`:** Returns the updated user object.

---

### DELETE /api/users/{id}/

Soft-delete a user (sets `is_active=False` and closes all sessions).

**Auth required:** Admin (`is_staff`)

**Constraint:** A user cannot delete their own account (returns `403`).

**Response `204 No Content`**

---

## 3. Roles & Permissions

### GET /api/roles/

List all roles with their assigned permissions.

**Auth required:** Admin (`is_staff`)

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "name": "Supervisor",
    "type": "system",
    "level": 5,
    "description": "Floor supervisor",
    "permissions": [
      { "id": "...", "code": "workorders.create", "description": "...", "module": "WorkOrders" }
    ]
  }
]
```

---

### POST /api/roles/

Create a new role.

**Auth required:** Admin (`is_staff`)

**Request body:**
```json
{
  "name": "Quality Inspector",
  "level": 3,
  "description": "Quality control team"
}
```

---

### GET /api/roles/{id}/

Retrieve a single role with permissions.

---

### PATCH /api/roles/{id}/

Update role name, level, or description.

---

### DELETE /api/roles/{id}/

Delete a custom role. System roles cannot be deleted (returns `403`).

---

### POST /api/roles/{id}/permissions/

Replace the role's permissions with the supplied list.

**Request body:**
```json
{
  "permissions": ["<permission-uuid-1>", "<permission-uuid-2>"]
}
```

**Response `200 OK`:** Returns the updated role object with permissions.

---

### GET /api/permissions/

List all system-defined permissions (read-only).

**Auth required:** Yes (any authenticated user)

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "code": "workorders.create",
    "description": "Create and manage work orders",
    "module": "WorkOrders"
  }
]
```

---

## 4. Machines

### GET /api/machines/

List all machines, ordered by name.

**Auth required:** Yes (any authenticated user)

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "name": "CNC Mill 1",
    "type": "Milling",
    "status": "RUNNING",
    "slug": "cnc-mill-1"
  }
]
```

---

### POST /api/machines/

Create a new machine.

**Auth required:** Permission `machines.manage` (or `is_staff`)

**Request body:**
```json
{
  "name": "CNC Mill 2",
  "type": "Milling",
  "status": "IDLE"
}
```

**Note:** `slug` is auto-generated from `name` if not provided.

---

### GET /api/machines/{id}/

Retrieve a specific machine.

---

### PATCH /api/machines/{id}/

Update machine fields.

**Auth required:** Permission `machines.manage` (or `is_staff`)

---

## 5. Parts

### GET /api/parts/

List all parts.

**Auth required:** Yes (any authenticated user)

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "name": "Widget A",
    "sku": "WGT-001",
    "description": "A standard widget"
  }
]
```

---

### POST /api/parts/

Create a new part.

**Auth required:** Permission `parts.manage` (or `is_staff`)

**Request body:**
```json
{
  "name": "Widget B",
  "sku": "WGT-002",
  "description": "A premium widget"
}
```

---

### GET /api/parts/{id}/

Retrieve a specific part.

---

### PATCH /api/parts/{id}/

Update part fields.

**Auth required:** Permission `parts.manage` (or `is_staff`)

---

## 6. Work Orders

### GET /api/workorders/

List work orders. Supports query parameter filtering.

**Auth required:** Yes (any authenticated user)

**Query parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (e.g. `PENDING`, `IN_PROGRESS`, `COMPLETED`) |
| `machine` | UUID | Filter by assigned machine ID |

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "code": "WO-2026-001",
    "description": "Produce 100 Widget A",
    "part": { "id": "...", "name": "Widget A", "sku": "WGT-001", "description": "..." },
    "target_qty": 100,
    "priority": 1,
    "status": "PENDING",
    "created_by": { "id": "...", "username": "supervisor1" },
    "created_at": "2026-03-08T10:00:00Z",
    "updated_at": "2026-03-08T10:00:00Z"
  }
]
```

---

### POST /api/workorders/

Create a new work order.

**Auth required:** Permission `workorders.create` (or `is_staff`)

**Request body:**
```json
{
  "code": "WO-2026-001",
  "description": "Produce 100 Widget A",
  "part": "<part-uuid>",
  "target_qty": 100,
  "priority": 1
}
```

**Response `201 Created`:** Returns the full work order object with nested part and created_by.

---

### GET /api/workorders/{id}/

Retrieve a specific work order.

---

### PATCH /api/workorders/{id}/

Update work order fields (`description`, `target_qty`, `priority` only -- status is managed via execution lifecycle).

**Auth required:** Permission `workorders.create` (or `is_staff`)

---

### POST /api/workorders/{id}/assign/

Assign a machine and operator to the work order.

**Auth required:** Permission `workorders.create` (or `is_staff`)

**Request body:**
```json
{
  "machine": "<machine-uuid>",
  "operator": "<user-uuid>"
}
```

**Validation rules:**
- Cannot assign to a `CANCELLED` or `COMPLETED` work order (returns `400`).
- Machine must not be `OFFLINE`.
- Operator must be active (`is_active=True`).

**Response `201 Created`:**
```json
{
  "id": "...",
  "work_order": "<wo-uuid>",
  "machine": { "id": "...", "name": "CNC Mill 1", "type": "Milling", "status": "IDLE", "slug": "cnc-mill-1" },
  "operator": { "id": "...", "username": "operator1" },
  "assigned_at": "2026-03-08T10:30:00Z",
  "assigned_by": { "id": "...", "username": "supervisor1" }
}
```

---

### GET /api/workorders/{id}/assignments/

List all assignments for a work order.

**Auth required:** Yes (any authenticated user)

---

## 7. Production Execution

The execution API manages the lifecycle of production runs. All state transitions use database-level row locking (`SELECT FOR UPDATE`) to prevent race conditions.

### POST /api/executions/start/

Start a new production execution.

**Auth required:** Yes (any authenticated user)

**Request body:**
```json
{
  "work_order": "<work-order-uuid>",
  "machine": "<machine-uuid>",
  "operator": "<user-uuid>"
}
```

**Side effects:**
- Sets `WorkOrder.status` to `IN_PROGRESS`
- Sets `Machine.status` to `RUNNING`
- Creates a `WorkOrderExecution` record

**Validation rules:**
- Work order must be in `PENDING` or `PAUSED` status.
- Machine must not be `OFFLINE`.
- Operator must be active.

**Response `201 Created`:**
```json
{
  "id": "...",
  "work_order": "<wo-uuid>",
  "machine": { "id": "...", "name": "CNC Mill 1", "type": "Milling", "status": "RUNNING", "slug": "cnc-mill-1" },
  "operator": { "id": "...", "username": "operator1" },
  "status": "RUNNING",
  "started_at": "2026-03-08T11:00:00Z",
  "paused_at": null,
  "completed_at": null
}
```

---

### POST /api/executions/{id}/pause/

Pause a running execution.

**Auth required:** Yes (any authenticated user)

**Validation:** Execution must be in `RUNNING` status.

**Side effects:**
- Sets execution status to `PAUSED`, records `paused_at`
- Sets `WorkOrder.status` to `PAUSED`

**Response `200 OK`:** Returns the updated execution object.

---

### POST /api/executions/{id}/resume/

Resume a paused execution.

**Auth required:** Yes (any authenticated user)

**Validation:** Execution must be in `PAUSED` status.

**Side effects:**
- Sets execution status to `RUNNING`, clears `paused_at`
- Sets `WorkOrder.status` to `IN_PROGRESS`

**Response `200 OK`:** Returns the updated execution object.

---

### POST /api/executions/{id}/stop/

Stop (complete) an execution.

**Auth required:** Yes (any authenticated user)

**Validation:** Execution must not already be `COMPLETED`.

**Side effects:**
- Sets execution status to `COMPLETED`, records `completed_at`, clears `paused_at`
- Sets `WorkOrder.status` to `COMPLETED`
- Sets `Machine.status` to `IDLE` **only if** no other active (RUNNING/PAUSED) executions exist on the same machine

**Response `200 OK`:** Returns the updated execution object.

---

### State Machine Diagram

```
                    ┌──────────┐
                    │ PENDING  │  (WorkOrder initial status)
                    └────┬─────┘
                         │ start
                         v
    ┌──────────┐    ┌──────────┐
    │  PAUSED  │<───│ RUNNING  │
    └────┬─────┘    └────┬─────┘
         │ resume        │ stop
         │    ┌──────────┘
         v    v
    ┌──────────┐
    │COMPLETED │
    └──────────┘
```

---

## 8. Quality & Defect Tracking

### GET /api/defect-codes/

List all defect codes.

**Auth required:** Yes (any authenticated user)

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "code": "CRACK-001",
    "description": "Surface crack detected",
    "category": "Surface"
  }
]
```

---

### POST /api/defect-codes/

Create a new defect code.

**Auth required:** Admin (`is_staff`)

**Request body:**
```json
{
  "code": "CRACK-001",
  "description": "Surface crack detected",
  "category": "Surface"
}
```

---

### POST /api/quality/production-log/

Log good and scrap quantities for an active execution.

**Auth required:** Yes (any authenticated user)

**Request body:**
```json
{
  "execution": "<execution-uuid>",
  "good_qty": 95,
  "scrap_qty": 5
}
```

**Response `201 Created`:**
```json
{
  "id": "...",
  "execution": "<execution-uuid>",
  "recorded_by": { "id": "...", "username": "operator1" },
  "good_qty": 95,
  "scrap_qty": 5,
  "recorded_at": "2026-03-08T14:00:00Z"
}
```

---

### POST /api/quality/scrap-log/

Log scrap with a defect code. Automatically captures an anomaly snapshot of the last 5 minutes of machine telemetry data.

**Auth required:** Yes (any authenticated user)

**Request body:**
```json
{
  "production_log": "<production-log-uuid>",
  "defect_code": "<defect-code-uuid>",
  "qty": 3
}
```

**Side effects:**
- Queries `TelemetryPacket` for the machine over the last 5 minutes (up to 300 packets)
- If telemetry exists, creates an `AnomalySnapshot` with the telemetry window stored as JSON
- Links the `AnomalySnapshot` to the `ScrapLog`

**Response `201 Created`:**
```json
{
  "id": "...",
  "production_log": "<production-log-uuid>",
  "defect_code": {
    "id": "...",
    "code": "CRACK-001",
    "description": "Surface crack detected",
    "category": "Surface"
  },
  "qty": 3,
  "anomaly_snapshot": "<snapshot-uuid-or-null>"
}
```

---

## 9. Live Telemetry

### GET /api/live/overview/

Get all machines with their current status and most recent telemetry packet.

**Auth required:** Yes (any authenticated user)

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "name": "CNC Mill 1",
    "type": "Milling",
    "status": "RUNNING",
    "slug": "cnc-mill-1",
    "latest_telemetry": {
      "id": 42,
      "machine": "<machine-uuid>",
      "execution": "<execution-uuid>",
      "timestamp": "2026-03-08T14:30:00Z",
      "spindle_speed": 1200.5,
      "feed_rate": 450.2,
      "temperature": 55.3,
      "vibration": 0.08
    }
  },
  {
    "id": "...",
    "name": "Assembly Line 1",
    "type": "Assembly",
    "status": "IDLE",
    "slug": "assembly-line-1",
    "latest_telemetry": null
  }
]
```

---

### GET /api/live/telemetry/{machine_id}/

Get recent telemetry packets for a specific machine.

**Auth required:** Yes (any authenticated user)

**Path parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `machine_id` | UUID | Machine ID |

**Query parameters:**
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `limit` | int | 100 | 1-500 | Number of packets to return |

**Response `200 OK`:**
```json
[
  {
    "id": 42,
    "machine": "<machine-uuid>",
    "execution": "<execution-uuid>",
    "timestamp": "2026-03-08T14:30:00Z",
    "spindle_speed": 1200.5,
    "feed_rate": 450.2,
    "temperature": 55.3,
    "vibration": 0.08
  }
]
```

**Response `404`:** Machine not found.

---

### GET /api/live/events/

Get recent machine events (heartbeat loss, status changes, etc.).

**Auth required:** Yes (any authenticated user)

**Query parameters:**
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `limit` | int | 50 | 1-200 | Number of events to return |
| `machine` | UUID | -- | -- | Filter by machine ID |

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "machine": "<machine-uuid>",
    "event_type": "HEARTBEAT_LOST",
    "timestamp": "2026-03-08T14:25:00Z",
    "details": {
      "last_packet_at": "2026-03-08T14:24:57Z"
    }
  }
]
```

**Event types:** `HEARTBEAT_LOST`, `HEARTBEAT_RESTORED`, `STATUS_CHANGE`

---

## 10. Data Export

Export endpoints support both JWT and API Key authentication.

### POST /api/export/jobs/

Create a new data export job.

**Auth required:** JWT Bearer token or `X-API-Key` header

**Request body:**
```json
{
  "format": "CSV",
  "date_from": "2026-03-01T00:00:00Z",
  "date_to": "2026-03-08T23:59:59Z"
}
```

**Validation rules:**
- `date_from` must be before `date_to`
- Date range must not exceed 90 days
- Valid formats: `CSV`, `JSON`, `PARQUET`

**Response `202 Accepted`:**
```json
{
  "id": "...",
  "requested_by": { "id": "...", "username": "analyst1" },
  "status": "QUEUED",
  "format": "CSV",
  "date_from": "2026-03-01T00:00:00Z",
  "date_to": "2026-03-08T23:59:59Z",
  "error_message": null,
  "created_at": "2026-03-08T15:00:00Z",
  "completed_at": null
}
```

---

### GET /api/export/jobs/{id}/

Poll export job status.

**Auth required:** JWT Bearer token or `X-API-Key` header

**Note:** Users can only see their own export jobs (ownership-scoped).

**Response `200 OK`:** Returns the export job object (same structure as above, status may be `QUEUED`, `PROCESSING`, `COMPLETED`, or `FAILED`).

---

### GET /api/export/jobs/{id}/download/

Download the exported file.

**Auth required:** JWT Bearer token or `X-API-Key` header

**Response `200 OK`:** File stream with appropriate content type:
- CSV: `text/csv`
- JSON: `application/json`

**Response `404`:** Export not completed, no file available, or file not found on disk.

---

### Processing Export Jobs

Export jobs are processed via management command (Celery integration planned for future):

```bash
docker-compose run --entrypoint "" web python manage.py process_export_jobs
```

The command aggregates data from four sources within the requested date range:
- `TelemetryPacket` -- sensor data
- `WorkOrderExecution` -- production runs
- `ProductionLog` -- good/scrap quantities
- `ScrapLog` -- defect-linked scrap entries

Output is written to the `exports/` directory as CSV or JSON.

**Note:** PARQUET format is accepted but not yet implemented; jobs requesting PARQUET are marked `FAILED`.

---

### API Key Authentication

For machine-to-machine access to the export API:

1. Create an `ApiClient` record with a SHA-256 hash of the raw API key:
   ```python
   import hashlib
   ApiClient.objects.create(
       name="analytics-pipeline",
       api_key_hash=hashlib.sha256(b"your-raw-api-key").hexdigest(),
       is_active=True,
   )
   ```

2. Include the raw key in requests:
   ```
   X-API-Key: your-raw-api-key
   ```

---

## 11. System Configuration

Admin-only key-value configuration store.

### GET /api/config/

List all configuration entries.

**Auth required:** Admin (`is_staff`)

**Response `200 OK`:**
```json
[
  {
    "id": "...",
    "key": "heartbeat_timeout",
    "value": "30",
    "data_type": "integer",
    "description": "Seconds before a machine is considered offline",
    "updated_at": "2026-03-08T10:00:00Z",
    "updated_by": { "id": "...", "username": "admin" }
  }
]
```

---

### POST /api/config/

Create a configuration entry.

**Auth required:** Admin (`is_staff`)

**Request body:**
```json
{
  "key": "max_export_rows",
  "value": "10000",
  "data_type": "integer",
  "description": "Maximum rows per export job"
}
```

**Response `201 Created`:** Returns the full config object.

**Side effect:** Creates an `AuditLog` entry with action `CREATE_SYSTEM_CONFIG`.

---

### PATCH /api/config/{id}/

Update a configuration entry.

**Auth required:** Admin (`is_staff`)

**Request body (all fields optional):**
```json
{
  "value": "20000",
  "description": "Updated maximum"
}
```

**Response `200 OK`:** Returns the updated config object.

**Side effect:** Creates an `AuditLog` entry with action `UPDATE_SYSTEM_CONFIG` including before/after snapshots.

---

## 12. Operations

Manufacturing operations (e.g. "Drilling", "Heat Treat", "Assembly").

### GET /api/operations/

List all operations.

**Auth required:** Yes (any authenticated user)

**Response `200 OK`:**
```json
[
  {
    "id": 1,
    "name": "Drilling",
    "description": "Drill holes in workpiece"
  }
]
```

---

### POST /api/operations/

Create a new operation.

**Auth required:** Admin (`is_staff`)

**Request body:**
```json
{
  "name": "Heat Treat",
  "description": "Apply heat treatment to harden material"
}
```

---

### PUT /api/operations/{id}/

Fully update an operation.

**Auth required:** Admin (`is_staff`)

**Request body:**
```json
{
  "name": "Heat Treat v2",
  "description": "Updated heat treatment process"
}
```

---

### DELETE /api/operations/{id}/

Delete an operation.

**Auth required:** Admin (`is_staff`)

**Response `204 No Content`**

---

## 13. Error Handling

All error responses follow a consistent format:

### 400 Bad Request
```json
{
  "detail": "Cannot assign to a COMPLETED work order."
}
```
Or for field-level validation errors:
```json
{
  "date_to": ["date_to must be after date_from."]
}
```

### 401 Unauthorized
```json
{
  "detail": "Authentication credentials were not provided."
}
```

### 403 Forbidden
```json
{
  "detail": "You do not have permission to perform this action."
}
```

### 404 Not Found
```json
{
  "detail": "Not found."
}
```

---

## 14. Authentication Details

### JWT Token Configuration

| Setting | Value |
|---------|-------|
| Access token lifetime | 15 minutes |
| Refresh token lifetime | 24 hours |
| Token type | Bearer |
| Header | `Authorization: Bearer <token>` |
| Blacklisting | Enabled (on logout) |

### Permission Codes

The following permission codes are used by the RBAC system. Staff users (`is_staff=True`) bypass all permission checks automatically.

| Code | Module | Used By |
|------|--------|---------|
| `system.admin` | System | Admin-level operations |
| `users.manage` | Users | User CRUD |
| `workorders.create` | WorkOrders | Create/update work orders, assign |
| `workorders.manage` | WorkOrders | Supervisor-level WO management |
| `machines.manage` | Machines | Create/update machines |
| `parts.manage` | Parts | Create/update parts |
| `quality.entry` | Quality | Log production/scrap data |

### Audit Logging

All write operations (create, update, delete) across the system are recorded in the `AuditLog` with:
- Actor (user who performed the action)
- Action type (e.g. `CREATE_WORKORDER`, `STOP_EXECUTION`)
- Entity type and ID
- Before/after JSON snapshots
- Client IP address and user agent
- Timestamp

Audit log entries are immutable and created on a best-effort basis (failures are logged but never block the parent operation).
