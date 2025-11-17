#!/usr/bin/env python3
"""
LeagueSphere Screenshot Capture Script

This script automates screenshot capture from https://leaguesphere.app/
using Selenium WebDriver with Chrome.

Requirements:
    pip install selenium webdriver-manager pillow

Usage:
    python capture_screenshots.py
    python capture_screenshots.py --headless  # Run without GUI
    python capture_screenshots.py --url https://leaguesphere.app/
"""

import os
import time
import argparse
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from PIL import Image

# Base configuration
BASE_URL = "https://leaguesphere.app"
SCREENSHOT_DIR = Path(__file__).parent
VIEWPORT_WIDTH = 1440
VIEWPORT_HEIGHT = 900
SCREENSHOT_DELAY = 2  # seconds to wait after navigation


class ScreenshotCapture:
    """Automated screenshot capture for LeagueSphere"""

    def __init__(self, base_url: str, headless: bool = False):
        self.base_url = base_url
        self.driver = self._setup_driver(headless)
        self.screenshot_dir = SCREENSHOT_DIR

    def _setup_driver(self, headless: bool) -> webdriver.Chrome:
        """Setup Chrome WebDriver with appropriate options"""
        chrome_options = Options()
        chrome_options.add_argument(f"--window-size={VIEWPORT_WIDTH},{VIEWPORT_HEIGHT}")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")

        if headless:
            chrome_options.add_argument("--headless=new")

        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        driver.set_window_size(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)

        return driver

    def capture(self, url: str, filename: str, wait_selector: str = None):
        """
        Navigate to URL and capture screenshot

        Args:
            url: Full URL to navigate to
            filename: Relative path from screenshot dir (e.g., "intro/homepage.png")
            wait_selector: Optional CSS selector to wait for before capturing
        """
        print(f"Capturing: {filename}")

        # Navigate to URL
        self.driver.get(url)

        # Wait for page load
        if wait_selector:
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, wait_selector))
            )
        else:
            time.sleep(SCREENSHOT_DELAY)

        # Capture screenshot
        filepath = self.screenshot_dir / filename
        filepath.parent.mkdir(parents=True, exist_ok=True)

        self.driver.save_screenshot(str(filepath))
        print(f"  Saved: {filepath}")

        # Optimize image
        self._optimize_image(filepath)

    def _optimize_image(self, filepath: Path):
        """Optimize PNG image size"""
        try:
            img = Image.open(filepath)
            img.save(filepath, optimize=True, compress_level=9)
            size_kb = filepath.stat().st_size / 1024
            print(f"  Optimized: {size_kb:.1f} KB")
        except Exception as e:
            print(f"  Warning: Could not optimize image: {e}")

    def click_and_capture(self, selector: str, filename: str):
        """
        Click an element and capture the resulting page

        Args:
            selector: CSS selector for element to click
            filename: Screenshot filename
        """
        print(f"Clicking: {selector}")
        element = WebDriverWait(self.driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
        )
        element.click()
        time.sleep(SCREENSHOT_DELAY)

        filepath = self.screenshot_dir / filename
        filepath.parent.mkdir(parents=True, exist_ok=True)
        self.driver.save_screenshot(str(filepath))
        print(f"  Saved: {filepath}")
        self._optimize_image(filepath)

    def close(self):
        """Close the browser"""
        self.driver.quit()


