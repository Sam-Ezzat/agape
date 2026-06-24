# 🎯 Phase 3 Implementation Plan: Attendee & Assignment Management

**Start Date:** June 24, 2026  
**Branch:** dev  
**Dependencies:** Phase 2 (Core API) complete ✅

---

## 📋 Overview

Phase 3 adds the **people management layer** to the conference system, enabling:
- Full attendee lifecycle (registration → check-in → assignment → check-out)
- Smart room assignments with capacity tracking
- Excel import/export for bulk operations
- Complete audit trail
- Dashboard APIs for real-time monitoring

---

## 🎯 Core Objectives

### 1. **Attendee Management API** 🙋
Complete CRUD operations plus lifecycle management

**Endpoints:**
```
POST   /api/attendees                    - Create attendee
GET    /api/attendees                    - List attendees (paginated, searchable, filterable)
GET    /api/attendees/:id                - Get single attendee
GET    /api/attendees/:id/details        - Get attendee with assignment & room details
PATCH  /api/attendees/:id                - Update attendee
DELETE /api/attendees/:id                - Soft delete attendee
POST   /api/attendees/:id/check-in       - Check in attendee
POST   /api/attendees/:id/check-out      - Check out attendee
GET    /api/attendees/stats              - Get attendee statistics
```

**Features:**
- ✅ Full-text search by name (supports Arabic)
- ✅ Filter by role, gender, checked-in status
- ✅ Pagination with page/limit
- ✅ Check-in/check-out tracking
- ✅ Soft delete (preserves data for audit)
- ✅ Special needs tracking in notes field

**Business Rules:**
- Cannot delete attendee with active room assignment
- Check-in requires room assignment
- Check-out unassigns from room automatically
- Full name is required

---

### 2. **Room Assignment API** 🛏️
Smart assignment with capacity validation

**Endpoints:**
```
POST   /api/assignments                  - Assign attendee to room
DELETE /api/assignments/:id              - Unassign attendee from room
GET    /api/assignments                  - List all assignments (filtered by room/building/floor)
GET    /api/assignments/:id              - Get single assignment
PATCH  /api/assignments/:id              - Update assignment (move to different room)
POST   /api/assignments/batch            - Batch assign multiple attendees
GET    /api/assignments/availability     - Get available rooms with capacity info
```

**Features:**
- ✅ Capacity validation (prevents overbooking)
- ✅ One attendee = one room (enforced by DB unique constraint)
- ✅ Batch assignment for efficiency
- ✅ Room availability filtering
- ✅ Assignment history via audit logs
- ✅ Real-time Socket.io notifications

**Business Rules:**
- Cannot assign attendee already assigned to another room
- Cannot exceed room capacity
- Assignment creates audit log entry
- Unassignment triggers notification
- Batch assign validates all before committing

---

### 3. **Excel Import/Export** 📊
Bulk data operations for admins

**Endpoints:**
```
POST   /api/attendees/import             - Import attendees from Excel file
GET    /api/attendees/export             - Export attendees to Excel
POST   /api/assignments/import           - Import assignments from Excel
GET    /api/assignments/export           - Export assignments with room details
GET    /api/reports/full-export          - Export complete system state
```

**Import Format (Attendees):**
```
| Full Name | Phone      | Email            | Age | Gender | Church/Org | Role    | Notes |
|-----------|------------|------------------|-----|--------|------------|---------|-------|
| John Doe  | 1234567890 | john@example.com | 30  | MALE   | ABC Church | PASTOR  |       |
```

**Import Format (Assignments):**
```
| Attendee Name | Building | Floor | Room Number |
|---------------|----------|-------|-------------|
| John Doe      | Main     | 1     | 101         |
```

**Export Features:**
- ✅ Attendees with assignment info
- ✅ Room occupancy report
- ✅ Check-in status report
- ✅ Available rooms list
- ✅ Complete audit trail

