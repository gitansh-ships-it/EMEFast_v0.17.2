import sys
import os
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
output_dir = r'C:\Users\GITANSH-PC\.gemini\antigravity\brain\06296917-cfe2-4d77-b083-b55aaf9aed66'
os.makedirs(output_dir, exist_ok=True)

targets = [
    ('/', 'home'),
    ('/privacy', 'privacy'),
    ('/user/emergency/new', 'emergency_new')
]

configs = [
    ('desktop', {'width': 1280, 'height': 800, 'is_mobile': False}),
    ('mobile_360', {'width': 360, 'height': 780, 'is_mobile': True})
]

themes = ['dark', 'light']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for route, name in targets:
        for dev_name, vp in configs:
            for theme in themes:
                filename = f'{name}_{dev_name}_{theme}.png'
                filepath = os.path.join(output_dir, filename)
                
                context = browser.new_context(
                    viewport={'width': vp['width'], 'height': vp['height']},
                    is_mobile=vp['is_mobile'],
                    color_scheme=theme
                )
                page = context.new_page()
                url = f'http://localhost:3000{route}'
                try:
                    page.goto(url, wait_until='networkidle', timeout=15000)
                except Exception:
                    page.goto(url, wait_until='load', timeout=15000)
                
                # set theme attributes
                if theme == 'light':
                    page.evaluate("() => { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); document.documentElement.setAttribute('data-theme', 'light'); }")
                else:
                    page.evaluate("() => { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); }")
                
                page.wait_for_timeout(1000)
                page.screenshot(path=filepath, full_page=False)
                context.close()
                exists = os.path.exists(filepath)
                size = os.path.getsize(filepath) if exists else 0
                print(f'Captured {filename}: exists={exists}, size={size} bytes')
    browser.close()