def capture_all_screenshots(base_url: str, headless: bool = False):
    """Capture all screenshots according to the checklist"""

    capture = ScreenshotCapture(base_url, headless)

    try:
        print("=" * 60)
        print("LeagueSphere Screenshot Capture")
        print("=" * 60)

        # 1. Homepage & Navigation
        print("\n1. Capturing homepage & navigation...")
        capture.capture(
            f"{base_url}/",
            "intro/homepage.png",
            wait_selector="body"
        )

        # Try to capture navigation elements
        capture.capture(f"{base_url}/", "intro/navigation-main.png")

        # 2. Gamedays
        print("\n2. Capturing gamedays...")
        gamedays_urls = [
            "/gamedays/",
            "/gameday/",
            "/api/gamedays/"  # Try different potential URLs
        ]

        for url in gamedays_urls:
            try:
                capture.capture(
                    f"{base_url}{url}",
                    "gamedays/gamedays-list-01.png",
                    wait_selector="body"
                )
                break  # Success, exit loop
            except Exception as e:
                print(f"  Could not access {url}: {e}")
                continue

        # 3. Passcheck
        print("\n3. Capturing passcheck...")
        try:
            capture.capture(
                f"{base_url}/passcheck/",
                "passcheck/passcheck-main.png",
                wait_selector="body"
            )
        except Exception as e:
            print(f"  Could not capture passcheck: {e}")

        # 4. Scorecard
        print("\n4. Capturing scorecard...")
        try:
            capture.capture(
                f"{base_url}/scorecard/",
                "scorecard/scorecard-main.png",
                wait_selector="body"
            )
        except Exception as e:
            print(f"  Could not capture scorecard: {e}")

        # 5. Liveticker
        print("\n5. Capturing liveticker...")
        try:
            capture.capture(
                f"{base_url}/liveticker/",
                "liveticker/liveticker-main.png",
                wait_selector="body"
            )
        except Exception as e:
            print(f"  Could not capture liveticker: {e}")

        # 6. League Table
        print("\n6. Capturing league table...")
        league_urls = ["/league-table/", "/standings/", "/table/"]
        for url in league_urls:
            try:
                capture.capture(
                    f"{base_url}{url}",
                    "league_table/standings-01.png",
                    wait_selector="body"
                )
                break
            except Exception as e:
                print(f"  Could not access {url}: {e}")
                continue

        # 7. Officials
        print("\n7. Capturing officials...")
        try:
            capture.capture(
                f"{base_url}/officials/",
                "officials/officials-list-01.png",
                wait_selector="body"
            )
        except Exception as e:
            print(f"  Could not capture officials: {e}")

        # 8. Team Manager
        print("\n8. Capturing team manager...")
        team_urls = ["/teams/", "/teammanager/", "/team/"]
        for url in team_urls:
            try:
                capture.capture(
                    f"{base_url}{url}",
                    "teammanager/teams-list-01.png",
                    wait_selector="body"
                )
                break
            except Exception as e:
                print(f"  Could not access {url}: {e}")
                continue

        # 9. Accounts
        print("\n9. Capturing accounts...")
        try:
            capture.capture(
                f"{base_url}/accounts/login/",
                "accounts/login-page.png",
                wait_selector="body"
            )
        except Exception as e:
            print(f"  Could not capture login: {e}")

        print("\n" + "=" * 60)
        print("Screenshot capture complete!")
        print("=" * 60)
        print(f"\nScreenshots saved to: {SCREENSHOT_DIR}")
        print("\nNext steps:")
        print("1. Review screenshots for quality")
        print("2. Capture additional detail screenshots manually")
        print("3. Run optimization: find . -name '*.png' -exec optipng -o5 {} \\;")

    except Exception as e:
        print(f"\nError during capture: {e}")
        import traceback
        traceback.print_exc()

    finally:
        capture.close()


def main():
    parser = argparse.ArgumentParser(
        description="Capture screenshots from LeagueSphere application"
    )
    parser.add_argument(
        "--url",
        default=BASE_URL,
        help=f"Base URL of LeagueSphere instance (default: {BASE_URL})"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run browser in headless mode (no GUI)"
    )

    args = parser.parse_args()

    # Check if Selenium is installed
    try:
        import selenium
        from webdriver_manager.chrome import ChromeDriverManager
    except ImportError:
        print("Error: Required packages not installed")
        print("\nPlease install dependencies:")
        print("  pip install selenium webdriver-manager pillow")
        return 1

    capture_all_screenshots(args.url, args.headless)
    return 0


if __name__ == "__main__":
    exit(main())
