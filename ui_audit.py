#!/usr/bin/env python3
"""
Splitfin UI Audit Script — visits known pages, screenshots each, captures structure.
"""

import json
import os
import time
from playwright.sync_api import sync_playwright

SITE = "https://splitfin.co.uk"
SCREENSHOTS_DIR = "./screenshots"
VIEWPORT = {"width": 1440, "height": 900}
REPORT_FILE = "./screenshots/ui_audit_report.json"

PAGES = [
    {"path": "/dashboard",          "name": "01-dashboard"},
    {"path": "/orders",             "name": "02-orders"},
    {"path": "/order/10130",        "name": "03-order-detail"},
    {"path": "/customers",          "name": "04-customers"},
    {"path": "/customers/1",        "name": "05-customer-detail"},
    {"path": "/enquiries",          "name": "06-enquiries"},
    {"path": "/inventory/products", "name": "07-products"},
    {"path": "/settings/general",   "name": "08-settings"},
]

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)


def wait_stable(page, timeout=10000):
    try:
        page.wait_for_load_state('networkidle', timeout=timeout)
    except Exception:
        pass
    try:
        page.wait_for_load_state('domcontentloaded', timeout=5000)
    except Exception:
        pass
    page.wait_for_timeout(2000)


def capture_structure(page):
    return page.evaluate("""() => {
        const title = document.title || '';
        const url = window.location.href;
        const bodyText = document.body ? document.body.innerText : '';
        const textSummary = bodyText.substring(0, 2000).replace(/\\n+/g, '\\n').trim();

        const elements = {
            forms: document.querySelectorAll('form').length,
            tables: document.querySelectorAll('table').length,
            buttons: document.querySelectorAll('button, [role="button"], input[type="submit"]').length,
            inputs: document.querySelectorAll('input, textarea, select').length,
            cards: document.querySelectorAll('[class*="card"], [class*="Card"]').length,
            modals: document.querySelectorAll('[class*="modal"], [class*="Modal"], [role="dialog"]').length,
            links: document.querySelectorAll('a[href]').length,
            images: document.querySelectorAll('img').length,
            headings: Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
                tag: h.tagName,
                text: h.innerText.substring(0, 120)
            })),
        };

        const buttonLabels = Array.from(document.querySelectorAll('button, [role="button"]'))
            .map(b => b.innerText.trim())
            .filter(t => t.length > 0 && t.length < 80)
            .slice(0, 30);

        // Grab sidebar nav items
        const sidebarItems = Array.from(document.querySelectorAll(
            'nav a, [class*="sidebar"] a, [class*="Sidebar"] a, [class*="nav"] a'
        )).map(a => ({ text: a.innerText.trim().substring(0, 60), href: a.getAttribute('href') }))
          .filter(a => a.text);

        return { title, url, textSummary, elements, buttonLabels, sidebarItems };
    }""")


def login(page):
    print(f"[LOGIN] Navigating to {SITE}...")
    page.goto(SITE, wait_until='domcontentloaded', timeout=30000)
    wait_stable(page)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/00-login.png", full_page=True)
    print(f"  URL: {page.url}")

    page.fill('#agentId', 'matt')
    page.fill('#pin', '1234')
    page.click('button[type="submit"]')
    wait_stable(page, timeout=15000)
    page.wait_for_timeout(2000)
    print(f"  Post-login: {page.url}")
    return page.url


def main():
    print("=" * 70)
    print("  SPLITFIN UI AUDIT")
    print("=" * 70)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        )
        page = context.new_page()

        login(page)

        results = []

        for pg in PAGES:
            url = SITE + pg['path']
            name = pg['name']
            screenshot_path = f"{SCREENSHOTS_DIR}/{name}.png"

            print(f"\n[{name}] {pg['path']}")

            try:
                page.goto(url, wait_until='domcontentloaded', timeout=20000)
                wait_stable(page)

                actual = page.url
                if 'login' in actual and 'login' not in pg['path']:
                    print("  Session lost — re-logging in")
                    login(page)
                    page.goto(url, wait_until='domcontentloaded', timeout=20000)
                    wait_stable(page)

                page.screenshot(path=screenshot_path, full_page=True)

                s = capture_structure(page)

                result = {
                    'name': name,
                    'intended_path': pg['path'],
                    'actual_url': page.url,
                    'screenshot': screenshot_path,
                    'title': s['title'],
                    'text_summary': s['textSummary'],
                    'elements': s['elements'],
                    'button_labels': s['buttonLabels'],
                    'sidebar_items': s.get('sidebarItems', []),
                }
                results.append(result)

                el = s['elements']
                print(f"  URL: {page.url}")
                print(f"  Elements: forms={el['forms']} tables={el['tables']} buttons={el['buttons']} inputs={el['inputs']} cards={el['cards']} images={el['images']}")
                for h in s['elements']['headings'][:5]:
                    print(f"  {h['tag']}: {h['text'][:80]}")
                if s['buttonLabels']:
                    print(f"  Buttons: {', '.join(s['buttonLabels'][:10])}")

            except Exception as e:
                print(f"  ERROR: {e}")
                results.append({'name': name, 'intended_path': pg['path'], 'error': str(e)})

        report = {
            'site': SITE,
            'viewport': VIEWPORT,
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'pages': results,
        }
        with open(REPORT_FILE, 'w') as f:
            json.dump(report, f, indent=2)

        print(f"\n{'=' * 70}")
        print(f"  DONE — {len(results)} pages captured")
        print(f"  Report: {REPORT_FILE}")
        print(f"{'=' * 70}")

        browser.close()


if __name__ == '__main__':
    main()
