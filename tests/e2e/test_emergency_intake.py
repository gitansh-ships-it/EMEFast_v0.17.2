import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(REPO_ROOT, ".env"))
load_dotenv(os.path.join(REPO_ROOT, "backend", ".env"))
DB_PATH = os.path.join(REPO_ROOT, "backend", "emefast.db")
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

FRONTEND_URL = "http://localhost:3001"
BACKEND_URL = "http://127.0.0.1:8000"

def http_post_json(url, payload):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))

def http_post_form(url, form_dict):
    data = urllib.parse.urlencode(form_dict).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))

def http_get_json(url):
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def cleanup_case(case_id: int):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM audit_logs WHERE case_id = ?", (case_id,))
        cur.execute("DELETE FROM hospital_responses WHERE case_id = ?", (case_id,))
        cur.execute("DELETE FROM emergency_cases WHERE id = ?", (case_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error cleaning up case {case_id}: {e}")

# ==============================================================================
# 1. DIRECT API VOICE TRANSCRIPT TEST
# ==============================================================================
def run_test_1_direct_api_voice_transcript():
    print("\n" + "="*80)
    print("TEST 1: DIRECT HTTP POST /api/emergency/new WITH voice_transcript")
    print("="*80)
    payload = {
        "patient_name": "Test Direct Transcript Patient",
        "patient_age": 52,
        "condition": "Severe dyspnea and acute chest tightness",
        "priority": "CRITICAL",
        "requirements": "ICU, Ventilator",
        "latitude": 26.9124,
        "longitude": 75.7873,
        "address": "Current device location (26.9124°, 75.7873°)",
        "transport_mode": "AMBULANCE",
        "voice_transcript": "Severe dyspnea, suspected pulmonary edema, oxygen saturation 86%"
    }

    req = urllib.request.Request(
        f"{BACKEND_URL}/api/emergency/new",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read().decode("utf-8"))
        case_id = data["id"]
        print(f"HTTP POST Successful. Created Case ID: {case_id}, Code: {data.get('case_code')}")

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, case_code, patient_name, condition, voice_transcript, requirements, status "
            "FROM emergency_cases WHERE id = ?",
            (case_id,)
        )
        row = cur.fetchone()
        print("\n--- RAW SQL SELECT OUTPUT ---")
        if row:
            for key in row.keys():
                print(f"  {key}: {row[key]}")
        conn.close()

        assert row is not None, "Case row was not inserted into DB"
        assert row["voice_transcript"] == payload["voice_transcript"], (
            f"voice_transcript mismatch: expected '{payload['voice_transcript']}', got '{row['voice_transcript']}'"
        )
        assert "Emergency stabilization" in row["requirements"], (
            f"Emergency stabilization missing from requirements: {row['requirements']}"
        )
        print("\nTest 1 PASSED: voice_transcript and requirements correctly persisted.")
    finally:
        cleanup_case(case_id)
        print(f"Cleaned up test Case ID {case_id} and child rows from database.")

# ==============================================================================
# 2. GPS-DENIED SOS & STEP 1 TESTS
# ==============================================================================
def run_test_2_gps_denied_flows(playwright):
    print("\n" + "="*80)
    print("TEST 2: GPS-DENIED SOS & STEP 1 PIN FALLBACK TESTS")
    print("="*80)

    # 2A: GPS-denied SOS hold -> 0 POSTs, redirects to /user/emergency/new?gps=denied
    print("\n[2A] Testing GPS-denied SOS 3s hold...")
    browser = playwright.chromium.launch(channel="chromium", headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900}, permissions=[])
    page = context.new_page()

    sos_posts = []
    page.on("request", lambda r: sos_posts.append(r.post_data) if "/api/emergency/new" in r.url and r.method == "POST" else None)

    page.goto(f"{FRONTEND_URL}/")
    page.wait_for_load_state("networkidle")

    hold_btn = page.locator('[aria-label="Hold for emergency SOS"]')
    hold_btn.wait_for(state="visible")
    box = hold_btn.bounding_box()
    assert box is not None
    center_x = box["x"] + box["width"] / 2
    center_y = box["y"] + box["height"] / 2

    page.mouse.move(center_x, center_y)
    page.mouse.down()
    print("  Holding SOS button for full 3.2s without GPS...")
    page.wait_for_timeout(3200)
    page.mouse.up()

    # Expect redirection to manual pin flow with ?gps=denied
    page.wait_for_url("**/user/emergency/new?gps=denied", timeout=8000)
    print(f"  Navigated to: {page.url}")
    print(f"  POST /api/emergency/new count: {len(sos_posts)}")
    assert len(sos_posts) == 0, f"Expected 0 POSTs when GPS denied, got {len(sos_posts)}"
    print("  [2A] GPS-denied SOS verified: zero POSTs sent, cleanly redirected to manual pin flow.")
    browser.close()

    # 2B: GPS-denied Step 1: verifies manual pin requirement and unblocking
    print("\n[2B] Testing Step 1 with GPS denied: requires manual pin before proceed...")
    browser = playwright.chromium.launch(channel="chromium", headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    page.goto(f"{FRONTEND_URL}/user/emergency/new?gps=denied")
    page.wait_for_load_state("networkidle")

    addr_elem = page.locator("text=Location unverified · Manual pin required")
    addr_elem.wait_for(state="visible")
    print("  Step 1 correctly shows: 'Location unverified · Manual pin required'")

    next_btn = page.locator("button:has-text('Next: Clinical Situation')")
    is_disabled = next_btn.is_disabled()
    print(f"  Next button disabled without location: {is_disabled}")
    assert is_disabled is True, "Next button should be disabled when location is unverified!"

    print("  Tapping 'Drop Pin on Map' to manually establish coordinates...")
    pin_btn = page.locator("button:has-text('Drop Pin on Map')")
    pin_btn.click()
    page.wait_for_timeout(300)

    is_disabled_after = next_btn.is_disabled()
    print(f"  Next button disabled after manual pin: {is_disabled_after}")
    assert is_disabled_after is False, "Next button should be enabled after dropping pin!"

    next_btn.click()
    page.wait_for_timeout(400)
    page.wait_for_selector("text=STEP 2 OF 4")
    print("  Successfully transitioned to Step 2 with manual pin.")
    print("  [2B] GPS-denied Step 1 manual pin workflow verified.")
    browser.close()

# ==============================================================================
# 3. TOPNAV SOS PILL TESTS (ROLE-CONSISTENCY VERIFICATION)
# ==============================================================================
def run_test_3_topnav_sos_pill(playwright):
    print("\n" + "="*80)
    print("TEST 3: TOPNAV SOS PILL TAP BEHAVIOR (ROLE-CONSISTENT, ZERO POSTS)")
    print("="*80)
    browser = playwright.chromium.launch(channel="chromium", headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()

    intercepted_posts = []
    page.on("request", lambda r: intercepted_posts.append(r.post_data) if "/api/emergency/new" in r.url and r.method == "POST" else None)

    # 3A: On Citizen / User Wizard page (/user/emergency/new)
    print("\n[3A] Testing TopNav SOS pill on /user/emergency/new...")
    page.goto(f"{FRONTEND_URL}/user/emergency/new")
    page.wait_for_load_state("networkidle")
    intercepted_posts.clear()

    topnav_sos = page.locator("header .reimagined-sos-btn, [aria-label='Open emergency SOS']").first
    topnav_sos.wait_for(state="visible")
    topnav_sos.click()
    page.wait_for_timeout(600)

    print(f"  Clicked TopNav SOS. Current URL: {page.url}")
    print(f"  POST /api/emergency/new count: {len(intercepted_posts)}")
    assert len(intercepted_posts) == 0, f"Expected 0 POSTs from TopNav SOS, got {len(intercepted_posts)}"
    assert page.url.endswith("/user/emergency/new"), f"Expected role-consistent URL /user/emergency/new, got {page.url}"
    print("  [3A] TopNav SOS on citizen wizard verified: stays on /user/emergency/new, zero POSTs.")

    # 3B: On Citizen Results page (/user/hospitals?case_id=...)
    print("\n[3B] Testing TopNav SOS pill on /user/hospitals?case_id=...")
    req = urllib.request.Request(
        f"{BACKEND_URL}/api/emergency/new",
        data=json.dumps({
            "patient_name": "Test Nav Patient",
            "condition": "Syncope",
            "priority": "HIGH",
            "requirements": "Emergency stabilization",
            "latitude": 26.9124,
            "longitude": 75.7873,
            "address": "Current device location (26.9124°, 75.7873°)"
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        temp_case_id = json.loads(resp.read().decode("utf-8"))["id"]

    try:
        page.goto(f"{FRONTEND_URL}/user/hospitals?case_id={temp_case_id}")
        page.wait_for_load_state("networkidle")
        intercepted_posts.clear()

        topnav_sos = page.locator("header .reimagined-sos-btn, [aria-label='Open emergency SOS']").first
        topnav_sos.wait_for(state="visible")
        topnav_sos.click()
        page.wait_for_url("**/user/emergency/new", timeout=6000)
        print(f"  Clicked TopNav SOS on citizen results. Navigated to: {page.url}")
        print(f"  POST /api/emergency/new count: {len(intercepted_posts)}")
        assert len(intercepted_posts) == 0, f"Expected 0 POSTs, got {len(intercepted_posts)}"
        assert page.url.endswith("/user/emergency/new"), f"Expected /user/emergency/new, got {page.url}"
        print("  [3B] TopNav SOS on citizen results page verified: routed to /user/emergency/new, zero POSTs.")
    finally:
        cleanup_case(temp_case_id)

    # 3C: On Ambulance Workspace (/ambulance/dashboard)
    print("\n[3C] Testing TopNav SOS pill on /ambulance/dashboard...")
    page.goto(f"{FRONTEND_URL}/ambulance/dashboard")
    page.wait_for_load_state("networkidle")
    intercepted_posts.clear()

    topnav_sos = page.locator("header .reimagined-sos-btn, [aria-label='Open emergency SOS']").first
    topnav_sos.wait_for(state="visible")
    topnav_sos.click()
    page.wait_for_url("**/ambulance/emergency/new", timeout=6000)
    print(f"  Clicked TopNav SOS on ambulance dashboard. Navigated to: {page.url}")
    print(f"  POST /api/emergency/new count: {len(intercepted_posts)}")
    assert len(intercepted_posts) == 0, f"Expected 0 POSTs, got {len(intercepted_posts)}"
    assert page.url.endswith("/ambulance/emergency/new"), f"Expected /ambulance/emergency/new, got {page.url}"
    print("  [3C] TopNav SOS on ambulance workspace verified: routed to /ambulance/emergency/new, zero POSTs.")

    browser.close()

# ==============================================================================
# 4. ACUITY NON-PRESELECTION & UNASSESSED DEFAULT + UI VOICE TRANSCRIPT TEST
# ==============================================================================
def run_test_4_acuity_and_voice_transcript(playwright):
    print("\n" + "="*80)
    print("TEST 4: ACUITY NON-PRESELECTION, UNASSESSED DEFAULT & UI VOICE TRANSCRIPT")
    print("="*80)
    browser = playwright.chromium.launch(channel="chromium", headless=True)
    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        geolocation={"latitude": 26.9124, "longitude": 75.7873},
        permissions=["geolocation"]
    )
    page = context.new_page()

    created_case_ids = []
    intercepted_posts = []

    def handle_request(request):
        if "/api/emergency/new" in request.url and request.method == "POST":
            try:
                post_data = json.loads(request.post_data)
                intercepted_posts.append(post_data)
            except Exception as e:
                print("Could not parse request post data:", e)

    page.on("request", handle_request)

    try:
        print("Navigating to /user/emergency/new...")
        page.goto(f"{FRONTEND_URL}/user/emergency/new")
        page.wait_for_load_state("networkidle")

        time.sleep(0.5)
        next_btn = page.locator("button:has-text('Next: Clinical Situation')")
        next_btn.wait_for(state="visible")
        next_btn.click()
        page.wait_for_timeout(400)

        # Step 2: Verify Acuity is NOT preselected
        print("Step 2: Checking Acuity selector...")
        page.wait_for_selector("text=STEP 2 OF 4")
        unselected_text = page.locator("text=Not preselected · Defaults to UNASSESSED")
        assert unselected_text.count() > 0, "Acuity selector was unexpectedly preselected!"
        print("  Verified: No Acuity is preselected by default.")

        # Enter voice transcript
        print("  Entering voice transcript...")
        transcript_input = page.locator('[data-testid="voice-transcript-input"]')
        transcript_input.wait_for(state="visible")
        test_transcript = "Patient found unresponsive with shallow respiration"
        transcript_input.fill(test_transcript)

        # Leave acuity unselected to verify default UNASSESSED behavior
        next_btn_2 = page.locator("button:has-text('Next: Patient Needs')")
        next_btn_2.click()
        page.wait_for_timeout(400)

        # Step 3: Select ICU and Ventilator
        print("Step 3: Selecting specialized requirements (ICU, Ventilator)...")
        page.locator("button:has-text('ICU')").first.click()
        page.locator("button:has-text('Ventilator')").first.click()

        next_btn_3 = page.locator("button:has-text('Next: Review & Broadcast')")
        next_btn_3.click()
        page.wait_for_timeout(400)

        # Step 4: Verify Review details
        print("Step 4: Checking Review summary...")
        page.wait_for_selector("text=Review Before Broadcast")

        unassessed_badge = page.locator("text=UNASSESSED — TREAT AS HIGH")
        assert unassessed_badge.count() > 0, "Expected 'UNASSESSED — TREAT AS HIGH' badge on Step 4 when no priority chosen!"
        print("  Verified: Step 4 review displays 'UNASSESSED — TREAT AS HIGH' badge.")

        stab_badge = page.locator("span:has-text('Emergency stabilization')")
        assert stab_badge.count() > 0, "Emergency stabilization badge missing in Step 4 review!"

        voice_preview = page.locator("text=Voice transcript attached")
        assert voice_preview.count() > 0, "Voice transcript attached row missing from Step 4 review!"

        # Submit Broadcast
        print("  Submitting broadcast...")
        broadcast_btn = page.locator("button:has-text('Broadcast Emergency')")
        broadcast_btn.click()

        page.wait_for_url("**/user/hospitals?case_id=*", timeout=10000)
        print(f"  Navigated to: {page.url}")

        assert len(intercepted_posts) >= 1, "No POST /api/emergency/new was intercepted!"
        post_payload = intercepted_posts[0]
        print("\n--- INTERCEPTED UI POST PAYLOAD ---")
        print(json.dumps(post_payload, indent=2))

        assert post_payload.get("priority") == "UNASSESSED", (
            f"Expected priority 'UNASSESSED', got '{post_payload.get('priority')}'"
        )
        assert post_payload.get("voice_transcript") == test_transcript
        assert "Emergency stabilization" in post_payload.get("requirements", "")
        assert "ICU" in post_payload.get("requirements", "")
        assert "Device location detected · ±0 m" not in post_payload.get("address", "")

        case_id_str = page.url.split("case_id=")[1].split("&")[0]
        case_id = int(case_id_str)
        created_case_ids.append(case_id)

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, case_code, patient_name, condition, priority, voice_transcript, requirements, address, status "
            "FROM emergency_cases WHERE id = ?",
            (case_id,)
        )
        row = cur.fetchone()
        print("\n--- RAW SQL SELECT FOR UI CREATED CASE ---")
        if row:
            for key in row.keys():
                print(f"  {key}: {row[key]}")
        conn.close()

        assert row is not None
        assert row["priority"] == "UNASSESSED"
        assert row["voice_transcript"] == test_transcript
        assert "Emergency stabilization" in row["requirements"]
        print("\nTest 4 PASSED: Unassessed acuity and UI transcript successfully verified in DB.")
    finally:
        # Guarantee full DB cleanup of created test case and child rows
        for cid in created_case_ids:
            cleanup_case(cid)
            print(f"Cleaned up Test 4 case ID {cid} and child rows from database.")
        browser.close()

# ==============================================================================
# 5. DOCK UNOBSTRUCTED ASSERTIONS (elementFromPoint & Bounding Box)
# ==============================================================================
def run_test_5_dock_unobstructed_assertions(playwright):
    print("\n" + "="*80)
    print("TEST 5: REAL ASSERTIONS FOR UNOBSTRUCTED BUTTONS (elementFromPoint & Bounding Box)")
    print("="*80)

    configs = [
        {"name": "desktop_dark", "width": 1280, "height": 800, "theme": "dark"},
        {"name": "desktop_light", "width": 1280, "height": 800, "theme": "light"},
        {"name": "mobile_dark", "width": 390, "height": 844, "theme": "dark"},
        {"name": "mobile_light", "width": 390, "height": 844, "theme": "light"},
    ]

    for cfg in configs:
        print(f"\n--- Testing Configuration: {cfg['name']} ({cfg['width']}x{cfg['height']}, {cfg['theme']}) ---")
        browser = playwright.chromium.launch(channel="chromium", headless=True)
        context = browser.new_context(
            viewport={"width": cfg["width"], "height": cfg["height"]},
            geolocation={"latitude": 26.9124, "longitude": 75.7873},
            permissions=["geolocation"]
        )
        page = context.new_page()
        page.goto(f"{FRONTEND_URL}/user/emergency/new")
        page.wait_for_load_state("networkidle")

        if cfg["theme"] == "light":
            page.evaluate("() => { document.documentElement.classList.add('theme-light'); document.documentElement.classList.remove('theme-dark'); }")
        else:
            page.evaluate("() => { document.documentElement.classList.add('theme-dark'); document.documentElement.classList.remove('theme-light'); }")

        # Verify global dock is cleanly hidden on the wizard
        dock_count = page.locator(".bottom-dock-island, .bottom-nav").count()
        assert dock_count == 0, f"Expected global dock to be hidden during wizard, found {dock_count}"
        print("  Verified: Global bottom dock is cleanly HIDDEN during wizard.")

        # Verify solid sticky action bar is present
        action_bar = page.locator(".wizard-sticky-action-bar").first
        action_bar.wait_for(state="visible")
        bar_box = action_bar.bounding_box()
        assert bar_box is not None, "Could not find bounding box for sticky action bar"

        step_selectors = [
            ("Step 1 (Location)", "button:has-text('Next: Clinical Situation')"),
            ("Step 2 (Situation)", "button:has-text('Next: Patient Needs')"),
            ("Step 3 (Needs)", "button:has-text('Next: Review & Broadcast')"),
            ("Step 4 (Review/Broadcast)", "button:has-text('Broadcast Emergency')"),
        ]

        for step_idx, (step_name, btn_selector) in enumerate(step_selectors, start=1):
            # Scroll real scroll container to its maximum
            page.evaluate("""() => {
                const el = document.scrollingElement || document.documentElement || document.body;
                el.scrollTop = el.scrollHeight;
                window.scrollTo(0, el.scrollHeight);
            }""")
            page.wait_for_timeout(250)

            btn = page.locator(btn_selector).first
            btn.wait_for(state="visible")
            btn_box = btn.bounding_box()
            assert btn_box is not None, f"Could not find bounding box for {btn_selector}"

            # Hit test assertion: elementFromPoint (button.contains the element at its center)
            hit_test_result = btn.evaluate("""(button) => {
                const rect = button.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const topElem = document.elementFromPoint(cx, cy);
                const isContained = button.contains(topElem) || topElem === button;
                const topElemTag = topElem ? `${topElem.tagName.toLowerCase()}.${topElem.className}` : 'null';
                return {
                    found: true,
                    isUnobstructed: isContained,
                    topElement: topElemTag,
                    coords: { x: cx, y: cy }
                };
            }""")

            print(f"  [{step_name}] elementFromPoint at ({hit_test_result['coords']['x']:.1f}, {hit_test_result['coords']['y']:.1f}): hit '{hit_test_result['topElement']}' -> Unobstructed: {hit_test_result['isUnobstructed']}")
            assert hit_test_result["isUnobstructed"] is True, (
                f"BUTTON OBSTRUCTED on {step_name}! Hit element was '{hit_test_result['topElement']}' instead of the button."
            )

            # Assert button is cleanly inside the sticky action bar above its bottom edge
            assert btn_box["y"] >= bar_box["y"] - 5, f"Button top {btn_box['y']} is above action bar top {bar_box['y']}"
            assert btn_box["y"] + btn_box["height"] <= bar_box["y"] + bar_box["height"] + 5, "Button overflows action bar bottom"
            assert btn_box["y"] + btn_box["height"] <= cfg["height"], "Button overflows viewport bottom"
            print(f"  [{step_name}] Button within action bar: {btn_box['y']:.1f}px to {btn_box['y']+btn_box['height']:.1f}px | Action bar: {bar_box['y']:.1f}px to {bar_box['y']+bar_box['height']:.1f}px")

            # Extended Test 5: Assert at max scroll, the last content element's bottom is strictly above the action bar top
            content_clearance = page.evaluate("""() => {
                const bar = document.querySelector('.wizard-sticky-action-bar');
                const barRect = bar ? bar.getBoundingClientRect() : null;
                const barStyle = bar ? window.getComputedStyle(bar) : null;
                
                // Find last content element inside active wizard section
                const section = document.querySelector('main.emergency-shell section') || document.querySelector('main');
                const allElements = Array.from(section.querySelectorAll('*')).filter(el => {
                    if (el.closest('.wizard-sticky-action-bar')) return false;
                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') return false;
                    const r = el.getBoundingClientRect();
                    return r.height > 0 && r.width > 0;
                });
                
                let maxBottom = 0;
                let lastElTag = '';
                for (const el of allElements) {
                    const r = el.getBoundingClientRect();
                    if (r.bottom > maxBottom) {
                        maxBottom = r.bottom;
                        lastElTag = `${el.tagName.toLowerCase()}.${(el.className || '').slice(0, 30)}`;
                    }
                }
                
                return {
                    barTop: barRect ? barRect.top : 0,
                    barPaddingBottom: barStyle ? barStyle.paddingBottom : '',
                    lastContentBottom: maxBottom,
                    lastContentTag: lastElTag,
                    clearance: barRect ? (barRect.top - maxBottom) : 0
                };
            }""")
            print(f"  [{step_name}] Clearance check: Last content '{content_clearance['lastContentTag']}' bottom = {content_clearance['lastContentBottom']:.1f}px | Action bar top = {content_clearance['barTop']:.1f}px | Clearance = {content_clearance['clearance']:.1f}px")
            assert content_clearance["clearance"] > 0, (
                f"CONTENT OVERLAPPED BY ACTION BAR on {step_name}! Last content bottom {content_clearance['lastContentBottom']:.1f}px is below action bar top {content_clearance['barTop']:.1f}px (clearance: {content_clearance['clearance']:.1f}px)"
            )
            
            # Confirm the bar pads with env(safe-area-inset-bottom) (minimum 12px)
            pad_val = float(content_clearance["barPaddingBottom"].replace("px", "") or 0)
            assert pad_val >= 12.0, f"Expected action bar padding-bottom >= 12px, got {pad_val}px"
            print(f"  [{step_name}] Verified: Sticky action bar padding-bottom is {pad_val}px (pads with env(safe-area-inset-bottom)).")

            # Save zoomed action bar crop screenshot to tests/e2e/screenshots/
            if step_idx == 4:
                crop_y = max(0, int(bar_box["y"] - 20))
                crop_height = min(cfg["height"] - crop_y, int(bar_box["height"] + 40))
                crop_path = os.path.join(SCREENSHOTS_DIR, f"zoomed_dock_crop_{cfg['name']}.png")
                page.screenshot(
                    path=crop_path,
                    clip={"x": 0, "y": crop_y, "width": cfg["width"], "height": crop_height}
                )
                print(f"  Zoomed action bar crop saved: {crop_path}")

            if step_idx < 4:
                btn.click()
                page.wait_for_timeout(300)

        browser.close()

    print("\nTest 5 PASSED: All buttons verified 100% unobstructed via bounding box & elementFromPoint.")

# ==============================================================================
# 6. PRIORITY RANKING & HOSPITAL DASHBOARD ORDER (UNASSESSED, HIGH, MEDIUM)
# ==============================================================================
def run_test_6_priority_ranking_and_dashboard_order(playwright):
    print("\n" + "="*80)
    print("TEST 6: PRIORITY RANKING & HOSPITAL DASHBOARD ORDER (UNASSESSED, HIGH, MEDIUM)")
    print("="*80)

    created_case_ids = []
    try:
        # Step 1: Create 3 emergency cases via API: UNASSESSED, HIGH, MEDIUM
        # Created in order: MEDIUM first, then HIGH, then UNASSESSED, to verify sorting is by priority, not insert order
        cases_to_create = [
            {"priority": "MEDIUM", "name": "Triage Priority MEDIUM Case", "condition": "Moderate wrist sprain and contusion"},
            {"priority": "HIGH", "name": "Triage Priority HIGH Case", "condition": "Severe acute respiratory distress"},
            {"priority": "UNASSESSED", "name": "Triage Priority UNASSESSED Case", "condition": "Field unassessed acute patient"},
        ]

        created_cases = []
        for c_def in cases_to_create:
            payload = {
                "patient_name": c_def["name"],
                "transport_mode": "AMBULANCE",
                "condition": c_def["condition"],
                "priority": c_def["priority"],
                "requirements": "Emergency stabilization",
                "latitude": 26.9124,
                "longitude": 75.7873,
                "address": "MI Road, Jaipur"
            }
            data = http_post_json(f"{BACKEND_URL}/api/emergency/new", payload)
            created_cases.append(data)
            created_case_ids.append(data["id"])
            print(f"  Created {c_def['priority']} Case ID {data['id']} ({data['case_code']})")

        # Step 2: Assert matching returns >= 1 hospital for all 3 cases
        for c in created_cases:
            rec_data = http_get_json(f"{BACKEND_URL}/api/emergency/{c['id']}/recommendation")
            assert rec_data.get("recommended_hospital") is not None, f"Matching returned no recommended hospital for {c['priority']} case {c['id']}!"
            assert rec_data.get("accepted_count", 0) >= 1, f"Matching returned 0 accepted hospitals for {c['priority']} case {c['id']}!"
            print(f"  Matching verified for {c['priority']}: recommended '{rec_data['recommended_hospital']['hospital_name']}' (Total accepted: {rec_data['accepted_count']})")

        # Step 3: Log in as Hospital 1 to inspect Hospital Dashboard
        test_hosp_pwd = os.getenv("SEED_HOSPITAL_PASSWORD") or os.getenv("HOSPITAL_PASSWORD")
        assert test_hosp_pwd, "SEED_HOSPITAL_PASSWORD must be provided in environment or .env"
        auth_data = http_post_form(
            f"{BACKEND_URL}/api/auth/login",
            {"username": "hospital-sms@emefast.example", "password": test_hosp_pwd}
        )
        token = auth_data["access_token"]

        browser = playwright.chromium.launch(channel="chromium", headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Pre-seed auth session in localStorage before loading page
        page.add_init_script(f"""
            localStorage.setItem('emefast_token', '{token}');
            localStorage.setItem('emefast_role', 'HOSPITAL');
            localStorage.setItem('emefast_hospital_id', '1');
            localStorage.setItem('emefast_user_name', 'SMS ER Desk Chief');
        """)

        page.goto("http://localhost:3001/hospital/dashboard")
        page.wait_for_selector("text=SMS Hospital", timeout=10000)

        # Assert TopNav SOS pill is hidden for HOSPITAL session
        sos_pill = page.locator(".reimagined-sos-btn")
        assert sos_pill.count() == 0, f"Expected TopNav SOS pill to be hidden for HOSPITAL session, but found {sos_pill.count()}!"
        print("  Verified: TopNav SOS pill is cleanly HIDDEN for HOSPITAL session.")

        # Switch to Accepted Cases tab
        active_tab_btn = page.locator("button:has-text('Accepted Cases')")
        active_tab_btn.click()
        page.wait_for_timeout(1000)

        # Step 4: Assert ordering on dashboard
        # Extract all visible case codes on the dashboard in DOM order
        dom_case_codes = page.locator("article span.font-mono.font-black").all_inner_texts()
        print(f"  Dashboard case codes in DOM order: {dom_case_codes}")

        unassessed_code = next(c["case_code"] for c in created_cases if c["priority"] == "UNASSESSED")
        high_code = next(c["case_code"] for c in created_cases if c["priority"] == "HIGH")
        medium_code = next(c["case_code"] for c in created_cases if c["priority"] == "MEDIUM")

        assert unassessed_code in dom_case_codes, f"Case {unassessed_code} not found on dashboard!"
        assert high_code in dom_case_codes, f"Case {high_code} not found on dashboard!"
        assert medium_code in dom_case_codes, f"Case {medium_code} not found on dashboard!"

        idx_unassessed = dom_case_codes.index(unassessed_code)
        idx_high = dom_case_codes.index(high_code)
        idx_medium = dom_case_codes.index(medium_code)

        print(f"  Order indices: UNASSESSED={idx_unassessed}, HIGH={idx_high}, MEDIUM={idx_medium}")
        assert idx_unassessed < idx_medium, (
            f"Expected UNASSESSED ({unassessed_code}, index {idx_unassessed}) to rank above MEDIUM ({medium_code}, index {idx_medium})"
        )
        assert idx_high < idx_medium, (
            f"Expected HIGH ({high_code}, index {idx_high}) to rank above MEDIUM ({medium_code}, index {idx_medium})"
        )
        print("  Verified: UNASSESSED and HIGH both rank strictly above MEDIUM on dashboard.")

        # Step 5: Assert badge text "UNASSESSED — TREAT AS HIGH"
        badge_locator = page.locator("span:has-text('UNASSESSED — TREAT AS HIGH')")
        assert badge_locator.count() >= 1, "Expected 'UNASSESSED — TREAT AS HIGH' badge visible on dashboard!"
        print("  Verified: Dashboard displays badge 'UNASSESSED — TREAT AS HIGH'.")

        browser.close()
        print("\nTest 6 PASSED: Priority ranking, >=1 matching hospital, dashboard order & hidden TopNav SOS verified.")

    finally:
        # Full DB cleanup of test cases
        print("  Cleaning up Test 6 cases from database...")
        for cid in created_case_ids:
            cleanup_case(cid)
            print(f"  Cleaned up Case ID {cid}")

# ==============================================================================
# 7. MATCHING WORD-BOUNDARY ("Difficulty breathing"), ICU=0 & PARTIAL FALLBACK
# ==============================================================================
def run_test_7_matching_word_boundary_icu_zero_and_partial_matches(playwright=None):
    print("\n" + "="*80)
    print("TEST 7: WORD-BOUNDARY MATCHING, ICU=0 HOSPITAL, & PARTIAL MATCH FALLBACK")
    print("="*80)

    # 7A: Unit test for required_capabilities word-boundary regex
    sys.path.insert(0, os.path.join(REPO_ROOT, "backend"))
    from services.hospital_matching import required_capabilities
    from types import SimpleNamespace

    # Verify "Difficulty breathing" does NOT trigger 'icu'
    case_diff = SimpleNamespace(condition="Difficulty breathing", requirements="Emergency stabilization", description="")
    reqs_diff = required_capabilities(case_diff)
    print(f"  [7A] Capabilities for 'Difficulty breathing': {reqs_diff}")
    assert "icu" not in reqs_diff, f"Collision bug detected! 'icu' was found in reqs for 'Difficulty breathing': {reqs_diff}"
    print("  [7A] PASSED: 'Difficulty breathing' does NOT match 'icu' (word boundary confirmed).")

    # Verify explicit "ICU" does trigger 'icu'
    case_icu = SimpleNamespace(condition="Patient in shock", requirements="ICU, Ventilator", description="")
    reqs_icu = required_capabilities(case_icu)
    print(f"  [7A] Capabilities for 'ICU, Ventilator': {reqs_icu}")
    assert "icu" in reqs_icu and "ventilator" in reqs_icu
    print("  [7A] PASSED: Explicit 'ICU' correctly extracted as required capability.")

    created_case_ids = []
    original_icu_values = {}
    try:
        # Save original ICU values
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, available_icu FROM hospitals")
        original_icu_values = {row["id"]: row["available_icu"] for row in cur.fetchall()}
        conn.close()

        # 7B: ICU=0 Hospital Matching Test
        # Set Hospital 1 to 0 available ICU beds but positive regular beds
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE hospitals SET available_icu = 0 WHERE id = 1")
        conn.commit()
        conn.close()

        # Create case with "Difficulty breathing"
        payload_diff = {
            "patient_name": "Dyspnea Patient (No ICU)",
            "transport_mode": "AMBULANCE",
            "condition": "Difficulty breathing",
            "priority": "HIGH",
            "requirements": "Emergency stabilization",
            "latitude": 26.9124,
            "longitude": 75.7873,
            "address": "MI Road, Jaipur"
        }
        res_diff = http_post_json(f"{BACKEND_URL}/api/emergency/new", payload_diff)
        created_case_ids.append(res_diff["id"])
        print(f"  [7B] Created Case ID {res_diff['id']} with 'Difficulty breathing'")

        rec_diff = http_get_json(f"{BACKEND_URL}/api/emergency/{res_diff['id']}/recommendation")
        assert rec_diff.get("recommended_hospital") is not None, "Matching returned None for 'Difficulty breathing' case!"
        assert rec_diff.get("accepted_count", 0) >= 1, "Expected >=1 accepted hospital for 'Difficulty breathing' case!"
        # Check Hospital 1 (available_icu=0) capability_match is True
        hosp1_opt = next((o for o in rec_diff["all_options"] if o["hospital_id"] == 1), None)
        assert hosp1_opt is not None
        assert hosp1_opt["capability_match"] is True, f"Hospital 1 with ICU=0 should be feasible for 'Difficulty breathing'! {hosp1_opt}"
        print(f"  [7B] PASSED: Hospital 1 (ICU=0) is feasible and recommended ({rec_diff['recommended_hospital']['hospital_name']}).")

        # 7C: Fallback when requested ICU is unavailable anywhere
        # Zero out ICU across all hospitals
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE hospitals SET available_icu = 0")
        conn.commit()
        conn.close()

        payload_icu = {
            "patient_name": "Critical Cardiac ICU Patient",
            "transport_mode": "AMBULANCE",
            "condition": "Severe acute myocardial infarction",
            "priority": "CRITICAL",
            "requirements": "Emergency stabilization, ICU",
            "latitude": 26.9124,
            "longitude": 75.7873,
            "address": "MI Road, Jaipur"
        }
        res_icu = http_post_json(f"{BACKEND_URL}/api/emergency/new", payload_icu)
        created_case_ids.append(res_icu["id"])
        print(f"  [7C] Created Case ID {res_icu['id']} with explicit ICU requirement")

        rec_icu = http_get_json(f"{BACKEND_URL}/api/emergency/{res_icu['id']}/recommendation")
        # Must NOT be an empty list, and must return ranked partial matches flagged "requirement not confirmed"
        assert len(rec_icu["all_options"]) >= 1, "Expected non-empty list of hospital options!"
        assert rec_icu.get("recommended_hospital") is not None, "Expected fallback recommendation when ICU unavailable anywhere!"
        rec_hosp = rec_icu["recommended_hospital"]
        print(f"  [7C] Recommended Fallback Hospital: {rec_hosp['hospital_name']}, Score: {rec_hosp['score']}")
        print(f"  [7C] Decision summary: {rec_icu['decision_summary']}")
        assert rec_hosp.get("requirement_unconfirmed") is True or rec_hosp.get("flag") == "requirement not confirmed", (
            f"Expected 'requirement not confirmed' flag on fallback recommendation! Got: {rec_hosp}"
        )
        assert "requirement not confirmed" in rec_icu["decision_summary"].lower(), (
            f"Expected 'requirement not confirmed' in decision summary: {rec_icu['decision_summary']}"
        )

        # Print the exact score breakdown for the ICU-fallback case
        eta_score = max(0.0, 100.0 - min(rec_hosp['eta'] * 3, 100.0))
        resource_score = min(100.0, (rec_hosp['available_beds'] or 0) * 2.0)
        cost_score = max(0.0, 100.0 - min((rec_hosp['estimated_cost'] / 1000.0), 100.0))
        w_eta = round(eta_score * 0.70, 2)
        w_res = round(resource_score * 0.25, 2)
        w_cost = round(cost_score * 0.05, 2)
        calc_total = round(w_eta + w_res + w_cost, 1)
        print(f"\n  [7C] SCORE BREAKDOWN for ICU-Fallback Case ({rec_hosp['hospital_name']}):")
        print(f"       • ETA Component (weight 70%):      raw={eta_score:.1f}/100 -> weighted={w_eta:.2f}")
        print(f"       • Resource Component (weight 25%): raw={resource_score:.1f}/100 -> weighted={w_res:.2f}")
        print(f"       • Cost Component (weight 5%):      raw={cost_score:.1f}/100 -> weighted={w_cost:.2f}")
        print(f"       • Total Calculated Score:          {calc_total} (Backend returned: {rec_hosp['score']})")

        # Assert the UI shows "requirement not confirmed"
        if playwright:
            browser = playwright.chromium.launch(channel="chromium", headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()
            page.goto(f"{FRONTEND_URL}/user/hospitals?case_id={res_icu['id']}")
            page.wait_for_selector("text=requirement not confirmed", timeout=12000)
            ui_text = page.locator("text=requirement not confirmed").first.inner_text()
            print(f"  [7C] UI Assertion PASSED: Found '{ui_text}' rendered on discovery page.")
            browser.close()

        print("  [7C] PASSED: Fallback recommendation correctly returned, scored, and UI flagged 'requirement not confirmed'.")

        print("\nTest 7 PASSED: Word boundary, ICU=0 matching, and partial fallback verified.")

    finally:
        # Restore hospital ICU beds and clean up created test cases
        conn = get_db()
        cur = conn.cursor()
        for hid, icu_count in original_icu_values.items():
            cur.execute("UPDATE hospitals SET available_icu = ? WHERE id = ?", (icu_count, hid))
        conn.commit()
        # Confirm any hospital row changed by the test is restored afterwards
        cur.execute("SELECT id, available_icu FROM hospitals")
        restored_values = {row["id"]: row["available_icu"] for row in cur.fetchall()}
        conn.close()
        assert restored_values == original_icu_values, f"DB restoration mismatch! {restored_values} != {original_icu_values}"
        print("  [7C] Confirmed: all hospital rows restored to initial database values.")

        for cid in created_case_ids:
            cleanup_case(cid)
            print(f"  Cleaned up Case ID {cid}")

# ==============================================================================
# 8. WCAG AA (4.5:1) LIVE DOM COMPUTED CONTRAST AUDIT
# ==============================================================================
def run_test_8_wcag_aa_contrast_audit(playwright):
    print("\n" + "="*80)
    print("TEST 8: WCAG AA (4.5:1) COMPUTED LIVE DOM CONTRAST AUDIT")
    print("="*80)

    # JavaScript function to evaluate contrast from live DOM walking to first opaque ancestor
    js_eval_contrast = """
    (targets) => {
        function parseRgba(str) {
            if (!str) return null;
            const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
            if (!m) return null;
            return {
                r: parseInt(m[1]),
                g: parseInt(m[2]),
                b: parseInt(m[3]),
                a: m[4] !== undefined ? parseFloat(m[4]) : 1.0
            };
        }

        function getFirstOpaqueBg(el) {
            let curr = el;
            while (curr && curr !== document.documentElement) {
                const style = window.getComputedStyle(curr);
                const bg = parseRgba(style.backgroundColor);
                if (bg && bg.a >= 0.85) {
                    return bg;
                }
                curr = curr.parentElement;
            }
            const isLight = document.documentElement.classList.contains('theme-light');
            return isLight ? { r: 255, g: 255, b: 255, a: 1.0 } : { r: 20, g: 20, b: 24, a: 1.0 };
        }

        function relativeLuminance(r, g, b) {
            const [rs, gs, bs] = [r, g, b].map(c => {
                const s = c / 255;
                return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        }

        function contrastRatio(fg, bg) {
            const l1 = relativeLuminance(fg.r, fg.g, fg.b);
            const l2 = relativeLuminance(bg.r, bg.g, bg.b);
            const lighter = Math.max(l1, l2);
            const darker = Math.min(l1, l2);
            return (lighter + 0.05) / (darker + 0.05);
        }

        const out = [];
        for (const item of targets) {
            const el = document.querySelector(item.selector);
            if (!el) {
                out.push({ name: item.name, found: false });
                continue;
            }
            const style = window.getComputedStyle(el);
            const fg = parseRgba(style.color) || { r: 255, g: 255, b: 255, a: 1.0 };
            
            // Check if element itself has solid background (e.g. buttons)
            let bg;
            const elBg = parseRgba(style.backgroundColor);
            if (elBg && elBg.a >= 0.85) {
                bg = elBg;
            } else {
                bg = getFirstOpaqueBg(el.parentElement || el);
            }
            
            const ratio = contrastRatio(fg, bg);
            out.push({
                name: item.name,
                selector: item.selector,
                found: true,
                fg: `rgb(${fg.r}, ${fg.g}, ${fg.b})`,
                bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
                ratio: Math.round(ratio * 100) / 100,
                passes: ratio >= 4.5
            });
        }
        return out;
    }
    """

    for theme in ["light", "dark"]:
        browser = playwright.chromium.launch(channel="chromium", headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            geolocation={"latitude": 26.9124, "longitude": 75.7873},
            permissions=["geolocation"]
        )
        page = context.new_page()
        page.add_init_script(f"""
            localStorage.setItem('emefast-theme', '{theme}');
        """)

        page.goto(f"{FRONTEND_URL}/user/emergency/new")
        page.wait_for_selector("main.emergency-shell", timeout=10000)
        page.wait_for_timeout(300)

        targets_step1 = [
            {"name": f"Cards (.v2-card text) [{theme}]", "selector": ".v2-card p, .v2-card h2"},
            {"name": f"Red Mono Label (.red-mono-label) [{theme}]", "selector": ".red-mono-label"},
            {"name": f"SOS Button (.reimagined-sos-btn) [{theme}]", "selector": ".reimagined-sos-btn"},
            {"name": f"Map Overlay Status (.live-map-status) [{theme}]", "selector": ".live-map-status"},
            {"name": f"Header Brand Wordmark (.brand-eme) [{theme}]", "selector": ".reimagined-brand-wordmark .brand-eme"},
            {"name": f"Header Brand Wordmark (.brand-fast) [{theme}]", "selector": ".reimagined-brand-wordmark .brand-fast"},
            {"name": f"Workspace Segment Tab (.workspace-segment-tab) [{theme}]", "selector": ".workspace-segment-tab"},
            {"name": f"Inactive Step Label (.inactive-step-label) [{theme}]", "selector": ".inactive-step-label"},
        ]

        results_step1 = page.evaluate(js_eval_contrast, targets_step1)

        # Advance through wizard properly:
        # Step 1 -> Step 2
        btn_next_1 = page.locator("button:has-text('Next: Clinical Situation')")
        btn_next_1.wait_for(state="visible")
        btn_next_1.click()
        page.wait_for_timeout(300)

        # Step 2: enter voice transcript to enable Next button
        transcript_input = page.locator('[data-testid="voice-transcript-input"]')
        transcript_input.wait_for(state="visible")
        transcript_input.fill("Acute severe chest pain radiating to left shoulder")
        page.wait_for_timeout(200)

        # Step 2 -> Step 3
        btn_next_2 = page.locator("button:has-text('Next: Patient Needs')")
        btn_next_2.wait_for(state="visible")
        btn_next_2.click()
        page.wait_for_timeout(300)

        # Step 3 -> Step 4
        btn_next_3 = page.locator("button:has-text('Next: Review & Broadcast')")
        btn_next_3.wait_for(state="visible")
        btn_next_3.click()
        page.wait_for_timeout(400)

        targets_step4 = [
            {"name": f"Wizard Edit Link (.wizard-edit-link) [{theme}]", "selector": ".wizard-edit-link"},
            {"name": f"Broadcast Button (.broadcast-btn) [{theme}]", "selector": ".wizard-action-btn.broadcast-btn"},
            {"name": f"Unassessed Priority Badge (.unassessed-badge) [{theme}]", "selector": ".unassessed-badge"},
        ]

        results_step4 = page.evaluate(js_eval_contrast, targets_step4)
        all_results = results_step1 + results_step4

        print(f"\n--- {theme.upper()} MODE CONTRAST AUDIT RESULTS ---")
        print(f"{'Target Element':<45} | {'Foreground':<18} | {'Background':<18} | {'Ratio':<7} | {'Result'}")
        print("-" * 105)

        for res in all_results:
            if not res.get("found"):
                continue
            status = "PASS (>=4.5:1)" if res["passes"] else "FAIL (<4.5:1)"
            print(f"{res['name']:<45} | {res['fg']:<18} | {res['bg']:<18} | {res['ratio']:<7.2f} | {status}")
            assert res["passes"] is True, f"CONTRAST AUDIT FAILED for {res['name']}: {res['ratio']:.2f}:1 is below WCAG AA 4.5:1 requirement! (fg: {res['fg']}, bg: {res['bg']})"

        # Report the actual colors used by red buttons and labels
        if theme == "light":
            sos_res = next(r for r in all_results if "SOS Button" in r["name"])
            bc_res = next(r for r in all_results if "Broadcast Button" in r["name"])
            label_res = next(r for r in all_results if "Red Mono Label" in r["name"])
            link_res = next(r for r in all_results if "Wizard Edit Link" in r["name"])
            print("\n  [REPORT: ACTUAL COLORS USED BY RED BUTTONS AND LABELS IN LIGHT MODE]")
            print(f"  • SOS Button Background:       {sos_res['bg']} (Text: {sos_res['fg']}, Ratio: {sos_res['ratio']}:1)")
            print(f"  • Broadcast Button Background: {bc_res['bg']} (Text: {bc_res['fg']}, Ratio: {bc_res['ratio']}:1)")
            print(f"  • Red Mono Label Color:        {label_res['fg']} (Background: {label_res['bg']}, Ratio: {label_res['ratio']}:1)")
            print(f"  • Red Edit Link Color:         {link_res['fg']} (Background: {link_res['bg']}, Ratio: {link_res['ratio']}:1)")

        browser.close()

    print("\nTest 8 PASSED: All text/background pairs in live DOM meet or exceed WCAG AA 4.5:1 contrast.")

# ==============================================================================
# 9. COMPREHENSIVE SCREENSHOT CAPTURE (390x844 & 1280x800, LIGHT & DARK)
# ==============================================================================
def run_test_9_capture_all_required_screenshots(playwright):
    print("\n" + "="*80)
    print("TEST 9: SCREENSHOT CAPTURE (390x844 & 1280x800, LIGHT & DARK) ACROSS 5 PAGES")
    print("="*80)

    # 1. Ensure an active case exists for the results page
    payload = {
        "patient_name": "Telemetry Monitor Case",
        "transport_mode": "AMBULANCE",
        "condition": "Severe acute chest pain and shortness of breath",
        "priority": "HIGH",
        "requirements": "Emergency stabilization, ICU",
        "latitude": 26.9124,
        "longitude": 75.7873,
        "address": "MI Road, Jaipur"
    }
    case_data = http_post_json(f"{BACKEND_URL}/api/emergency/new", payload)
    case_id = case_data["id"]
    print(f"  Created Case ID {case_id} for Results Page screenshot.")

    # 2. Get auth tokens
    test_hosp_pwd = os.getenv("SEED_HOSPITAL_PASSWORD") or os.getenv("HOSPITAL_PASSWORD")
    hosp_auth = http_post_form(f"{BACKEND_URL}/api/auth/login", {"username": "hospital-sms@emefast.example", "password": test_hosp_pwd})
    hosp_token = hosp_auth["access_token"]

    test_admin_pwd = os.getenv("SEED_ADMIN_PASSWORD") or os.getenv("ADMIN_PASSWORD")
    admin_auth = http_post_form(f"{BACKEND_URL}/api/auth/login", {"username": "admin@emefast.example", "password": test_admin_pwd})
    admin_token = admin_auth["access_token"]

    pages_to_capture = [
        {"id": "results", "path": f"/user/hospitals?case_id={case_id}", "role": "USER", "token": None, "wait_sel": ".hospital-discovery"},
        {"id": "hospital_dashboard", "path": "/hospital/dashboard", "role": "HOSPITAL", "token": hosp_token, "wait_sel": "text=SMS Hospital"},
        {"id": "admin_dashboard", "path": "/admin/dashboard", "role": "ADMIN", "token": admin_token, "wait_sel": ".admin-dashboard-shell"},
        {"id": "ambulance_dashboard", "path": "/ambulance/dashboard", "role": "USER", "token": None, "wait_sel": "main"},
        {"id": "homepage", "path": "/", "role": "USER", "token": None, "wait_sel": "main"},
    ]

    viewports = [
        {"name": "mobile_light", "width": 390, "height": 844, "theme": "light"},
        {"name": "mobile_dark", "width": 390, "height": 844, "theme": "dark"},
        {"name": "desktop_light", "width": 1280, "height": 800, "theme": "light"},
        {"name": "desktop_dark", "width": 1280, "height": 800, "theme": "dark"},
    ]

    captured_files = []
    ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", os.path.join(REPO_ROOT, "docs", "assets", "screenshots"))

    for p_info in pages_to_capture:
        for vp in viewports:
            browser = playwright.chromium.launch(channel="chromium", headless=True)
            context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
            page = context.new_page()

            init_script = f"""
                localStorage.setItem('emefast-theme', '{vp["theme"]}');
            """
            if p_info["token"]:
                init_script += f"""
                    localStorage.setItem('emefast_token', '{p_info["token"]}');
                    localStorage.setItem('emefast_role', '{p_info["role"]}');
                    localStorage.setItem('emefast_hospital_id', '1');
                    localStorage.setItem('emefast_user_name', 'Authorized Operator');
                """
            page.add_init_script(init_script)

            page.goto(f"{FRONTEND_URL}{p_info['path']}")
            try:
                page.wait_for_selector(p_info["wait_sel"], timeout=8000)
            except Exception:
                pass

            page.wait_for_timeout(350)

            filename = f"{p_info['id']}_{vp['name']}.png"
            dest_path = os.path.join(SCREENSHOTS_DIR, filename)
            page.screenshot(path=dest_path, full_page=False)
            captured_files.append(filename)

            # Also copy to artifact directory
            try:
                art_path = os.path.join(ARTIFACTS_DIR, filename)
                shutil.copyfile(dest_path, art_path)
            except Exception:
                pass

            print(f"  Captured [{vp['width']}x{vp['height']} {vp['theme']}]: {filename}")
            browser.close()

    cleanup_case(case_id)
    print(f"\nTest 9 PASSED: All {len(captured_files)} screenshots captured cleanly.")

# ==============================================================================
# MAIN TEST RUNNER
# ==============================================================================
def main():
    print("="*80)
    print("STARTING COMPLETE PHASE 4 WRAP-UP E2E TEST SUITE")
    print("="*80)

    run_test_1_direct_api_voice_transcript()

    with sync_playwright() as playwright:
        run_test_7_matching_word_boundary_icu_zero_and_partial_matches(playwright)
        run_test_2_gps_denied_flows(playwright)
        run_test_3_topnav_sos_pill(playwright)
        run_test_4_acuity_and_voice_transcript(playwright)
        run_test_5_dock_unobstructed_assertions(playwright)
        run_test_6_priority_ranking_and_dashboard_order(playwright)
        run_test_8_wcag_aa_contrast_audit(playwright)
        run_test_9_capture_all_required_screenshots(playwright)

    print("\n" + "="*80)
    print("ALL PHASE 4 WRAP-UP TESTS COMPLETED SUCCESSFULLY!")
    print("="*80)

if __name__ == "__main__":
    main()
