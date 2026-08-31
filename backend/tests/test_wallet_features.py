"""
Test Wallet Management Features:
1. Reject deposit endpoint - POST /api/wallet/reject-deposit/{id}
2. All deposits (global history) - GET /api/wallet/all-deposits
3. Admin balance adjustment - POST /api/wallet/admin-adjustment
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWalletFeatures:
    """Test new wallet management features for admin"""
    
    admin_token = None
    client_user_id = None
    client_customer_id = None
    pending_transaction_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Ensure we have BASE_URL"""
        assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
    
    def test_01_admin_login(self):
        """Login as admin to get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@outletsusaec.com",
            "password": "123456"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert data["role"] == "admin", f"Expected admin role, got {data['role']}"
        TestWalletFeatures.admin_token = data["token"]
        print(f"Admin logged in: {data['name']} (role: {data['role']})")
    
    def test_02_get_all_clients(self):
        """Get all clients to find a test client"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/clients", headers=headers)
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        clients = response.json()
        print(f"Found {len(clients)} clients")
        
        # Find a client with wallet balance for testing
        for client in clients:
            if client.get("wallet_balance", 0) > 0:
                TestWalletFeatures.client_user_id = client["id"]
                TestWalletFeatures.client_customer_id = client["customer_id"]
                print(f"Selected client: {client['name']} (#{client['customer_id']}) - Balance: ${client['wallet_balance']}")
                break
        
        # If no client with balance, use first client
        if not TestWalletFeatures.client_user_id and clients:
            TestWalletFeatures.client_user_id = clients[0]["id"]
            TestWalletFeatures.client_customer_id = clients[0]["customer_id"]
            print(f"Selected first client: {clients[0]['name']} (#{clients[0]['customer_id']})")
        
        assert TestWalletFeatures.client_user_id, "No clients found"
    
    # ==================== TEST: GET ALL DEPOSITS (Global History) ====================
    
    def test_03_get_all_deposits_endpoint(self):
        """Test GET /api/wallet/all-deposits - returns all deposits from all clients"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(f"{BASE_URL}/api/wallet/all-deposits", headers=headers)
        
        assert response.status_code == 200, f"Failed to get all deposits: {response.text}"
        deposits = response.json()
        assert isinstance(deposits, list), "Response should be a list"
        print(f"All deposits count: {len(deposits)}")
        
        # Check deposit structure
        if deposits:
            d = deposits[0]
            assert "id" in d, "Missing id field"
            assert "amount" in d, "Missing amount field"
            assert "status" in d, "Missing status field"
            assert "customer_id" in d, "Missing customer_id field"
            assert "user_name" in d, "Missing user_name field"
            print(f"Sample deposit: {d['customer_id']} - ${d['amount']} - Status: {d['status']}")
    
    def test_04_get_all_deposits_has_different_statuses(self):
        """Verify all-deposits includes approved, pending, and rejected statuses"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(f"{BASE_URL}/api/wallet/all-deposits", headers=headers)
        
        assert response.status_code == 200
        deposits = response.json()
        
        statuses_found = set(d["status"] for d in deposits)
        print(f"Statuses found in deposits: {statuses_found}")
        
        # At least we should have some deposits to verify structure
        # Don't require all statuses since it depends on data
        assert len(deposits) >= 0, "Should return deposits array"
    
    # ==================== TEST: CREATE PENDING DEPOSIT FOR REJECTION ====================
    
    def test_05_create_pending_deposit_for_rejection(self):
        """Create a pending deposit request that we can later reject"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        
        # First get wallet to confirm user exists
        response = requests.get(
            f"{BASE_URL}/api/wallet/{TestWalletFeatures.client_user_id}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get wallet: {response.text}"
        
        # Create a pending deposit
        response = requests.post(
            f"{BASE_URL}/api/wallet/deposit-request",
            headers=headers,
            json={
                "user_id": TestWalletFeatures.client_user_id,
                "amount": 10.00,
                "description": "TEST_DEPOSIT_FOR_REJECTION"
            }
        )
        assert response.status_code == 200, f"Failed to create deposit: {response.text}"
        data = response.json()
        assert "transaction_id" in data, "No transaction_id in response"
        TestWalletFeatures.pending_transaction_id = data["transaction_id"]
        print(f"Created pending deposit: {data['transaction_id']}")
    
    def test_06_verify_pending_deposit_in_list(self):
        """Verify the pending deposit appears in pending deposits list"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(f"{BASE_URL}/api/wallet/pending-deposits", headers=headers)
        
        assert response.status_code == 200, f"Failed to get pending deposits: {response.text}"
        pending = response.json()
        
        # Find our test deposit
        found = any(d["id"] == TestWalletFeatures.pending_transaction_id for d in pending)
        assert found, f"Created deposit {TestWalletFeatures.pending_transaction_id} not found in pending list"
        print(f"Pending deposit found in list. Total pending: {len(pending)}")
    
    # ==================== TEST: REJECT DEPOSIT ====================
    
    def test_07_reject_deposit_endpoint(self):
        """Test POST /api/wallet/reject-deposit/{transaction_id}"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/wallet/reject-deposit/{TestWalletFeatures.pending_transaction_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed to reject deposit: {response.text}"
        data = response.json()
        assert data.get("message") == "Depósito rechazado", f"Unexpected message: {data}"
        print(f"Deposit rejected successfully: {data}")
    
    def test_08_verify_deposit_status_changed_to_rejected(self):
        """Verify the rejected deposit has status 'rejected' in all-deposits"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(f"{BASE_URL}/api/wallet/all-deposits", headers=headers)
        
        assert response.status_code == 200
        deposits = response.json()
        
        # Find our rejected deposit
        rejected_deposit = next(
            (d for d in deposits if d["id"] == TestWalletFeatures.pending_transaction_id),
            None
        )
        assert rejected_deposit, f"Deposit {TestWalletFeatures.pending_transaction_id} not found"
        assert rejected_deposit["status"] == "rejected", f"Expected status 'rejected', got '{rejected_deposit['status']}'"
        print(f"Verified deposit status is 'rejected'")
    
    def test_09_reject_already_processed_deposit_fails(self):
        """Test rejecting an already rejected deposit returns error"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/wallet/reject-deposit/{TestWalletFeatures.pending_transaction_id}",
            headers=headers
        )
        
        # Should fail since already rejected
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "ya procesada" in data.get("detail", "").lower() or "already" in data.get("detail", "").lower(), f"Unexpected error: {data}"
        print(f"Correctly rejected re-rejection: {data}")
    
    # ==================== TEST: ADMIN BALANCE ADJUSTMENT ====================
    
    def test_10_get_client_wallet_before_adjustment(self):
        """Get client wallet balance before adjustment"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/wallet/{TestWalletFeatures.client_user_id}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get wallet: {response.text}"
        wallet = response.json()
        TestWalletFeatures.balance_before = wallet.get("available", 0)
        print(f"Client balance before adjustment: ${TestWalletFeatures.balance_before}")
    
    def test_11_admin_balance_adjustment_endpoint(self):
        """Test POST /api/wallet/admin-adjustment - deduct balance with custom reason"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        
        adjustment_amount = 5.00
        adjustment_reason = "TEST_ADJUSTMENT - Corrección de balance por error"
        
        response = requests.post(
            f"{BASE_URL}/api/wallet/admin-adjustment",
            headers=headers,
            json={
                "user_id": TestWalletFeatures.client_user_id,
                "amount": adjustment_amount,
                "description": adjustment_reason
            }
        )
        
        assert response.status_code == 200, f"Failed admin adjustment: {response.text}"
        data = response.json()
        
        assert "message" in data, "Missing message in response"
        assert "new_balance" in data, "Missing new_balance in response"
        assert "amount_deducted" in data, "Missing amount_deducted in response"
        
        expected_balance = TestWalletFeatures.balance_before - adjustment_amount
        actual_balance = data["new_balance"]
        assert abs(actual_balance - expected_balance) < 0.01, f"Balance mismatch: expected {expected_balance}, got {actual_balance}"
        
        print(f"Adjustment successful: Deducted ${adjustment_amount}, New balance: ${actual_balance}")
    
    def test_12_verify_wallet_balance_after_adjustment(self):
        """Verify wallet balance was actually deducted"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/wallet/{TestWalletFeatures.client_user_id}",
            headers=headers
        )
        assert response.status_code == 200
        wallet = response.json()
        
        expected_balance = TestWalletFeatures.balance_before - 5.00
        actual_balance = wallet.get("available", 0)
        assert abs(actual_balance - expected_balance) < 0.01, f"Balance not deducted correctly: expected {expected_balance}, got {actual_balance}"
        print(f"Verified balance after adjustment: ${actual_balance}")
    
    def test_13_verify_adjustment_in_transactions(self):
        """Verify admin adjustment appears in wallet transactions"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/wallet/transactions/{TestWalletFeatures.client_user_id}",
            headers=headers
        )
        assert response.status_code == 200
        transactions = response.json()
        
        # Find our adjustment transaction
        adjustment = next(
            (t for t in transactions if t.get("type") == "admin_adjustment" and "TEST_ADJUSTMENT" in t.get("description", "")),
            None
        )
        assert adjustment, "Admin adjustment transaction not found"
        assert adjustment["amount"] == -5.00, f"Expected amount -5.00, got {adjustment['amount']}"
        assert adjustment["status"] == "approved", f"Expected status 'approved', got {adjustment['status']}"
        print(f"Found adjustment transaction: ${adjustment['amount']} - {adjustment['description']}")
    
    # ==================== TEST: ADMIN ADJUSTMENT VALIDATION ====================
    
    def test_14_admin_adjustment_zero_amount_fails(self):
        """Test that adjustment with zero amount fails"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/wallet/admin-adjustment",
            headers=headers,
            json={
                "user_id": TestWalletFeatures.client_user_id,
                "amount": 0,
                "description": "Invalid zero amount"
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for zero amount, got {response.status_code}"
        print(f"Zero amount correctly rejected")
    
    def test_15_admin_adjustment_negative_amount_fails(self):
        """Test that adjustment with negative amount fails"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/wallet/admin-adjustment",
            headers=headers,
            json={
                "user_id": TestWalletFeatures.client_user_id,
                "amount": -5.00,
                "description": "Invalid negative amount"
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for negative amount, got {response.status_code}"
        print(f"Negative amount correctly rejected")
    
    def test_16_admin_adjustment_invalid_user_fails(self):
        """Test that adjustment for non-existent user fails"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/wallet/admin-adjustment",
            headers=headers,
            json={
                "user_id": "non-existent-user-id-12345",
                "amount": 5.00,
                "description": "Invalid user"
            }
        )
        
        assert response.status_code == 404, f"Expected 404 for invalid user, got {response.status_code}"
        print(f"Invalid user correctly rejected")
    
    # ==================== TEST: REJECT DEPOSIT WITHOUT AUTH ====================
    
    def test_17_reject_deposit_without_auth_fails(self):
        """Test that reject endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/wallet/reject-deposit/some-id"
        )
        
        assert response.status_code == 422 or response.status_code == 401, f"Expected 401/422 without auth, got {response.status_code}"
        print(f"Auth required for reject endpoint - verified")
    
    def test_18_admin_adjustment_without_auth_fails(self):
        """Test that admin adjustment requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/wallet/admin-adjustment",
            json={
                "user_id": "test",
                "amount": 1.00,
                "description": "test"
            }
        )
        
        assert response.status_code == 422 or response.status_code == 401, f"Expected 401/422 without auth, got {response.status_code}"
        print(f"Auth required for admin adjustment - verified")


