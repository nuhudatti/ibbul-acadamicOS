# HOD Module Implementation Guide

## Overview
Enterprise-grade HOD (Department Admin) module with full department-scoped result management, upload, approval, users, audit, and analytics.

## Status: IN PROGRESS

### ✅ Completed
1. Enhanced Result model with workflow states (DRAFT → SUBMITTED → FACULTY_REVIEW → HOD_REVIEW → APPROVED → LOCKED_PUBLISHED)
2. Added ResultVersion model for immutability
3. Added AuditForwardingLog model for webhook/email forwarding
4. Created migration `0008_enhance_hod_module.py`
5. Created HOD Dashboard frontend structure

### 🚧 In Progress
- Results table component with filters, search, bulk actions
- Enhanced upload component with validation and preview
- Users management page
- Audit forwarding system
- Analytics page

### 📋 Pending
- Seed script for HOD accounts
- OpenAPI spec
- Postman collection
- E2E tests
- Load testing

## Database Schema Changes

### Result Model Enhancements
- `status`: Extended to include DRAFT, SUBMITTED, FACULTY_REVIEW, HOD_REVIEW, APPROVED, LOCKED_PUBLISHED, REJECTED, RETURNED
- `upload_batch`: FK to ResultUploadBatch
- `department`: FK to Department (scope)
- `checksum`: SHA256 checksum for tamper detection
- `locked_at`: Timestamp when locked
- `locked_by`: User who locked
- `rejection_reason`: Text field for rejection
- `faculty_reviewer_remark`: Text field for faculty review

### New Models
- `ResultVersion`: Immutable version history
- `AuditForwardingLog`: Tracks webhook/email forwarding

## Next Steps

1. **Backend APIs** (`apps/academics/views_hod.py`):
   - GET `/api/hod/results/` - List department results with filters
   - POST `/api/hod/results/{id}/approve/` - Approve result
   - POST `/api/hod/results/{id}/reject/` - Reject result
   - POST `/api/hod/results/bulk-approve/` - Bulk approve
   - POST `/api/hod/results/bulk-reject/` - Bulk reject
   - GET `/api/hod/results/{id}/versions/` - Get version history
   - POST `/api/hod/upload/validate/` - Validate upload
   - POST `/api/hod/upload/preview/` - Preview upload
   - POST `/api/hod/upload/submit/` - Submit upload
   - GET `/api/hod/users/` - List department users
   - POST `/api/hod/users/` - Create department user
   - GET `/api/hod/audit/` - Department audit logs
   - GET `/api/hod/analytics/` - Analytics data

2. **Frontend Components**:
   - `HODResultsTable.tsx` - Full results table with filters
   - `HODUploadEnhanced.tsx` - Enhanced upload with validation
   - `HODUsersManagement.tsx` - User management
   - `HODAnalytics.tsx` - Charts and exports

3. **Audit Forwarding** (`apps/accounts/audit_forwarding.py`):
   - Webhook forwarding with retry
   - Email notifications
   - Daily digest generation

4. **Seed Script** (`apps/academics/management/commands/seed_hod.py`):
   - Create departments from CSV/JSON
   - Create HOD accounts
   - Send onboarding emails

## Workflow States

```
DRAFT → SUBMITTED → [FACULTY_REVIEW] → HOD_REVIEW → APPROVED → LOCKED_PUBLISHED
                                                          ↓
                                                    REJECTED / RETURNED
```

- **DRAFT**: Initial upload, can be edited
- **SUBMITTED**: Submitted for review, cannot edit
- **FACULTY_REVIEW**: Optional faculty review stage
- **HOD_REVIEW**: Awaiting HOD approval
- **APPROVED**: Approved by HOD
- **LOCKED_PUBLISHED**: Immutable, published
- **REJECTED**: Rejected with reason
- **RETURNED**: Returned for revision

## Security & Integrity

- SHA256 checksums on all results
- Immutable versions after lock
- Emergency unlock requires SuperAdmin + reason + audit log
- Rate limiting on upload/approval endpoints
- Department scope enforcement at API level

## Audit Forwarding

- Real-time webhook POST to SuperAdmin endpoint
- Email notifications for critical events
- Daily digest CSV attachment
- Retry with exponential backoff
- Dead-letter queue for failed forwards

## Testing Requirements

- Unit tests for state transitions
- Integration tests for RBAC
- E2E tests for upload→approve→lock flow
- Load test for 50k row upload
- Security tests (OWASP Top 10)
