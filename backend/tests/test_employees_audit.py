"""
Test suite for Employee Management and Audit Log features
Tests:
- Employee CRUD operations (create, read, update, delete)
- Employee permissions (checkboxes)
- Employee status (active/inactive)
- Employee login
- Audit log tracking
- Audit log filtering
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@outletsusaec.com"
ADMIN_PASSWORD = "admin123"

# Test employee data
TEST_EMPLOYEE_EMAIL = f"test_employee_{uuid.uuid4().hex[:8]}@test.com"
TEST_EMPLOYEE_PASSWORD = "empleado123"
TEST_EMPLOYEE_NAME = "Test Employee"


class TestEmployeeModule:
    """Tests for Employee CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as admin and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        self.admin_token = data["token"]
        self.admin_user_id = data["user_id"]
        self.tenant_id = data["tenant_id"]
        self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
        
        yield
        
        # Cleanup: Delete test employees
        try:
            employees_response = self.session.get(f"{BASE_URL}/api/admin/employees")
            if employees_response.status_code == 200:
                for emp in employees_response.json():
                    if emp.get("email", "").startswith("test_employee_"):
                        self.session.delete(f"{BASE_URL}/api/admin/employees/{emp['id']}")
        except:
            pass
    
    def test_01_get_employees_empty_or_list(self):
        """Test GET /api/admin/employees returns list"""
        response = self.session.get(f"{BASE_URL}/api/admin/employees")
        assert response.status_code == 200, f"Failed to get employees: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET employees returned {len(data)} employees")
    
    def test_02_create_employee_with_permissions(self):
        """Test POST /api/admin/employees - Create employee with permissions"""
        employee_data = {
            "name": TEST_EMPLOYEE_NAME,
            "email": TEST_EMPLOYEE_EMAIL,
            "whatsapp": "+593999999999",
            "password": TEST_EMPLOYEE_PASSWORD,
            "permissions": {
                "manage_clients": True,
                "manage_purchases": True,
                "manage_lives": False,
                "approve_recharges": True,
                "manage_shipments": False,
                "manage_invoices": False,
                "view_reports": True,
                "adjust_wallet": False,
                "view_statistics": True
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert response.status_code == 200, f"Failed to create employee: {response.text}"
        data = response.json()
        assert "employee_id" in data, "Response should contain employee_id"
        self.employee_id = data["employee_id"]
        print(f"✓ Created employee with ID: {self.employee_id}")
        
        # Verify employee was created by fetching it
        get_response = self.session.get(f"{BASE_URL}/api/admin/employees/{self.employee_id}")
        assert get_response.status_code == 200, f"Failed to get created employee: {get_response.text}"
        employee = get_response.json()
        assert employee["name"] == TEST_EMPLOYEE_NAME
        assert employee["email"] == TEST_EMPLOYEE_EMAIL
        assert employee["password_plain"] == TEST_EMPLOYEE_PASSWORD, "Password should be stored in plain text for admin viewing"
        assert employee["permissions"]["manage_clients"] == True
        assert employee["permissions"]["manage_lives"] == False
        print(f"✓ Verified employee data and permissions")
    
    def test_03_create_employee_duplicate_email(self):
        """Test creating employee with duplicate email fails"""
        # First create an employee
        employee_data = {
            "name": "Duplicate Test",
            "email": f"duplicate_{uuid.uuid4().hex[:8]}@test.com",
            "password": "test123"
        }
        response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert response.status_code == 200
        
        # Try to create another with same email
        response2 = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert response2.status_code == 400, "Should fail with duplicate email"
        print(f"✓ Duplicate email correctly rejected")
    
    def test_04_update_employee_permissions(self):
        """Test PUT /api/admin/employees/{id} - Update permissions"""
        # Create employee first
        employee_data = {
            "name": "Update Test Employee",
            "email": f"update_test_{uuid.uuid4().hex[:8]}@test.com",
            "password": "test123",
            "permissions": {"manage_clients": False}
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert create_response.status_code == 200
        employee_id = create_response.json()["employee_id"]
        
        # Update permissions
        update_data = {
            "permissions": {
                "manage_clients": True,
                "manage_purchases": True,
                "approve_recharges": True
            }
        }
        update_response = self.session.put(f"{BASE_URL}/api/admin/employees/{employee_id}", json=update_data)
        assert update_response.status_code == 200, f"Failed to update employee: {update_response.text}"
        
        # Verify update
        get_response = self.session.get(f"{BASE_URL}/api/admin/employees/{employee_id}")
        assert get_response.status_code == 200
        updated_employee = get_response.json()
        assert updated_employee["permissions"]["manage_clients"] == True
        assert updated_employee["permissions"]["manage_purchases"] == True
        print(f"✓ Employee permissions updated successfully")
    
    def test_05_update_employee_status_inactive(self):
        """Test changing employee status to inactive"""
        # Create employee
        employee_data = {
            "name": "Status Test Employee",
            "email": f"status_test_{uuid.uuid4().hex[:8]}@test.com",
            "password": "test123"
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert create_response.status_code == 200
        employee_id = create_response.json()["employee_id"]
        
        # Update status to inactive
        update_response = self.session.put(f"{BASE_URL}/api/admin/employees/{employee_id}", json={"status": "inactive"})
        assert update_response.status_code == 200
        
        # Verify status
        get_response = self.session.get(f"{BASE_URL}/api/admin/employees/{employee_id}")
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "inactive"
        print(f"✓ Employee status changed to inactive")
    
    def test_06_update_employee_password(self):
        """Test changing employee password"""
        # Create employee
        employee_data = {
            "name": "Password Test Employee",
            "email": f"password_test_{uuid.uuid4().hex[:8]}@test.com",
            "password": "oldpassword123"
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert create_response.status_code == 200
        employee_id = create_response.json()["employee_id"]
        
        # Update password
        new_password = "newpassword456"
        update_response = self.session.put(f"{BASE_URL}/api/admin/employees/{employee_id}", json={"password": new_password})
        assert update_response.status_code == 200
        
        # Verify password_plain is updated
        get_response = self.session.get(f"{BASE_URL}/api/admin/employees/{employee_id}")
        assert get_response.status_code == 200
        assert get_response.json()["password_plain"] == new_password
        print(f"✓ Employee password updated and visible to admin")
    
    def test_07_delete_employee(self):
        """Test DELETE /api/admin/employees/{id}"""
        # Create employee
        employee_data = {
            "name": "Delete Test Employee",
            "email": f"delete_test_{uuid.uuid4().hex[:8]}@test.com",
            "password": "test123"
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert create_response.status_code == 200
        employee_id = create_response.json()["employee_id"]
        
        # Delete employee
        delete_response = self.session.delete(f"{BASE_URL}/api/admin/employees/{employee_id}")
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = self.session.get(f"{BASE_URL}/api/admin/employees/{employee_id}")
        assert get_response.status_code == 404
        print(f"✓ Employee deleted successfully")


class TestEmployeeLogin:
    """Tests for Employee login functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Create a test employee"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.admin_token = response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
        
        # Create test employee
        self.test_email = f"login_test_{uuid.uuid4().hex[:8]}@test.com"
        self.test_password = "logintest123"
        employee_data = {
            "name": "Login Test Employee",
            "email": self.test_email,
            "password": self.test_password,
            "permissions": {"manage_clients": True, "view_reports": True}
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert create_response.status_code == 200
        self.employee_id = create_response.json()["employee_id"]
        
        yield
        
        # Cleanup
        try:
            self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            self.session.delete(f"{BASE_URL}/api/admin/employees/{self.employee_id}")
        except:
            pass
    
    def test_01_employee_login_success(self):
        """Test employee can login with correct credentials"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": self.test_email,
            "password": self.test_password
        })
        assert login_response.status_code == 200, f"Employee login failed: {login_response.text}"
        data = login_response.json()
        
        assert data["role"] == "employee", "Role should be 'employee'"
        assert "token" in data, "Should return token"
        assert "permissions" in data, "Should return permissions"
        assert data["permissions"]["manage_clients"] == True
        assert data["permissions"]["view_reports"] == True
        print(f"✓ Employee login successful with correct permissions returned")
    
    def test_02_employee_login_wrong_password(self):
        """Test employee login fails with wrong password"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": self.test_email,
            "password": "wrongpassword"
        })
        assert login_response.status_code == 401, "Should fail with wrong password"
        print(f"✓ Employee login correctly rejected with wrong password")
    
    def test_03_inactive_employee_cannot_login(self):
        """Test inactive employee cannot login"""
        # Deactivate employee
        self.session.put(f"{BASE_URL}/api/admin/employees/{self.employee_id}", json={"status": "inactive"})
        
        # Try to login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": self.test_email,
            "password": self.test_password
        })
        assert login_response.status_code == 403, f"Inactive employee should not be able to login: {login_response.text}"
        print(f"✓ Inactive employee correctly blocked from login")


class TestAuditLog:
    """Tests for Audit Log functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.admin_token = response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
        
        yield
    
    def test_01_get_audit_logs(self):
        """Test GET /api/admin/audit-logs returns logs"""
        response = self.session.get(f"{BASE_URL}/api/admin/audit-logs")
        assert response.status_code == 200, f"Failed to get audit logs: {response.text}"
        data = response.json()
        
        assert "logs" in data, "Response should contain 'logs'"
        assert "total" in data, "Response should contain 'total'"
        assert isinstance(data["logs"], list), "Logs should be a list"
        print(f"✓ GET audit logs returned {data['total']} total logs")
    
    def test_02_audit_log_records_employee_creation(self):
        """Test that creating an employee creates an audit log entry"""
        # Create employee
        test_email = f"audit_test_{uuid.uuid4().hex[:8]}@test.com"
        employee_data = {
            "name": "Audit Test Employee",
            "email": test_email,
            "password": "test123"
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert create_response.status_code == 200
        employee_id = create_response.json()["employee_id"]
        
        # Check audit log
        audit_response = self.session.get(f"{BASE_URL}/api/admin/audit-logs", params={"action": "create_employee"})
        assert audit_response.status_code == 200
        logs = audit_response.json()["logs"]
        
        # Find the log entry for our employee
        found = False
        for log in logs:
            if log.get("entity_id") == employee_id:
                found = True
                assert log["action"] == "create_employee"
                assert log["entity_type"] == "employee"
                assert log["entity_name"] == "Audit Test Employee"
                break
        
        assert found, "Audit log entry for employee creation not found"
        print(f"✓ Employee creation recorded in audit log")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/admin/employees/{employee_id}")
    
    def test_03_audit_log_records_login(self):
        """Test that admin login creates an audit log entry"""
        # The login in setup should have created an audit entry
        audit_response = self.session.get(f"{BASE_URL}/api/admin/audit-logs", params={"action": "login"})
        assert audit_response.status_code == 200
        logs = audit_response.json()["logs"]
        
        # Should have at least one login entry
        assert len(logs) > 0, "Should have login audit entries"
        login_log = logs[0]
        assert login_log["action"] == "login"
        assert login_log["entity_type"] == "session"
        print(f"✓ Login recorded in audit log")
    
    def test_04_get_audit_users(self):
        """Test GET /api/admin/audit-logs/users returns users list"""
        response = self.session.get(f"{BASE_URL}/api/admin/audit-logs/users")
        assert response.status_code == 200, f"Failed to get audit users: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        if len(data) > 0:
            assert "user_id" in data[0], "User should have user_id"
            assert "user_name" in data[0], "User should have user_name"
            assert "user_role" in data[0], "User should have user_role"
        print(f"✓ GET audit users returned {len(data)} users")
    
    def test_05_get_audit_actions(self):
        """Test GET /api/admin/audit-logs/actions returns action types"""
        response = self.session.get(f"{BASE_URL}/api/admin/audit-logs/actions")
        assert response.status_code == 200, f"Failed to get audit actions: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have action types"
        
        # Check for expected actions
        action_values = [a["value"] for a in data]
        assert "login" in action_values
        assert "create_employee" in action_values
        assert "update_employee" in action_values
        assert "delete_employee" in action_values
        print(f"✓ GET audit actions returned {len(data)} action types")
    
    def test_06_filter_audit_logs_by_action(self):
        """Test filtering audit logs by action type"""
        response = self.session.get(f"{BASE_URL}/api/admin/audit-logs", params={"action": "login"})
        assert response.status_code == 200
        data = response.json()
        
        # All returned logs should have action = "login"
        for log in data["logs"]:
            assert log["action"] == "login", f"Expected action 'login', got '{log['action']}'"
        print(f"✓ Audit log filtering by action works correctly")
    
    def test_07_audit_log_pagination(self):
        """Test audit log pagination"""
        # Get first page
        response1 = self.session.get(f"{BASE_URL}/api/admin/audit-logs", params={"limit": 5, "skip": 0})
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get second page
        response2 = self.session.get(f"{BASE_URL}/api/admin/audit-logs", params={"limit": 5, "skip": 5})
        assert response2.status_code == 200
        data2 = response2.json()
        
        # If there are enough logs, pages should be different
        if data1["total"] > 5:
            assert data1["logs"] != data2["logs"], "Pagination should return different results"
        print(f"✓ Audit log pagination works correctly")


class TestEmployeePermissionsEnforcement:
    """Tests to verify employee permissions are enforced"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Create employee with limited permissions"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.admin_token = response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
        
        # Create employee with only view_reports permission
        self.test_email = f"perm_test_{uuid.uuid4().hex[:8]}@test.com"
        self.test_password = "permtest123"
        employee_data = {
            "name": "Permission Test Employee",
            "email": self.test_email,
            "password": self.test_password,
            "permissions": {
                "manage_clients": False,
                "manage_purchases": False,
                "approve_recharges": False,
                "view_reports": True
            }
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/employees", json=employee_data)
        assert create_response.status_code == 200
        self.employee_id = create_response.json()["employee_id"]
        
        # Login as employee
        emp_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": self.test_email,
            "password": self.test_password
        })
        assert emp_login.status_code == 200
        self.employee_token = emp_login.json()["token"]
        
        yield
        
        # Cleanup
        try:
            self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            self.session.delete(f"{BASE_URL}/api/admin/employees/{self.employee_id}")
        except:
            pass
    
    def test_01_employee_cannot_access_employees_module(self):
        """Test employee cannot access /api/admin/employees"""
        emp_session = requests.Session()
        emp_session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.employee_token}"
        })
        
        response = emp_session.get(f"{BASE_URL}/api/admin/employees")
        assert response.status_code == 403, f"Employee should not access employees module: {response.text}"
        print(f"✓ Employee correctly blocked from employees module")
    
    def test_02_employee_cannot_access_audit_logs(self):
        """Test employee cannot access /api/admin/audit-logs"""
        emp_session = requests.Session()
        emp_session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.employee_token}"
        })
        
        response = emp_session.get(f"{BASE_URL}/api/admin/audit-logs")
        assert response.status_code == 403, f"Employee should not access audit logs: {response.text}"
        print(f"✓ Employee correctly blocked from audit logs")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
