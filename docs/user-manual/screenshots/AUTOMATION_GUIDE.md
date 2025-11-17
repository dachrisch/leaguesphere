# Screenshot Automation Guide

This guide explains how to automatically capture screenshots from LeagueSphere using the provided automation script.

## Prerequisites

### 1. Install Python Dependencies

```bash
pip install selenium webdriver-manager pillow
```

### 2. Install Chrome/Chromium

The script uses Chrome WebDriver. Ensure Chrome or Chromium is installed:

```bash
# Ubuntu/Debian
sudo apt-get install chromium-browser

# Or download Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
```

## Usage

### Basic Capture

Run the script from this directory:

```bash
cd /home/cda/dev/leaguesphere/docs/user-manual/screenshots/
python capture_screenshots.py
```

This will:
1. Open Chrome browser at 1440x900 resolution
2. Navigate to https://leaguesphere.app
3. Capture screenshots of main pages
4. Save them to appropriate subdirectories
5. Optimize PNG files automatically

### Headless Mode

Run without displaying the browser window:

```bash
python capture_screenshots.py --headless
```

### Custom URL

Capture from a different instance (e.g., local development):

```bash
python capture_screenshots.py --url http://localhost:8000
```

## What Gets Captured

The script automatically captures:

- **intro/homepage.png** - Homepage
- **gamedays/gamedays-list-01.png** - Gamedays list
- **passcheck/passcheck-main.png** - Passcheck interface
- **scorecard/scorecard-main.png** - Scorecard interface
- **liveticker/liveticker-main.png** - Liveticker view
- **league_table/standings-01.png** - League standings
- **officials/officials-list-01.png** - Officials list
- **teammanager/teams-list-01.png** - Teams list
- **accounts/login-page.png** - Login screen

## Limitations

The basic script captures:
- Main landing pages only
- Public/unauthenticated views
- Static page states

**Not captured automatically:**
- Detailed views (game details, player details, etc.)
- Authenticated content (requires login)
- Interactive states (forms, modals, dropdowns)
- Dynamic content (live scoring in action)

## Manual Capture Still Required

After running the automation script, you'll need to manually capture:

1. **Detail views** - Click into specific games, players, teams
2. **Forms and modals** - Create/edit forms, confirmation dialogs
3. **Interactive elements** - Dropdowns, tooltips, hover states
4. **Authentication flow** - Login, profile, settings
5. **Error states** - Validation errors, conflict warnings
6. **Dynamic states** - Live scoring, real-time updates

See **CAPTURE_CHECKLIST.md** for the complete list.

## Extending the Script

### Add Authentication

To capture authenticated pages, modify the script:

```python
def login(self, username: str, password: str):
    """Login to LeagueSphere"""
    self.driver.get(f"{self.base_url}/accounts/login/")

    username_field = self.driver.find_element(By.NAME, "username")
    password_field = self.driver.find_element(By.NAME, "password")

    username_field.send_keys(username)
    password_field.send_keys(password)

    submit_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
    submit_button.click()

    time.sleep(2)  # Wait for login

# In capture_all_screenshots():
capture.login("your_username", "your_password")
```

### Capture Specific Element

To capture just a specific element instead of the full page:

```python
def capture_element(self, selector: str, filename: str):
    """Capture a specific element"""
    element = self.driver.find_element(By.CSS_SELECTOR, selector)
    element.screenshot(str(self.screenshot_dir / filename))
```

### Add Wait Conditions

For pages with dynamic content:

```python
from selenium.webdriver.support import expected_conditions as EC

# Wait for specific text
WebDriverWait(self.driver, 10).until(
    EC.text_to_be_present_in_element((By.CSS_SELECTOR, ".score"), "14")
)

# Wait for element to be visible
WebDriverWait(self.driver, 10).until(
    EC.visibility_of_element_located((By.CSS_SELECTOR, ".modal"))
)
```

## Troubleshooting

### ChromeDriver Issues

If you get ChromeDriver errors:

```bash
# Clear cached driver
rm -rf ~/.wdm/

# Or install manually
sudo apt-get install chromium-chromedriver
```

### Network Timeouts

If pages take too long to load, increase the timeout:

```python
SCREENSHOT_DELAY = 5  # Increase from 2 to 5 seconds
```

### SSL/Certificate Errors

For local development with self-signed certificates:

```python
chrome_options.add_argument('--ignore-certificate-errors')
```

### Element Not Found

If selectors don't work, inspect the actual page structure:

```bash
# Open Chrome DevTools
# Right-click element -> Inspect
# Copy selector: right-click element in Elements panel -> Copy -> Copy selector
```

## Post-Capture Optimization

After capturing screenshots, optimize them further:

```bash
# Using optipng (lossless, aggressive)
find . -name "*.png" -exec optipng -o7 {} \;

# Using pngquant (lossy but smaller)
find . -name "*.png" -exec pngquant --quality=85-95 --ext .png --force {} \;

# Check total size
du -sh .
```

## Integration with CI/CD

To run screenshot capture in CI:

```yaml
# GitHub Actions example
- name: Capture Screenshots
  run: |
    pip install selenium webdriver-manager pillow
    cd docs/user-manual/screenshots/
    python capture_screenshots.py --headless --url https://leaguesphere.app

- name: Upload Screenshots
  uses: actions/upload-artifact@v3
  with:
    name: screenshots
    path: docs/user-manual/screenshots/**/*.png
```

## Alternative Tools

If Selenium doesn't work for your use case, consider:

### Playwright (Python)

```bash
pip install playwright
playwright install chromium

# Script
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto('https://leaguesphere.app')
    page.screenshot(path='screenshot.png')
    browser.close()
```

### Puppeteer (Node.js)

```bash
npm install puppeteer

# Script
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://leaguesphere.app');
  await page.screenshot({ path: 'screenshot.png' });
  await browser.close();
})();
```

### Chrome DevTools Protocol

Direct CDP access for maximum control:

```bash
# Start Chrome with debugging
google-chrome --remote-debugging-port=9222

# Use CDP to capture screenshots
```

## Next Steps

1. Run the automation script to capture base screenshots
2. Review captured screenshots
3. Use CAPTURE_CHECKLIST.md for manual captures
4. Optimize all images
5. Add screenshots to HTML files with proper alt text
