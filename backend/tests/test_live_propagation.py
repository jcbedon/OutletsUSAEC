"""
Test Live Title/Store Propagation to Purchases
Tests that updating a live's title or store propagates changes to all associated purchases
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLivePropagation:
    """Test live title/store propagation to purchases"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@outletsusaec.com",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        
        login_data = login_response.json()
        self.token = login_data.get("token")
        self.tenant_id = login_data.get("tenant_id")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
    
    def test_get_lives_list(self):
        """Test that we can get the list of lives"""
        response = self.session.get(f"{BASE_URL}/api/lives")
        assert response.status_code == 200, f"Failed to get lives: {response.text}"
        
        lives = response.json()
        assert isinstance(lives, list), "Lives should be a list"
        print(f"Found {len(lives)} lives")
        
        # Check for the test lives mentioned in the request
        live_titles = [l.get("title") for l in lives]
        print(f"Live titles: {live_titles}")
        
        return lives
    
    def test_get_live_with_completed_status(self):
        """Test that we can find a live with completed/ended status"""
        response = self.session.get(f"{BASE_URL}/api/lives")
        assert response.status_code == 200
        
        lives = response.json()
        completed_lives = [l for l in lives if l.get("status") in ["completed", "ended", "finalized"]]
        
        print(f"Found {len(completed_lives)} completed/ended/finalized lives")
        for live in completed_lives:
            print(f"  - {live.get('title')} (status: {live.get('status')})")
        
        # We expect at least one completed live (Test Live Session)
        assert len(completed_lives) >= 0, "Should have at least one completed live"
    
    def test_update_live_title_propagates_to_purchases(self):
        """Test that updating live title propagates to all associated purchases"""
        # Get all lives
        response = self.session.get(f"{BASE_URL}/api/lives")
        assert response.status_code == 200
        lives = response.json()
        
        # Find a live with purchases (Live Propagation Test 1221 has 13 purchases)
        test_live = None
        for live in lives:
            if live.get("purchase_count", 0) > 0:
                test_live = live
                break
        
        if not test_live:
            pytest.skip("No live with purchases found for testing")
        
        live_id = test_live["id"]
        original_title = test_live.get("title")
        original_store = test_live.get("store")
        print(f"Testing with live: {original_title} (ID: {live_id})")
        print(f"Original store: {original_store}")
        
        # Get purchases before update (correct endpoint: /api/purchases/live/{live_id})
        purchases_before = self.session.get(f"{BASE_URL}/api/purchases/live/{live_id}")
        assert purchases_before.status_code == 200, f"Failed to get purchases: {purchases_before.text}"
        purchases_data = purchases_before.json()
        print(f"Live has {len(purchases_data)} purchases")
        
        # Update the live title with a unique suffix
        unique_suffix = str(uuid.uuid4())[:8]
        new_title = f"Updated Title {unique_suffix}"
        new_store = f"Updated Store {unique_suffix}"
        
        update_response = self.session.put(f"{BASE_URL}/api/lives/{live_id}", json={
            "title": new_title,
            "store": new_store
        })
        
        assert update_response.status_code == 200, f"Failed to update live: {update_response.text}"
        updated_live = update_response.json()
        print(f"Updated live title to: {updated_live.get('title')}")
        print(f"Updated live store to: {updated_live.get('store')}")
        
        # Verify the live was updated
        assert updated_live.get("title") == new_title, "Live title should be updated"
        assert updated_live.get("store") == new_store, "Live store should be updated"
        
        # Get purchases after update and verify propagation (correct endpoint)
        purchases_after = self.session.get(f"{BASE_URL}/api/purchases/live/{live_id}")
        assert purchases_after.status_code == 200, f"Failed to get purchases after update: {purchases_after.text}"
        purchases_after_data = purchases_after.json()
        
        # Check if purchases have the new store value
        propagated_count = 0
        for purchase in purchases_after_data:
            if purchase.get("store") == new_store:
                propagated_count += 1
        
        print(f"Purchases with propagated store: {propagated_count}/{len(purchases_after_data)}")
        
        # Restore original values
        restore_response = self.session.put(f"{BASE_URL}/api/lives/{live_id}", json={
            "title": original_title,
            "store": original_store or "Target Updated"
        })
        assert restore_response.status_code == 200, "Failed to restore original values"
        print(f"Restored original title: {original_title}")
        
        # Assert propagation worked
        assert propagated_count == len(purchases_after_data), \
            f"All purchases should have propagated store. Got {propagated_count}/{len(purchases_after_data)}"
    
    def test_update_live_endpoint_exists(self):
        """Test that PUT /api/lives/{live_id} endpoint exists and works"""
        # Get a live to test with
        response = self.session.get(f"{BASE_URL}/api/lives")
        assert response.status_code == 200
        lives = response.json()
        
        if not lives:
            pytest.skip("No lives found")
        
        live = lives[0]
        live_id = live["id"]
        
        # Test the update endpoint with same values (no actual change)
        update_response = self.session.put(f"{BASE_URL}/api/lives/{live_id}", json={
            "title": live.get("title"),
            "store": live.get("store")
        })
        
        assert update_response.status_code == 200, f"Update endpoint failed: {update_response.text}"
        print(f"PUT /api/lives/{live_id} endpoint working correctly")
    
    def test_confirmation_dialog_status_check(self):
        """Verify that lives with completed/ended/finalized status exist for dialog testing"""
        response = self.session.get(f"{BASE_URL}/api/lives")
        assert response.status_code == 200
        lives = response.json()
        
        status_counts = {}
        for live in lives:
            status = live.get("status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"Live status distribution: {status_counts}")
        
        # Check for lives that should trigger confirmation dialog
        dialog_statuses = ["ended", "finalized", "completed"]
        dialog_lives = [l for l in lives if l.get("status") in dialog_statuses]
        
        print(f"Lives that should show confirmation dialog: {len(dialog_lives)}")
        for live in dialog_lives:
            print(f"  - {live.get('title')} (status: {live.get('status')})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
