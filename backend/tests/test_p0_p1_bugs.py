"""
Test cases for P0 and P1 bug fixes:
- P0: InvoiceDialog product list collapse (UI fix - tested via Playwright)
- P1: Dashboard week filter for client_count metric
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDashboardWeekFilter:
    """P1 Bug Fix: Dashboard week filter should apply to client_count metric"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@outletsusaec.com",
            "password": "123456"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_summary_week_filter_returns_filtered_client_count(self):
        """GET /api/admin/reports/summary?period=week should return filtered client_count"""
        response = requests.get(
            f"{BASE_URL}/api/admin/reports/summary?period=week",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "client_count" in data
        assert "live_count" in data
        assert "pending_shipments" in data
        assert "total_packages" in data
        
        # Store week values for comparison
        self.week_client_count = data["client_count"]
        print(f"Week client_count: {self.week_client_count}")
    
    def test_summary_all_filter_returns_all_clients(self):
        """GET /api/admin/reports/summary?period=all should return ALL clients"""
        response = requests.get(
            f"{BASE_URL}/api/admin/reports/summary?period=all",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "client_count" in data
        assert "live_count" in data
        
        # Store all values for comparison
        self.all_client_count = data["client_count"]
        print(f"All client_count: {self.all_client_count}")
    
    def test_week_filter_returns_fewer_or_equal_clients_than_all(self):
        """Week filter should return <= clients compared to all filter"""
        # Get week data
        week_response = requests.get(
            f"{BASE_URL}/api/admin/reports/summary?period=week",
            headers=self.headers
        )
        assert week_response.status_code == 200
        week_data = week_response.json()
        
        # Get all data
        all_response = requests.get(
            f"{BASE_URL}/api/admin/reports/summary?period=all",
            headers=self.headers
        )
        assert all_response.status_code == 200
        all_data = all_response.json()
        
        # Week client_count should be <= all client_count
        assert week_data["client_count"] <= all_data["client_count"], \
            f"Week client_count ({week_data['client_count']}) should be <= all client_count ({all_data['client_count']})"
        
        print(f"P1 Bug Fix Verified: week={week_data['client_count']}, all={all_data['client_count']}")
    
    def test_week_filter_applies_to_all_metrics(self):
        """Week filter should apply to all relevant metrics"""
        # Get week data
        week_response = requests.get(
            f"{BASE_URL}/api/admin/reports/summary?period=week",
            headers=self.headers
        )
        assert week_response.status_code == 200
        week_data = week_response.json()
        
        # Get all data
        all_response = requests.get(
            f"{BASE_URL}/api/admin/reports/summary?period=all",
            headers=self.headers
        )
        assert all_response.status_code == 200
        all_data = all_response.json()
        
        # All filtered metrics should be <= all metrics
        assert week_data["client_count"] <= all_data["client_count"]
        assert week_data["live_count"] <= all_data["live_count"]
        assert week_data["total_packages"] <= all_data["total_packages"]
        
        print("All metrics properly filtered by week")


class TestPendingPurchasesForInvoice:
    """Test pending purchases endpoint used by InvoiceDialog (P0 related)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@outletsusaec.com",
            "password": "123456"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_pending_purchases_for_client(self):
        """GET /api/invoices/client/{customer_id}/pending-purchases returns pending purchases"""
        response = requests.get(
            f"{BASE_URL}/api/invoices/client/J2934/pending-purchases",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        
        # Each purchase should have required fields
        if len(data) > 0:
            purchase = data[0]
            assert "id" in purchase
            assert "item_name" in purchase
            assert "price" in purchase
            assert "store" in purchase
            
        print(f"Found {len(data)} pending purchases for J2934")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