**Technology:**
- Library: `xlsx` (SheetJS)
- Validation: Same Zod schemas as API
- Error handling: Detailed validation errors per row

---

### 4. **Audit Log API** 📝
Complete action history tracking

**Endpoints:**
```
GET    /api/audit-logs                   - List audit logs (filtered, paginated)
GET    /api/audit-logs/entity/:type/:id  - Get logs for specific entity
GET    /api/audit-logs/stats             - Get audit statistics
```

**Features:**
- ✅ Filter by action type (assign, unassign, check_in, check_out)
- ✅ Filter by entity type and ID
- ✅ Date range filtering
- ✅ Pagination
- ✅ Automatic log creation on all operations

**Audit Log Data:**
```json
{
  "id": "uuid",
  "action": "assign",
  "entityType": "room_assignment",
  "entityId": "assignment-id",
  "details": {
    "attendeeName": "John Doe",
    "roomNumber": "101",
    "building": "Main Building"
  },
  "performedBy": null,
  "createdAt": "2026-06-24T20:00:00Z"
}
```

---

### 5. **Dashboard APIs** 📊
Real-time monitoring and statistics

**Endpoints:**
```
GET    /api/dashboard/stats              - Overall system statistics
GET    /api/dashboard/occupancy          - Room occupancy by building/floor
GET    /api/dashboard/recent-activity    - Recent check-ins, assignments
```

**Stats Response:**
```json
{
  "totalRooms": 40,
  "occupiedRooms": 15,
  "availableRooms": 25,
  "totalAttendees": 50,
  "checkedIn": 15,
  "notCheckedIn": 35,
  "occupancyRate": 37.5,
  "byRole": {
    "PASTOR": 5,
    "ATTENDEE": 40,
    "LEADER": 3,
    "STAFF": 2
  }
}
```

---

## 🏗️ Implementation Order

### Step 1: Attendee Management (Priority: HIGH)
1. ✅ Create Zod validation schemas (attendee.schemas.ts)
2. ✅ Implement AttendeeRepository with search
3. ✅ Implement AttendeeService with lifecycle methods
4. ✅ Implement AttendeeController
5. ✅ Create attendee routes
6. ✅ Test all endpoints

### Step 2: Room Assignment (Priority: HIGH)
1. ✅ Create Zod validation schemas (assignment.schemas.ts)
2. ✅ Implement RoomAssignmentRepository
3. ✅ Implement AssignmentService with capacity validation
4. ✅ Implement AssignmentController
5. ✅ Create assignment routes
6. ✅ Test assignment flow

### Step 3: Audit Logging (Priority: MEDIUM)
1. ✅ Create AuditLogRepository
2. ✅ Create AuditLogService
3. ✅ Integrate audit logging into all services
4. ✅ Create audit log routes
5. ✅ Test audit trail

### Step 4: Excel Import/Export (Priority: MEDIUM)
1. ⬜ Install xlsx dependency
2. ⬜ Create Excel service (parse/generate)
3. ⬜ Add import/export endpoints
4. ⬜ Test with sample Excel files

### Step 5: Dashboard APIs (Priority: LOW)
1. ⬜ Create DashboardService
2. ⬜ Implement stats aggregation
3. ⬜ Create dashboard routes
4. ⬜ Test with real data

---

## 📦 New Dependencies

```json
{
  "xlsx": "^0.18.5"         // Excel import/export
}
```

---

## 🎯 Success Criteria

### Functional Requirements
- ✅ Can create, read, update, delete attendees
- ✅ Can check in/check out attendees
- ✅ Can assign attendees to rooms with capacity validation
- ✅ Can unassign attendees
- ✅ Can batch assign multiple attendees
- ✅ Can import attendees from Excel
- ✅ Can export assignments to Excel
- ✅ All operations create audit logs
- ✅ Real-time notifications for all events

