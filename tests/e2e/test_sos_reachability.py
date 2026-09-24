import time
import os
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "live_audit")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def test_gps_denied_manual_pin_reachability(viewport, vp_name, base_url="https://frontend-v2-seven-chi.vercel.app"):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Deny geolocation permission explicitly
        context = browser.new_context(
            viewport=viewport,
            permissions=[] # No permissions granted
        )
        page = context.new_page()

        print(f"\n--- Testing GPS Denied & Manual Pin Reachability [{vp_name}: {viewport['width']}x{viewport['height']}] on {base_url} ---")
        
        # 1. Open home page
        page.goto(f"{base_url}/", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # 2. Hold SOS button for 3.5 seconds using page.wait_for_timeout
        sos_btn = page.locator(".homepage-sos-btn")
        box = sos_btn.bounding_box()
        assert box, "SOS button bounding box not found"
        page.mouse.move(box["x"] + box["width"]/2, box["y"] + box["height"]/2)
        page.mouse.down()
        page.wait_for_timeout(3500)
        page.mouse.up()
        
        # Wait for navigation
        page.wait_for_url("**/emergency/new*", timeout=12000)
        page.wait_for_timeout(1500)
        print(f"[{vp_name}] Navigated successfully to: {page.url}")
        assert "emergency/new" in page.url, f"Expected emergency/new in url, got {page.url}"

        # 3. Check Manual Pin button reachability
        drop_pin_btn = page.locator("button:has-text('Drop Pin on Map')")
        assert drop_pin_btn.is_visible(), "Drop Pin on Map button must be visible"

        # Check action bar bounding box
        action_bar = page.locator(".wizard-sticky-action-bar")
        bar_box = action_bar.bounding_box()
        pin_box = drop_pin_btn.bounding_box()

        print(f"[{vp_name}] Pin Button: top={pin_box['y']}, bottom={pin_box['y'] + pin_box['height']}")
        if bar_box:
            print(f"[{vp_name}] Action Bar: top={bar_box['y']}, height={bar_box['height']}")
            # Pin button bottom must be above action bar top (or reachable without overlap)
            assert pin_box["y"] + pin_box["height"] <= bar_box["y"] or pin_box["y"] >= bar_box["y"] + bar_box["height"], \
                f"Overlap detected: pin bottom {pin_box['y'] + pin_box['height']} overlaps bar top {bar_box['y']}"

        # Take screenshot of Step 1 with manual pin visible
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"sos_gps_denied_{vp_name}_step1.png"))
        print(f"[{vp_name}] Saved screenshot: sos_gps_denied_{vp_name}_step1.png")

        # 4. Click Drop Pin on Map
        drop_pin_btn.click()
        page.wait_for_timeout(1000)

        # Confirm Next button is now enabled
        next_btn = page.locator("button:has-text('Next: Clinical Situation')")
        assert next_btn.is_enabled(), "Next button must be enabled after dropping pin"

        # 5. Advance through wizard steps to broadcast
        next_btn.click()
        page.wait_for_timeout(1000)
        print(f"[{vp_name}] Reached Step 2")

        # Step 2: Click Next
        next_step2 = page.locator("button:has-text('Next: Patient Needs')")
        assert next_step2.is_visible()
        next_step2.click()
        page.wait_for_timeout(1000)
        print(f"[{vp_name}] Reached Step 3")

        # Step 3: Click Next
        next_step3 = page.locator("button:has-text('Next: Review & Broadcast')")
        assert next_step3.is_visible()
        next_step3.click()
        page.wait_for_timeout(1000)
        print(f"[{vp_name}] Reached Step 4")

        # Step 4: Verify broadcast button
        broadcast_btn = page.locator("button:has-text('Broadcast Emergency Case')")
        assert broadcast_btn.is_visible()
        print(f"[{vp_name}] Broadcast button is reachable and unobstructed to complete flow!")

        # Screenshot Step 4
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"sos_gps_denied_{vp_name}_step4.png"))
        print(f"[{vp_name}] Saved screenshot: sos_gps_denied_{vp_name}_step4.png")

        browser.close()

if __name__ == "__main__":
    test_gps_denied_manual_pin_reachability({"width": 1280, "height": 720}, "1280x720", "http://localhost:3006")
    test_gps_denied_manual_pin_reachability({"width": 390, "height": 844}, "390x844", "http://localhost:3006")
    print("\n[ALL PASS] SOS and GPS-denied manual pin reachability verified at both viewports!")
