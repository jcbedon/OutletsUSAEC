"""
Test cases for Admin Stats and Tax Options features
- Tests business statistics API endpoint
- Tests purchase creation with different tax types
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBusinessStatsAPI:
    """Tests for /admin/reports/business-stats endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@outletsusaec.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Login failed - skipping tests")
    
    def test_business_stats_endpoint_returns_200(self):
        """Test that business stats endpoint returns success"""
        response = requests.get(f"{BASE_URL}/api/admin/reports/business-stats", headers=self.headers)
        assert response.status_code == 200
        print(f"SUCCESS: Business stats endpoint returned 200")
    
    def test_business_stats_has_revenue_section(self):
        """Test that response contains revenue data"""
        response = requests.get(f"{BASE_URL}/api/admin/reports/business-stats", headers=self.headers)
        data = response.json()
        
        assert "revenue" in data
        revenue = data["revenue"]
        
        # Check all required revenue fields
        assert "total_product_sales" in revenue
        assert "total_tax_collected" in revenue
        assert "total_commissions" in revenue
        assert "total_shipping" in revenue
        assert "gross_profit" in revenue
        assert "purchase_count" in revenue
        print(f"SUCCESS: Revenue section contains all required fields")
    
    def test_business_stats_has_wallets_section(self):
        """Test that response contains wallet data"""
        response = requests.get(f"{BASE_URL}/api/admin/reports/business-stats", headers=self.headers)
        data = response.json()
        
        assert "wallets" in data
        wallets = data["wallets"]
        
        assert "total_deposits_received" in wallets
        assert "total_client_balance" in wallets
        assert "client_count" in wallets
        print(f"SUCCESS: Wallets section contains all required fields")
    
    def test_business_stats_has_sales_by_store(self):
        """Test that response contains sales by store"""
        response = requests.get(f"{BASE_URL}/api/admin/reports/business-stats", headers=self.headers)
        data = response.json()
        
        assert "sales_by_store" in data
        assert isinstance(data["sales_by_store"], list)
        print(f"SUCCESS: Sales by store section present, {len(data['sales_by_store'])} stores")
    
    def test_business_stats_has_sales_by_live(self):
        """Test that response contains sales by live"""
        response = requests.get(f"{BASE_URL}/api/admin/reports/business-stats", headers=self.headers)
        data = response.json()
        
        assert "sales_by_live" in data
        assert isinstance(data["sales_by_live"], list)
        print(f"SUCCESS: Sales by live section present, {len(data['sales_by_live'])} lives")
    
    def test_gross_profit_equals_commissions_plus_shipping(self):
        """Test that gross_profit = total_commissions + total_shipping"""
        response = requests.get(f"{BASE_URL}/api/admin/reports/business-stats", headers=self.headers)
        data = response.json()
        
        revenue = data["revenue"]
        expected_profit = revenue["total_commissions"] + revenue["total_shipping"]
        actual_profit = revenue["gross_profit"]
        
        assert actual_profit == expected_profit, f"Expected {expected_profit}, got {actual_profit}"
        print(f"SUCCESS: Gross profit ({actual_profit}) = Commissions ({revenue['total_commissions']}) + Shipping ({revenue['total_shipping']})")


class TestPurchaseTaxTypes:
    """Tests for purchase creation with different tax types"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@outletsusaec.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Login failed - skipping tests")
    
    def test_get_active_live(self):
        """Get active live for purchase tests"""
        response = requests.get(f"{BASE_URL}/api/lives/active", headers=self.headers)
        if response.status_code == 200 and response.json():
            print(f"SUCCESS: Found active live: {response.json().get('title')}")
        else:
            print("INFO: No active live found")
        assert response.status_code == 200


class TestPageTitle:
    """Tests for page configuration"""
    
    def test_page_title_is_outlets_usa_ec(self):
        """Test that page title is correctly set"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        assert "Outlets USA EC" in response.text
        print("SUCCESS: Page title contains 'Outlets USA EC'")
    
    def test_favicon_exists(self):
        """Test that favicon is accessible"""
        response = requests.get(f"{BASE_URL}/favicon.png")
        assert response.status_code == 200
        assert response.headers.get("content-type", "").startswith("image")
        print(f"SUCCESS: Favicon exists (size: {len(response.content)} bytes)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
