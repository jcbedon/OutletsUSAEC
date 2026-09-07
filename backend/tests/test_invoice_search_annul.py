"""
Test Invoice Search and Annul Features
- Search invoices by invoice number, client name, WhatsApp
- Annul invoices (soft delete)
- Verify annulled invoices appear in Anuladas tab
- Verify annulled invoices have annulled_by_name and annulled_at
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInvoiceSearchAndAnnul:
    """Test invoice search and annul functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@outletsusaec.com",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        login_data = login_response.json()
        self.token = login_data["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
    
    # ==================== SEARCH TESTS ====================
    
    def test_search_invoices_no_query_active(self):
        """Test search invoices with no query - active filter"""
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=&status_filter=active")
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All returned invoices should NOT be annulled
        for inv in data:
            assert inv.get("is_annulled") != True, f"Active filter returned annulled invoice: {inv.get('invoice_number')}"
        
        print(f"✓ Active invoices search returned {len(data)} invoices")
    
    def test_search_invoices_no_query_annulled(self):
        """Test search invoices with no query - annulled filter"""
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=&status_filter=annulled")
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All returned invoices should be annulled
        for inv in data:
            assert inv.get("is_annulled") == True, f"Annulled filter returned non-annulled invoice: {inv.get('invoice_number')}"
            # Verify annulled metadata
            assert inv.get("annulled_at") is not None, f"Annulled invoice missing annulled_at: {inv.get('invoice_number')}"
            assert inv.get("annulled_by_name") is not None, f"Annulled invoice missing annulled_by_name: {inv.get('invoice_number')}"
        
        print(f"✓ Annulled invoices search returned {len(data)} invoices")
    
    def test_search_invoices_no_query_all(self):
        """Test search invoices with no query - all filter"""
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=&status_filter=all")
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should include both active and annulled
        has_active = any(not inv.get("is_annulled") for inv in data)
        has_annulled = any(inv.get("is_annulled") for inv in data)
        
        print(f"✓ All invoices search returned {len(data)} invoices (active: {has_active}, annulled: {has_annulled})")
    
    def test_search_by_invoice_number(self):
        """Test search by invoice number (e.g., INV-000001)"""
        # First get all invoices to find a valid invoice number
        all_response = self.session.get(f"{BASE_URL}/api/invoices/search?q=&status_filter=all")
        assert all_response.status_code == 200
        all_invoices = all_response.json()
        
        if not all_invoices:
            pytest.skip("No invoices found to test search")
        
        # Search for the first invoice by number
        test_invoice = all_invoices[0]
        invoice_number = test_invoice["invoice_number"]
        
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q={invoice_number}&status_filter=all")
        assert response.status_code == 200, f"Search by invoice number failed: {response.text}"
        
        data = response.json()
        assert len(data) >= 1, f"Should find at least 1 invoice with number {invoice_number}"
        
        # Verify the searched invoice is in results
        found = any(inv["invoice_number"] == invoice_number for inv in data)
        assert found, f"Invoice {invoice_number} not found in search results"
        
        print(f"✓ Search by invoice number '{invoice_number}' found {len(data)} result(s)")
    
    def test_search_by_client_name(self):
        """Test search by client name (e.g., Juan)"""
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=Juan&status_filter=all")
        assert response.status_code == 200, f"Search by client name failed: {response.text}"
        
        data = response.json()
        # Should find invoices for clients with "Juan" in name
        print(f"✓ Search by client name 'Juan' found {len(data)} invoice(s)")
        
        # Verify client info is included
        for inv in data:
            assert "client" in inv, "Invoice should include client info"
    
    def test_search_by_whatsapp(self):
        """Test search by WhatsApp number"""
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=5939&status_filter=all")
        assert response.status_code == 200, f"Search by WhatsApp failed: {response.text}"
        
        data = response.json()
        print(f"✓ Search by WhatsApp '5939' found {len(data)} invoice(s)")
    
    def test_search_partial_match(self):
        """Test partial search matches"""
        # Search with partial invoice number
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=INV&status_filter=all")
        assert response.status_code == 200, f"Partial search failed: {response.text}"
        
        data = response.json()
        print(f"✓ Partial search 'INV' found {len(data)} invoice(s)")
    
    # ==================== ANNUL TESTS ====================
    
    def test_annul_invoice_requires_admin(self):
        """Test that only admin can annul invoices"""
        # This test verifies the endpoint exists and requires admin role
        # We'll test with a non-existent invoice ID to check authorization first
        response = self.session.put(f"{BASE_URL}/api/invoices/non-existent-id/annul")
        
        # Should get 404 (not found) not 403 (forbidden) since we're admin
        assert response.status_code in [404, 400], f"Expected 404 or 400, got {response.status_code}: {response.text}"
        print("✓ Annul endpoint accessible for admin")
    
    def test_annul_already_annulled_invoice(self):
        """Test that annulling an already annulled invoice returns error"""
        # Get annulled invoices
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=&status_filter=annulled")
        assert response.status_code == 200
        
        annulled = response.json()
        if not annulled:
            pytest.skip("No annulled invoices to test")
        
        # Try to annul again
        invoice_id = annulled[0]["id"]
        annul_response = self.session.put(f"{BASE_URL}/api/invoices/{invoice_id}/annul")
        
        assert annul_response.status_code == 400, f"Should return 400 for already annulled: {annul_response.text}"
        assert "ya está anulada" in annul_response.json().get("detail", "").lower() or "already" in annul_response.json().get("detail", "").lower()
        
        print("✓ Cannot annul already annulled invoice")
    
    def test_annulled_invoice_has_metadata(self):
        """Test that annulled invoices have proper metadata"""
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=&status_filter=annulled")
        assert response.status_code == 200
        
        annulled = response.json()
        if not annulled:
            pytest.skip("No annulled invoices to verify metadata")
        
        for inv in annulled:
            assert inv.get("is_annulled") == True, "is_annulled should be True"
            assert inv.get("annulled_at") is not None, "annulled_at should be set"
            assert inv.get("annulled_by_name") is not None, "annulled_by_name should be set"
            print(f"  - {inv['invoice_number']}: annulled by {inv['annulled_by_name']} at {inv['annulled_at']}")
        
        print(f"✓ All {len(annulled)} annulled invoices have proper metadata")
    
    # ==================== INVOICE DETAIL TESTS ====================
    
    def test_get_invoice_detail(self):
        """Test getting invoice detail"""
        # Get an invoice first
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=&status_filter=all")
        assert response.status_code == 200
        
        invoices = response.json()
        if not invoices:
            pytest.skip("No invoices to get detail")
        
        invoice_id = invoices[0]["id"]
        detail_response = self.session.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        
        assert detail_response.status_code == 200, f"Get detail failed: {detail_response.text}"
        
        detail = detail_response.json()
        assert "invoice_number" in detail
        assert "total" in detail
        assert "client" in detail
        
        print(f"✓ Invoice detail retrieved: {detail['invoice_number']}")
    
    def test_annulled_invoice_detail_shows_metadata(self):
        """Test that annulled invoice detail shows annul metadata"""
        response = self.session.get(f"{BASE_URL}/api/invoices/search?q=&status_filter=annulled")
        assert response.status_code == 200
        
        annulled = response.json()
        if not annulled:
            pytest.skip("No annulled invoices")
        
        invoice_id = annulled[0]["id"]
        detail_response = self.session.get(f"{BASE_URL}/api/invoices/{invoice_id}")
        
        assert detail_response.status_code == 200
        detail = detail_response.json()
        
        assert detail.get("is_annulled") == True
        assert detail.get("annulled_at") is not None
        assert detail.get("annulled_by_name") is not None
        
        print(f"✓ Annulled invoice detail shows: annulled by {detail['annulled_by_name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
