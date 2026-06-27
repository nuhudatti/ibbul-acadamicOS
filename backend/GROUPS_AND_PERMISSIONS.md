# 🔐 Django Groups & Permissions Implementation

## Overview

This system uses **Django's built-in Groups and Permissions** for authorization. Users are automatically assigned to groups based on their role, and permissions control what actions they can perform.

---

## 🎯 How It Works

### 1. **Groups** (Job Titles)
Groups are collections of permissions. Each user role maps to a group:

| Role | Group Name | Description |
|------|------------|-------------|
| `STUDENT` | Student | View-only access to own results |
| `EXAMINER` | Examiner | Upload and manage results |
| `HOD` | HOD | Approve results, full management |
| Admin | Admin | Full system access |

### 2. **Permissions** (Actions)
Permissions define what actions users can perform:

| Permission | Codename | Who Has It? |
|------------|----------|-------------|
| View own results | `view_own_result` | Student |
| View all results | `view_all_results` | Examiner, HOD, Admin |
| Upload results | `upload_result` | Examiner, HOD, Admin |
| Approve results | `approve_result` | HOD, Admin |
| Delete results | `delete_result` | HOD, Admin |

### 3. **Auto-Assignment**
When a user is created or their role changes, they are **automatically assigned** to the appropriate group via Django signals.

---

## 📋 Setup Instructions

### Step 1: Run Migrations
First, create the database tables:

```bash
cd "C:\Users\HP\Documents\IBBUL Result Checker\backend"
python manage.py makemigrations
python manage.py migrate
```

### Step 2: Create Groups and Assign Permissions
Run the management command to set up all groups:

```bash
python manage.py setup_groups
```

**Output:**
```
Setting up Groups and Permissions...
============================================================
[CREATED] Student group
  Assigned 3 permissions to Student group
    - view_own_result
    - view_course
    - view_gpa
[CREATED] Examiner group
  Assigned 8 permissions to Examiner group
    - upload_result
    - add_result
    - view_all_results
    - view_result
    - change_result
    - view_course
    - calculate_gpa
    - view_gpa
[CREATED] HOD group
  Assigned 13 permissions to HOD group
    - upload_result
    - add_result
    - view_all_results
    - view_result
    - change_result
    - approve_result
    - delete_result
    - view_course
    - add_course
    - change_course
    - calculate_gpa
    - view_gpa
    - change_gpa
[CREATED] Admin group
  Assigned 20 permissions (FULL ACCESS) to Admin group
============================================================
[SUCCESS] All groups and permissions configured!
```

### Step 3: Restart Server
```bash
python manage.py runserver
```

---

## 🚀 Usage Examples

### 1. **Check User Permissions**
```bash
GET http://127.0.0.1:8000/api/academics/check-permissions/
Authorization: Bearer <your_jwt_token>
```

**Response:**
```json
{
  "user": {
    "email": "student@example.com",
    "student_id": "U22/FNS/CSC/0001",
    "role": "STUDENT",
    "groups": ["Student"]
  },
  "permissions": {
    "academics.view_course": true,
    "academics.add_result": false,
    "academics.view_result": true,
    "academics.upload_result": false,
    "academics.approve_result": false,
    "academics.view_all_results": false,
    "academics.view_own_result": true
  }
}
```

### 2. **Student: View Own Results**
```bash
GET http://127.0.0.1:8000/api/academics/results/my_results/
Authorization: Bearer <student_jwt_token>
```

✅ **Allowed**: Students can view their own results  
❌ **Forbidden**: Students cannot view other students' results

### 3. **Examiner: Upload Results**
```bash
POST http://127.0.0.1:8000/api/academics/results/upload_results/
Authorization: Bearer <examiner_jwt_token>
Content-Type: application/json

{
  "student": 1,
  "course": 1,
  "score": 85.5,
  "session": "2023/2024",
  "semester": "FIRST"
}
```

✅ **Allowed**: Examiners can upload results  
❌ **Forbidden**: Students cannot upload results

### 4. **HOD: Approve Results**
```bash
POST http://127.0.0.1:8000/api/academics/results/1/approve/
Authorization: Bearer <hod_jwt_token>
Content-Type: application/json

{
  "status": "APPROVED"
}
```

✅ **Allowed**: Only HOD can approve results  
❌ **Forbidden**: Examiners and Students cannot approve

---

## 🔒 Permission Classes

### Built-in Django Permissions
```python
from rest_framework.permissions import IsAuthenticated

class MyView(APIView):
    permission_classes = [IsAuthenticated]
```

### Custom Permission Classes

#### 1. **Role-Based Permissions**
```python
from apps.academics.permissions import IsStudent, IsExaminer, IsHOD

class StudentOnlyView(APIView):
    permission_classes = [IsAuthenticated, IsStudent]
```

#### 2. **Action-Based Permissions**
```python
from apps.academics.permissions import CanUploadResult, CanApproveResult

class ResultUploadView(APIView):
    permission_classes = [IsAuthenticated, CanUploadResult]
```

