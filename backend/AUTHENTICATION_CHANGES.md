# 🔐 Authentication System Changes

## ✅ What Changed?

### **Before:**
- ❌ All users (including admins) used Student ID format
- ❌ Superuser had to use `U22/FNS/CSC/0001`
- ❌ No flexibility for admin accounts

### **After:**
- ✅ **Students**: Login with Student ID (`U22/FNS/CSC/XXXX`)
- ✅ **Admins/HOD/Examiners**: Login with Email (no student_id needed)
- ✅ Superuser credentials are customizable

---

## 🎯 How It Works Now

### **For Students:**
- **Registration**: Requires both `email` AND `student_id`
- **Login**: Use `student_id` (e.g., `U22/FNS/CSC/0001`)
- **Student ID**: Required and validated

### **For Admins/HOD/Examiners:**
- **Creation**: Created by superusers (not through registration)
- **Login**: Use `email` (e.g., `admin@ibbul.edu.ng`)
- **Student ID**: Not required (set to `None`)

---

## 📝 API Changes

### **Registration Endpoint** (Students Only)
```json
POST /api/accounts/register/
{
    "email": "student@example.com",
    "student_id": "U22/FNS/CSC/0001",
    "password": "password123",
    "password_confirm": "password123",
    "first_name": "John",
    "last_name": "Doe"
}
```

### **Login Endpoint** (Both Students and Admins)
```json
POST /api/accounts/login/

// For Students:
{
    "username": "U22/FNS/CSC/0001",
    "password": "password123"
}

// For Admins/HOD/Examiners:
{
    "username": "admin@ibbul.edu.ng",
    "password": "password123"
}
```

**Note**: The `username` field accepts either student_id or email.

---

## 🔧 Migration Steps

### **Step 1: Update Existing Superuser**

Run the migration script:
```bash
python migrate_existing_superuser.py
```

This will:
- Find existing superuser with student_id
- Prompt for new email
- Remove student_id from admin account
- Update to use email authentication

### **Step 2: Create New Admin Users**

Use the admin creation script:
```bash
python create_admin_user.py
```

Or use Django admin panel:
1. Login to admin: http://localhost:8000/admin/
2. Go to Users
3. Add User
4. Enter email (no student_id needed for admins)
5. Set role to HOD or EXAMINER

---

## 🎓 User Roles Explained

### **STUDENT**
- ✅ Has `student_id` (required)
- ✅ Has `email` (required)
- ✅ Logs in with `student_id`
- ✅ Can register through API

### **EXAMINER**
- ❌ No `student_id` (set to `None`)
- ✅ Has `email` (required)
- ✅ Logs in with `email`
- ❌ Cannot register (created by admin)

### **HOD (Head of Department)**
- ❌ No `student_id` (set to `None`)
- ✅ Has `email` (required)
- ✅ Logs in with `email`
- ❌ Cannot register (created by admin)

---

## 🛠️ Creating Users

### **Create Student** (via API)
```bash
POST /api/accounts/register/
{
    "email": "student@example.com",
    "student_id": "U22/FNS/CSC/0001",
    "password": "password123",
    "password_confirm": "password123"
}
```

### **Create Admin/HOD** (via Script)
```bash
python create_admin_user.py
```

### **Create Admin/HOD** (via Django Admin)
1. Login to admin panel
2. Go to Users → Add User
3. Enter email (no student_id)
4. Set password
5. Set role to HOD or EXAMINER
6. Check "Staff status" and "Superuser status" if needed

---

## 🔍 Authentication Backend

The system uses a **custom authentication backend** (`DualAuthenticationBackend`) that:
1. Checks if username matches student_id format (`U22/FNS/CSC/XXXX`)
2. If yes → Authenticates as student using student_id
3. If no → Authenticates using email (for admins)

---

## ✅ Summary

**What's Different:**
- ✅ Students use Student ID for login
- ✅ Admins use Email for login
- ✅ Superuser credentials are customizable
- ✅ No student_id required for admin accounts

**Migration Status:**
- ✅ Model updated
- ✅ Migrations created and applied
- ⏳ Existing superuser needs migration (run `migrate_existing_superuser.py`)

**Next Steps:**
1. Run `python migrate_existing_superuser.py` to update existing superuser
2. Create new admin users with `python create_admin_user.py`
3. Test login with both student_id and email

---

## 🎉 Benefits

1. **Flexibility**: Admins don't need student IDs
2. **Security**: Separate authentication methods for different roles
3. **Scalability**: Easy to add more admin accounts
4. **Clarity**: Clear distinction between students and admins
