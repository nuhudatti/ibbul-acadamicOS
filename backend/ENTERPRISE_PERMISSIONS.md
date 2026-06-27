# Enterprise Permissions & Users/Accounts Module

**Single source of truth for role-based permissions and scoped user management.**

---

## Permission matrix (explicit, non-overlapping)

| Role | Scope | Result upload | Result approve | User view/add/change (scoped) | Bulk import users |
|------|--------|----------------|----------------|--------------------------------|-------------------|
| **Student** | Own only | No | No | No | No |
| **Examiner** | Assigned courses | Yes | No | No | No |
| **Department Admin (HOD)** | Department | Yes | Yes | Yes (department only) | Yes (department only) |
| **Faculty Admin (Dean)** | Faculty | Yes | Yes | Yes (faculty only) | Yes (faculty only) |
| **Super Admin** | Global | Yes | Yes | Yes (all) | Yes (all) |

- **HOD actions are strictly department-scoped**: list/create/edit/deactivate users, bulk import, results, courses, audit — all filtered by `department_fk_id`.
- **Faculty Admin** is faculty-scoped; **Super Admin** has no scope restriction.
- **Examiner** cannot approve results; cannot manage users.

---

## Django groups (run `python manage.py setup_groups`)

| Group | Roles mapped | Permissions |
|-------|----------------|-------------|
| Student | STUDENT | view_own_result, view_course, view_gpa |
| Examiner | EXAMINER | upload_result, add/view/change_result, view_all_results, view_course, calculate_gpa, view_gpa |
| HOD | DEPARTMENT_ADMIN, HOD (legacy) | All Examiner + approve_result, delete_result, add/change_course, change_gpa, **accounts**: view/add/change_user_scoped, bulk_import_users |
| Faculty Admin | FACULTY_ADMIN | Same as HOD (scope enforced in views by faculty_id) |
| Admin | SUPER_ADMIN | Full access (result, course, gpa, **accounts** user permissions) |

---

## Accounts (User) custom permissions

On `accounts.User` model:

- `view_user_scoped` — Can view users within scope
- `add_user_scoped` — Can add users within scope  
- `change_user_scoped` — Can change users within scope
- `bulk_import_users` — Can bulk import users (CSV/Excel)

Used by: HOD, Faculty Admin, Super Admin. Scope is enforced in:

- Django admin `get_queryset` / `has_change_permission` / `has_delete_permission`
- HOD API `get_queryset()` and every action (create, update, deactivate, assign_courses, login_history, export_csv)
- Bulk import: `import_users_view` (permission check) and `_create_user_from_row(..., scope_department_fk=..., scope_is_hod=...)`

---

## Bulk user import (university workflow)

1. **Permission**: Only users with `accounts.bulk_import_users` can open Import users and download the template.
2. **HOD**: Can only create **STUDENT** and **EXAMINER**. All created users are assigned to HOD's department (`scope_department_fk`). Roles SUPER_ADMIN, FACULTY_ADMIN, DEPARTMENT_ADMIN in the file are rejected with a clear error.
3. **Faculty Admin**: Can create STUDENT, EXAMINER, DEPARTMENT_ADMIN within faculty; cannot create SUPER_ADMIN.
4. **Super Admin**: Can create any role; no scope override.
5. **Template**: Admin → Import users → “Download CSV template”. Columns: `reg_number`, `first_name`, `last_name`, `role`, `email`, `faculty_code`, `department_code`.
6. **Audit**: Every import is logged (`ADMIN_USER_IMPORT`) with created/error counts and file name.

---

## Code references

- **Constants & helpers**: `common/permissions/enterprise_permissions.py` — permission codenames, role→permissions sets, `user_has_permission()`, `user_can_bulk_import_users()`, etc.
- **DRF permission classes**: `apps/academics/permissions.py` — `CanApproveResult`, `CanBulkImportUsers`, `ScopePermission`, role-based classes.
- **Scope**: `apps/accounts/scope.py` — `build_scope()`, `filter_by_scope()`, `get_hod_department_id()`, `ScopeMiddleware`.
- **Groups setup**: `apps/academics/management/commands/setup_groups.py` — creates Student, Examiner, HOD, Faculty Admin, Admin and assigns permissions (including accounts).
- **Signals**: `apps/accounts/signals.py` — role → group mapping (FACULTY_ADMIN → “Faculty Admin”).
- **Bulk import**: `apps/accounts/admin_views.py` — `import_users_view`, `_create_user_from_row(..., scope_department_fk, scope_faculty, scope_is_hod, scope_is_super_admin)`, `import_users_template_download`.

---

## Applying changes

1. **Migrations**: `python manage.py migrate` (ensures `accounts.User` has custom permissions).
2. **Groups**: `python manage.py setup_groups` (creates/updates groups and assigns permissions, including Faculty Admin and accounts permissions).
3. **Existing users**: Signals assign users to groups on save; re-saving users or re-running role assignment refreshes group membership.

This keeps the system consistent, auditable, and ready to extend (e.g. new roles or permissions) without overlapping or ad-hoc checks.