### Technical Requirements
- ✅ All endpoints follow REST conventions
- ✅ Input validation with Zod
- ✅ Business rules enforced
- ✅ Error handling with AppError
- ✅ TypeScript types for all DTOs
- ✅ Repository pattern for data access
- ✅ Service layer for business logic
- ✅ Socket.io notifications

### Testing Requirements
- ✅ Manual testing of all endpoints
- ✅ Test with Arabic names
- ✅ Test capacity validation
- ✅ Test duplicate assignment prevention
- ✅ Test Excel import with various formats

---

## 🚀 API Usage Examples

### Create Attendee
```bash
curl -X POST http://localhost:3000/api/attendees \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "محمد أحمد",
    "phone": "01234567890",
    "email": "mohamed@example.com",
    "age": 25,
    "gender": "MALE",
    "churchOrg": "Cairo Church",
    "conferenceRole": "ATTENDEE",
    "notes": "Vegetarian diet"
  }'
```

### Assign to Room
```bash
curl -X POST http://localhost:3000/api/assignments \
  -H "Content-Type: application/json" \
  -d '{
    "attendeeId": "attendee-uuid",
    "roomId": "room-uuid"
  }'
```

### Check In
```bash
curl -X POST http://localhost:3000/api/attendees/{id}/check-in
```

### Search Attendees
```bash
curl "http://localhost:3000/api/attendees?search=محمد&role=ATTENDEE&page=1&limit=20"
```

---

## 📈 Phase 3 Timeline

**Estimated:** 1-2 days  
**Current Status:** Planning Complete  

**Milestones:**
- [ ] Day 1 Morning: Attendee Management API
- [ ] Day 1 Afternoon: Room Assignment API
- [ ] Day 1 Evening: Audit Logging
- [ ] Day 2 Morning: Excel Import/Export
- [ ] Day 2 Afternoon: Dashboard APIs & Testing

---

## 🎓 Architecture Notes

### Why Separate Assignment from Attendee?
- **Single Responsibility:** Attendee entity focuses on person data, Assignment handles room logic
- **Flexible History:** Can track assignment history (future: multiple assignments over time)
- **Clear Business Logic:** Assignment validation is separate from attendee validation

### Why Soft Delete for Attendees?
- **Data Integrity:** Preserves audit trail even if person leaves
- **Compliance:** Some regulations require data retention
- **Undo Capability:** Can restore accidentally deleted attendees

### Why Unique Constraint on attendeeId in RoomAssignment?
- **Database-Level Guarantee:** Prevents double-booking at DB level
- **Performance:** Index on unique field speeds up lookups
- **Data Integrity:** No application bug can violate one-person-one-room rule

---

## 📊 File Structure

```
backend/src/
├── validators/
│   ├── attendee.schemas.ts         (NEW)
│   └── assignment.schemas.ts       (NEW)
├── repositories/
│   ├── AttendeeRepository.ts       (NEW)
│   ├── RoomAssignmentRepository.ts (NEW)
│   └── AuditLogRepository.ts       (NEW)
├── services/
│   ├── attendee.service.ts         (NEW)
│   ├── assignment.service.ts       (NEW)
│   ├── auditLog.service.ts         (NEW)
│   ├── excel.service.ts            (NEW)
│   └── dashboard.service.ts        (NEW)
├── controllers/
│   ├── attendee.controller.ts      (NEW)
│   ├── assignment.controller.ts    (NEW)
│   ├── auditLog.controller.ts      (NEW)
│   └── dashboard.controller.ts     (NEW)
└── routes/
    ├── attendee.routes.ts          (NEW)
    ├── assignment.routes.ts        (NEW)
    ├── auditLog.routes.ts          (NEW)
    ├── dashboard.routes.ts         (NEW)
    └── index.ts                    (UPDATE)
```

**Total New Files:** ~17  
**Estimated Lines of Code:** ~2,500

---

**Let's build the people management system! 🚀**