#### 3. **Object-Level Permissions**
```python
from apps.academics.permissions import IsOwnerOrStaff

class ResultViewSet(ModelViewSet):
    permission_classes = [IsAuthenticated, IsOwnerOrStaff]
```

---

## 📊 Models with Custom Permissions

### Result Model
```python
class Result(models.Model):
    # ... fields ...
    
    class Meta:
        permissions = [
            ('upload_result', 'Can upload student results'),
            ('approve_result', 'Can approve results (HOD only)'),
            ('view_all_results', 'Can view all students results'),
            ('view_own_result', 'Can view own results (Student)'),
        ]
```

### Checking Permissions in Code
```python
# Check if user has permission
if request.user.has_perm('academics.upload_result'):
    # User can upload results
    pass

# Check multiple permissions
if request.user.has_perms(['academics.upload_result', 'academics.approve_result']):
    # User is likely HOD
    pass

# Check if user is in group
if request.user.groups.filter(name='HOD').exists():
    # User is HOD
    pass
```

---

## 🛡️ Protected Views Example

### ViewSet with Dynamic Permissions
```python
class ResultViewSet(viewsets.ModelViewSet):
    def get_permissions(self):
        if self.action == 'list':
            permission_classes = [IsAuthenticated]
        elif self.action == 'upload_results':
            permission_classes = [IsAuthenticated, CanUploadResult]
        elif self.action == 'approve':
            permission_classes = [IsAuthenticated, CanApproveResult]
        else:
            permission_classes = [IsAuthenticated]
        
        return [permission() for permission in permission_classes]
```

---

## 🔄 Auto-Assignment Flow

1. **User Created/Updated** → Triggers signal
2. **Signal checks user role** → Maps to group
3. **User added to group** → Inherits all group permissions
4. **Views check permissions** → Allow/Deny access

```
User.role = EXAMINER
    ↓
Signal: assign_user_to_group()
    ↓
User.groups.add('Examiner')
    ↓
User inherits: upload_result, view_all_results, etc.
    ↓
View checks: has_perm('academics.upload_result')
    ↓
✅ Access Granted
```

---

## 🧪 Testing Permissions

### Test in Django Admin
1. Login as superuser
2. Go to **Groups** in admin
3. View assigned permissions for each group
4. Create test users and assign them to groups
5. Login as test users and verify access

### Test via API
```bash
# 1. Login as student
POST /api/accounts/login/
{
  "username": "U22/FNS/CSC/0001",
  "password": "password"
}

# 2. Try to upload result (should fail)
POST /api/academics/results/upload_results/
Authorization: Bearer <student_token>
# Response: 403 Forbidden

# 3. Login as examiner
POST /api/accounts/login/
{
  "username": "examiner@ibbul.edu.ng",
  "password": "password"
}

# 4. Upload result (should succeed)
POST /api/academics/results/upload_results/
Authorization: Bearer <examiner_token>
# Response: 201 Created
```

---

## 📚 API Endpoints Summary

| Endpoint | Method | Permission | Who Can Access? |
|----------|--------|------------|-----------------|
| `/api/academics/courses/` | GET | Authenticated | Everyone |
| `/api/academics/results/` | GET | Authenticated | Everyone (filtered) |
| `/api/academics/results/my_results/` | GET | Authenticated | Students only |
| `/api/academics/results/upload_results/` | POST | `upload_result` | Examiner, HOD |
| `/api/academics/results/{id}/approve/` | POST | `approve_result` | HOD only |
| `/api/academics/gpa/my_gpa/` | GET | Authenticated | Students only |
| `/api/academics/check-permissions/` | GET | Authenticated | Everyone |

---

## 🎓 Best Practices

1. **Always use Django permissions** - Don't hardcode role checks
2. **Keep permissions granular** - One permission = One action
3. **Use signals for auto-assignment** - Don't manually assign groups
4. **Test permissions thoroughly** - Try accessing as different roles
5. **Document custom permissions** - Explain what each permission allows

---

## 🔧 Troubleshooting

### Issue: User doesn't have expected permissions

**Solution:**
```bash
# Re-run setup_groups to ensure all permissions are assigned
python manage.py setup_groups

# Check user's groups
python manage.py shell
>>> from apps.accounts.models import User
>>> user = User.objects.get(email='user@example.com')
>>> user.groups.all()
>>> user.get_all_permissions()
```

### Issue: Permission check fails

**Check:**
1. Has `setup_groups` been run?
2. Is user assigned to correct group?
3. Does group have the required permission?
4. Is signal properly registered in `apps.py`?

---

## ✅ Summary

- ✓ Groups created automatically
- ✓ Permissions assigned to groups
- ✓ Users auto-assigned based on role
- ✓ Views protected with permission classes
- ✓ Object-level permissions for fine-grained control
- ✓ Production-ready and maintainable

**This is a complete, production-grade implementation of Django Groups & Permissions!** 🚀
