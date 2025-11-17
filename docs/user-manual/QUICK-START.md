# Quick Start: LeagueSphere User Manual

## Opening the Manual (3 Simple Ways)

### 1. Double-Click (Easiest)
```
1. Navigate to: /home/cda/dev/leaguesphere/docs/user-manual/
2. Double-click: index.html
3. Browser opens automatically
```

### 2. Command Line
```bash
cd /home/cda/dev/leaguesphere/docs/user-manual
xdg-open index.html
```

### 3. Local Web Server
```bash
cd /home/cda/dev/leaguesphere/docs/user-manual
python3 -m http.server 8080
# Then open: http://localhost:8080
```

## What You'll See

**Landing Page (index.html):**
- Hero section with "Erste Schritte" button
- 9 feature cards (clickable)
- Quick links to common tasks
- Help section

**Navigation:**
- Top bar: Home | Erste Schritte | Zur Anwendung
- Left sidebar: All 9 feature pages
- Breadcrumbs: Current location
- Bottom: Previous/Next page links

## Current Status

✅ **Phase 1 Complete** (Structure & Templates)
⏳ **Phase 2 Pending** (Content - needs documentation-specialist)
⏳ **Phase 3 Pending** (Screenshots - needs qa-engineer)

## Structure Overview

```
docs/user-manual/
├── index.html              ← START HERE
├── intro.html              (Navigation & Getting Started)
├── gamedays.html           (Gamedays Management)
├── passcheck.html          (Player Eligibility)
├── scorecard.html          (Live Scoring)
├── officials.html          (Officials Management)
├── liveticker.html         (Live Ticker)
├── league-table.html       (League Tables)
├── teammanager.html        (Team Management)
├── accounts.html           (User Accounts)
├── README.md               (Detailed documentation)
├── IMPLEMENTATION-SUMMARY.md  (What was built)
└── assets/
    ├── css/manual.css      (Styles)
    ├── js/manual.js        (Interactivity)
    └── CONTENT-TEMPLATE.md (For content writers)
```

## Next Steps

### For Documentation-Specialist
1. Read `assets/CONTENT-TEMPLATE.md`
2. Fill in content for all pages
3. Use provided templates and examples

### For QA-Engineer
1. Read `screenshots/README.md`
2. Capture screenshots from https://leaguesphere.app
3. Add to HTML pages with alt text

## Need Help?

- Full documentation: `README.md`
- Architecture details: `ARCHITECTURE.md`
- Implementation details: `IMPLEMENTATION-SUMMARY.md`
- Content templates: `assets/CONTENT-TEMPLATE.md`
- Screenshot guide: `screenshots/README.md`

## Technical Details

- **Technology:** HTML5 + CSS3 + JavaScript + Bootstrap 5
- **Browser:** Any modern browser (Chrome, Firefox, Safari, Edge)
- **Size:** 228KB (without screenshots)
- **Language:** German (formal "Sie")
- **Responsive:** Yes (mobile-friendly)
- **Accessible:** WCAG 2.1 AA compliant
- **Print:** Yes (print-friendly styles)

## Testing

```bash
# Verify all files exist
cd /home/cda/dev/leaguesphere/docs/user-manual
ls -lh *.html

# Check total size
du -sh .

# Count lines of code
wc -l *.html *.md assets/css/*.css assets/js/*.js | tail -1

# Open in browser
xdg-open index.html
```

---

**Created:** 2025-11-07
**Status:** Phase 1 Complete ✅
**Ready for:** Content Creation & Screenshot Capture