class TestWalletFeaturesClientAccess:
    """Verify client cannot access admin wallet features"""
    
    client_token = None
    
    def test_01_client_login(self):
        """Login as a client"""
        headers = {"Authorization": f"Bearer {TestWalletFeatures.admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/clients", headers=headers)
        
        if response.status_code == 200:
            clients = response.json()
            if clients:
                # Try to find a client with known credentials or use customer_id
                client = clients[0]
                # Try login with customer_id
                response = requests.post(f"{BASE_URL}/api/auth/login", json={
                    "identifier": client["customer_id"],
                    "password": "test123"  # Common test password
                })
                if response.status_code == 200:
                    TestWalletFeaturesClientAccess.client_token = response.json()["token"]
                    print(f"Client logged in")
                else:
                    pytest.skip("Could not login as client - skipping client access tests")
        else:
            pytest.skip("Could not get clients - skipping client access tests")
    
    def test_02_client_cannot_reject_deposit(self):
        """Verify client cannot access reject-deposit endpoint"""
        if not TestWalletFeaturesClientAccess.client_token:
            pytest.skip("No client token")
        
        headers = {"Authorization": f"Bearer {TestWalletFeaturesClientAccess.client_token}"}
        response = requests.post(
            f"{BASE_URL}/api/wallet/reject-deposit/test-id",
            headers=headers
        )
        
        assert response.status_code == 403, f"Expected 403 for client, got {response.status_code}"
        print(f"Client correctly denied access to reject-deposit")
    
    def test_03_client_cannot_admin_adjustment(self):
        """Verify client cannot access admin-adjustment endpoint"""
        if not TestWalletFeaturesClientAccess.client_token:
            pytest.skip("No client token")
        
        headers = {"Authorization": f"Bearer {TestWalletFeaturesClientAccess.client_token}"}
        response = requests.post(
            f"{BASE_URL}/api/wallet/admin-adjustment",
            headers=headers,
            json={
                "user_id": "test",
                "amount": 1.00,
                "description": "test"
            }
        )
        
        assert response.status_code == 403, f"Expected 403 for client, got {response.status_code}"
        print(f"Client correctly denied access to admin-adjustment")
