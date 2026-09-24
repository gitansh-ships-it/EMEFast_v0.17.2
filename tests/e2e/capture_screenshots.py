import json
import os
import shutil
import sqlite3
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
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", os.path.join(REPO_ROOT, "docs", "assets", "screenshots"))
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

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

def cleanup_case(case_id):
    if not os.path.exists(DB_PATH):
        return
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("DELETE FROM emergency_cases WHERE id = ?", (case_id,))
    conn.commit()
    conn.close()

def save_and_copy(page, filename):
    dest = os.path.join(SCREENSHOTS_DIR, filename)
    page.screenshot(path=dest, full_page=False)
    art_dest = os.path.join(ARTIFACTS_DIR, filename)
    shutil.copyfile(dest, art_dest)
    print(f"  [SAVED] {filename}")

def capture_all():
    # 1. Create a case for results page
    payload = {
        "patient_name": "Rohan Sharma",
        "transport_mode": "AMBULANCE",
        "condition": "Severe cardiac arrest with respiratory failure",
        "priority": "HIGH",
        "requirements": "Emergency stabilization, ICU",
        "latitude": 26.9124,
        "longitude": 75.7873,
        "address": "MI Road, Jaipur"
    }
    case_data = http_post_json(f"{BACKEND_URL}/api/emergency/new", payload)
    case_id = case_data["id"]

    test_hosp_pwd = os.getenv("SEED_HOSPITAL_PASSWORD") or os.getenv("HOSPITAL_PASSWORD")
    hosp_auth = http_post_form(f"{BACKEND_URL}/api/auth/login", {"username": "hospital-sms@emefast.example", "password": test_hosp_pwd})
    hosp_token = hosp_auth["access_token"]

    test_admin_pwd = os.getenv("SEED_ADMIN_PASSWORD") or os.getenv("ADMIN_PASSWORD")
    admin_auth = http_post_form(f"{BACKEND_URL}/api/auth/login", {"username": "admin@emefast.example", "password": test_admin_pwd})
    admin_token = admin_auth["access_token"]

    viewports = [
        {"name": "mobile_light", "width": 390, "height": 844, "theme": "light"},
        {"name": "mobile_dark", "width": 390, "height": 844, "theme": "dark"},
        {"name": "desktop_light", "width": 1280, "height": 800, "theme": "light"},
        {"name": "desktop_dark", "width": 1280, "height": 800, "theme": "dark"},
    ]

    with sync_playwright() as playwright:
        # A. WIZARD STEPS 1-4 ACROSS ALL 4 VIEWPORTS
        for vp in viewports:
            browser = playwright.chromium.launch(channel="chromium", headless=True)
            context = browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                geolocation={"latitude": 26.9124, "longitude": 75.7873},
                permissions=["geolocation"]
            )
            page = context.new_page()

            page.add_init_script(f"localStorage.setItem('emefast-theme', '{vp['theme']}');")
            page.goto(f"{FRONTEND_URL}/ambulance/emergency/new")
            page.wait_for_selector("button:has-text('Next: Clinical Situation')", timeout=8000)
            page.wait_for_timeout(300)

            # Step 1
            save_and_copy(page, f"wizard_step1_{vp['name']}.png")

            # Go to Step 2
            page.locator("button:has-text('Next: Clinical Situation')").click()
            page.wait_for_timeout(300)
            page.wait_for_selector('[data-testid="voice-transcript-input"]', timeout=5000)
            save_and_copy(page, f"wizard_step2_{vp['name']}.png")

            # Fill Step 2
            page.locator('[data-testid="voice-transcript-input"]').fill("Acute myocardial infarction with low SpO2")
            page.wait_for_timeout(200)

            # Go to Step 3
            page.locator("button:has-text('Next: Patient Needs')").click()
            page.wait_for_timeout(300)
            page.wait_for_selector("button:has-text('Next: Review & Broadcast')", timeout=5000)
            save_and_copy(page, f"wizard_step3_{vp['name']}.png")

            # Go to Step 4
            page.locator("button:has-text('Next: Review & Broadcast')").click()
            page.wait_for_timeout(400)
            page.wait_for_selector(".wizard-action-btn.broadcast-btn", timeout=5000)
            save_and_copy(page, f"wizard_step4_{vp['name']}.png")

            browser.close()

        # B. HINDI DEVANAGARI PROOF SCREENSHOT
        # Fill authentic Hindi text into transcript field & test Devanagari font rendering
        browser = playwright.chromium.launch(channel="chromium", headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            geolocation={"latitude": 26.9124, "longitude": 75.7873},
            permissions=["geolocation"]
        )
        page = context.new_page()
        page.add_init_script("localStorage.setItem('emefast-theme', 'light');")
        page.goto(f"{FRONTEND_URL}/ambulance/emergency/new")
        page.wait_for_selector("button:has-text('Next: Clinical Situation')", timeout=8000)
        page.locator("button:has-text('Next: Clinical Situation')").click()
        page.wait_for_selector('[data-testid="voice-transcript-input"]', timeout=5000)

        hindi_text = "सीने में बहुत तेज़ दर्द और सांस लेने में भारी कठिनाई है। कृपया तुरंत आईसीयू और कार्डियक एम्बुलेंस तैयार रखें।"
        page.locator('[data-testid="voice-transcript-input"]').fill(hindi_text)
        page.wait_for_timeout(400)
        save_and_copy(page, "hindi_devanagari_render_proof_mobile.png")
        save_and_copy(page, "hindi_devanagari_render_proof.png")

        # Also desktop Hindi proof
        browser.close()

        browser = playwright.chromium.launch(channel="chromium", headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            geolocation={"latitude": 26.9124, "longitude": 75.7873},
            permissions=["geolocation"]
        )
        page = context.new_page()
        page.add_init_script("localStorage.setItem('emefast-theme', 'light');")
        page.goto(f"{FRONTEND_URL}/ambulance/emergency/new")
        page.wait_for_selector("button:has-text('Next: Clinical Situation')", timeout=8000)
        page.locator("button:has-text('Next: Clinical Situation')").click()
        page.wait_for_selector('[data-testid="voice-transcript-input"]', timeout=5000)
        page.locator('[data-testid="voice-transcript-input"]').fill(hindi_text)
        page.wait_for_timeout(400)
        save_and_copy(page, "hindi_devanagari_render_proof_desktop.png")
        browser.close()

        # C. OTHER MAIN PAGES (Results, Hospital Dashboard, Admin Dashboard, Ambulance Dashboard, Homepage)
        pages = [
            {"id": "results", "path": f"/user/hospitals?case_id={case_id}", "token": None, "role": "USER", "wait_sel": ".hospital-discovery"},
            {"id": "hospital_dashboard", "path": "/hospital/dashboard", "token": hosp_token, "role": "HOSPITAL", "wait_sel": "text=SMS Hospital"},
            {"id": "admin_dashboard", "path": "/admin/dashboard", "token": admin_token, "role": "ADMIN", "wait_sel": ".admin-dashboard-shell"},
            {"id": "ambulance_dashboard", "path": "/ambulance/dashboard", "token": None, "role": "USER", "wait_sel": "main"},
            {"id": "homepage", "path": "/", "token": None, "role": "USER", "wait_sel": "main"},
        ]

        for p_info in pages:
            for vp in viewports:
                browser = playwright.chromium.launch(channel="chromium", headless=True)
                context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
                page = context.new_page()

                init_script = f"localStorage.setItem('emefast-theme', '{vp['theme']}');"
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
                save_and_copy(page, filename)
                browser.close()

    cleanup_case(case_id)
    print("\nALL VISUAL POLISH SCREENSHOTS AND PROOFS CAPTURED SUCCESSFULLY!")

if __name__ == "__main__":
    capture_all()
