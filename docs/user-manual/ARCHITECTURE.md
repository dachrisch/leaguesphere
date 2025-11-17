# Architecture Design: LeagueSphere Standalone HTML User Manual

## Executive Summary

This architecture defines a standalone HTML-based user manual for LeagueSphere that can be opened directly in any modern web browser without requiring a web server. The manual uses Bootstrap 5 via CDN for styling, supports offline viewing (except Bootstrap assets), and is written in German for the primary user base.

## Architecture Overview

### System Context

The user manual is a **completely separate documentation system** from the LeagueSphere Django application. It consists of static HTML files that can be:
- Opened directly via `file://` protocol in any browser
- Served via simple HTTP server for development
- Deployed to static hosting (GitHub Pages, S3, etc.)
- Distributed as a ZIP file
- Embedded in the main LeagueSphere application as static documentation

### Architectural Style

**Chosen Style**: Static Multi-Page Application (MPA) with Shared Layout Pattern

**Rationale**:
- No build tools or JavaScript framework required
- Maximum compatibility across browsers and environments
- Easy to maintain and update by non-developers
- Works offline (except Bootstrap CDN)
- Can be version-controlled alongside codebase
- Simple navigation via standard HTML links

## High-Level Design

### Directory Structure

```
/home/cda/dev/leaguesphere/docs/user-manual/
├── index.html                      # Main landing page with overview
├── intro.html                      # Navigation & Getting Started
├── gamedays.html                   # Gamedays Management
├── passcheck.html                  # Player Eligibility Checking
├── scorecard.html                  # Live Scoring Interface
├── officials.html                  # Officials Management
├── liveticker.html                 # Real-time Game Ticker
├── league-table.html               # League Standings & Schedules
├── teammanager.html                # Team Management
├── accounts.html                   # User Accounts & Authentication
├── ARCHITECTURE.md                 # This file
├── README.md                       # Quick start guide for manual
├── assets/
│   ├── css/
│   │   └── manual.css              # Custom styles
│   ├── js/
│   │   └── manual.js               # Optional JS enhancements
│   └── images/
│       └── logo.png                # LeagueSphere logo
└── screenshots/
    ├── intro/
    │   ├── navigation-01.png
    │   ├── navigation-02.png
    │   └── home-page.png
    ├── gamedays/
    │   ├── gamedays-list-01.png
    │   ├── gamedays-create-01.png
    │   ├── gamedays-detail-01.png
    │   └── gamedays-edit-01.png
    ├── passcheck/
    │   ├── passcheck-search-01.png
    │   ├── passcheck-player-01.png
    │   └── passcheck-eligible-01.png
    ├── scorecard/
    │   ├── scorecard-overview-01.png
    │   ├── scorecard-scoring-01.png
    │   └── scorecard-clock-01.png
    ├── officials/
    │   ├── officials-list-01.png
    │   └── officials-assign-01.png
    ├── liveticker/
    │   ├── liveticker-live-01.png
    │   └── liveticker-events-01.png
    ├── league-table/
    │   ├── standings-01.png
    │   └── schedule-01.png
    ├── teammanager/
    │   ├── teams-list-01.png
    │   └── roster-01.png
    └── accounts/
        ├── login-01.png
        └── profile-01.png
```

## HTML Structure

### Base Template Pattern

Each HTML page follows a consistent structure:

```html
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Page Title] - LeagueSphere Benutzerhandbuch</title>

    <!-- Bootstrap 5 CSS via CDN -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
          rel="stylesheet"
          integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN"
          crossorigin="anonymous">

    <!-- Custom CSS -->
    <link rel="stylesheet" href="assets/css/manual.css">

    <!-- Optional: Favicon -->
    <link rel="icon" type="image/png" href="assets/images/favicon.png">
</head>
<body>
    <!-- Navigation Header -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
        <!-- Navigation content -->
    </nav>

    <!-- Page Content -->
    <div class="container-fluid">
        <div class="row">
            <!-- Sidebar Navigation -->
            <nav class="col-md-3 col-lg-2 d-md-block bg-light sidebar">
                <!-- Sidebar links -->
            </nav>

            <!-- Main Content Area -->
            <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4">
                <!-- Page-specific content -->
            </main>
        </div>
    </div>

    <!-- Footer -->
    <footer class="footer mt-auto py-3 bg-light">
        <!-- Footer content -->
    </footer>

    <!-- Bootstrap Bundle with Popper -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"
            integrity="sha384-C6RzsynM9kWDrMNeT87bh95OGNyZPhcTNXj1NW7RuBCsyN/o0jlpcV8Qyq46cDfL"
            crossorigin="anonymous"></script>

    <!-- Optional: Custom JS -->
    <script src="assets/js/manual.js"></script>
</body>
</html>
```

### Navigation Header Component

Standard navigation bar present on all pages:

```html
<nav class="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
    <div class="container-fluid">
        <a class="navbar-brand" href="index.html">
            <img src="assets/images/logo.png" alt="LeagueSphere" height="30">
            LeagueSphere Handbuch
        </a>
        <button class="navbar-toggler" type="button"
                data-bs-toggle="collapse"
                data-bs-target="#navbarNav">
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav ms-auto">
                <li class="nav-item">
                    <a class="nav-link" href="index.html">Startseite</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="intro.html">Erste Schritte</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="https://leaguesphere.app" target="_blank">
                        Zur Anwendung
                    </a>
                </li>
            </ul>
        </div>
    </div>
</nav>
```

### Sidebar Navigation Component

Persistent sidebar on all pages for quick navigation:

```html
<nav class="col-md-3 col-lg-2 d-md-block bg-light sidebar collapse">
    <div class="position-sticky pt-3">
        <h6 class="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-1 text-muted">
            <span>Funktionen</span>
        </h6>
        <ul class="nav flex-column">
            <li class="nav-item">
                <a class="nav-link" href="intro.html">
                    Navigation & Erste Schritte
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="gamedays.html">
                    Spieltage verwalten
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="passcheck.html">
                    Spielberechtigung prüfen
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="scorecard.html">
                    Live-Scoring
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="officials.html">
                    Schiedsrichter verwalten
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="liveticker.html">
                    Liveticker
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="league-table.html">
                    Tabellen & Spielpläne
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="teammanager.html">
                    Teams verwalten
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="accounts.html">
                    Benutzerkonten
                </a>
            </li>
        </ul>

        <h6 class="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-1 text-muted">
            <span>Weitere Ressourcen</span>
        </h6>
        <ul class="nav flex-column mb-2">
            <li class="nav-item">
                <a class="nav-link" href="https://github.com/dachrisch/leaguesphere" target="_blank">
                    GitHub Repository
                </a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="https://leaguesphere.app" target="_blank">
                    LeagueSphere Anwendung
                </a>
            </li>
        </ul>
    </div>
</nav>
```

### Footer Component

```html
<footer class="footer mt-auto py-3 bg-light border-top">
    <div class="container-fluid">
        <div class="row">
            <div class="col-md-6">
                <span class="text-muted">
                    LeagueSphere Benutzerhandbuch &copy; 2025
                </span>
            </div>
            <div class="col-md-6 text-end">
                <span class="text-muted">
                    Version: <span id="version">1.0.0</span>
                </span>
            </div>
        </div>
    </div>
</footer>
```

### Content Structure Patterns

#### Page Header Pattern

```html
<div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
    <h1 class="h2">[Feature Name]</h1>
    <div class="btn-toolbar mb-2 mb-md-0">
        <div class="btn-group me-2">
            <button type="button" class="btn btn-sm btn-outline-secondary"
                    onclick="window.print()">
                Drucken
            </button>
        </div>
    </div>
</div>
```

#### Section Pattern

```html
<section id="[section-id]" class="mb-5">
    <h2>[Section Title]</h2>
    <p class="lead">[Section introduction]</p>

    <!-- Content: text, screenshots, lists, etc. -->

    <div class="alert alert-info" role="alert">
        <strong>Hinweis:</strong> [Important note or tip]
    </div>
</section>
```

#### Screenshot Pattern

```html
<figure class="figure">
    <img src="screenshots/[feature]/[screenshot-name].png"
         class="figure-img img-fluid rounded shadow-sm"
         alt="[Description]"
         loading="lazy">
    <figcaption class="figure-caption">
        [Screenshot caption explaining what the user sees]
    </figcaption>
</figure>
```

#### Step-by-Step Instructions Pattern

```html
<div class="card mb-4">
    <div class="card-header">
        <h3 class="h5 mb-0">[Task Title]</h3>
    </div>
    <div class="card-body">
        <ol class="list-group list-group-numbered list-group-flush">
            <li class="list-group-item">
                <strong>Schritt 1:</strong> [Description]
                <figure class="figure mt-2">
                    <img src="screenshots/[feature]/step-01.png"
                         class="figure-img img-fluid rounded"
                         alt="Schritt 1">
                </figure>
            </li>
            <li class="list-group-item">
                <strong>Schritt 2:</strong> [Description]
            </li>
            <!-- More steps -->
        </ol>
    </div>
</div>
```

#### Quick Reference Card Pattern

```html
<div class="card border-primary mb-3">
    <div class="card-header bg-primary text-white">
        Schnellreferenz
    </div>
    <div class="card-body">
        <table class="table table-sm">
            <thead>
                <tr>
                    <th>Aktion</th>
                    <th>Beschreibung</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><kbd>Button Name</kbd></td>
                    <td>What the button does</td>
                </tr>
                <!-- More rows -->
            </tbody>
        </table>
    </div>
</div>
```

#### Navigation Breadcrumbs Pattern

```html
<nav aria-label="breadcrumb">
    <ol class="breadcrumb">
        <li class="breadcrumb-item"><a href="index.html">Startseite</a></li>
        <li class="breadcrumb-item active" aria-current="page">[Current Page]</li>
    </ol>
</nav>
```

#### Previous/Next Navigation Pattern

```html
<nav class="mt-5 pt-3 border-top">
    <ul class="pagination justify-content-between">
        <li class="page-item">
            <a class="page-link" href="[previous-page].html">
                &larr; Zurück: [Previous Page Title]
            </a>
        </li>
        <li class="page-item">
            <a class="page-link" href="[next-page].html">
                Weiter: [Next Page Title] &rarr;
            </a>
        </li>
    </ul>
</nav>
```

## CSS Architecture

### Custom Stylesheet (`assets/css/manual.css`)

```css
/* ========================================
   LeagueSphere User Manual Styles
   ======================================== */

/* --- Global Styles --- */
:root {
    --ls-primary: #0d6efd;
    --ls-dark: #212529;
    --ls-light: #f8f9fa;
    --ls-border: #dee2e6;
    --sidebar-width: 260px;
}

body {
    font-size: 1rem;
    line-height: 1.6;
    color: #333;
    padding-bottom: 60px; /* Space for footer */
}

/* --- Navigation --- */
.navbar-brand img {
    margin-right: 0.5rem;
}

/* --- Sidebar --- */
.sidebar {
    position: fixed;
    top: 56px; /* Height of navbar */
    bottom: 0;
    left: 0;
    z-index: 100;
    padding: 0;
    box-shadow: inset -1px 0 0 rgba(0, 0, 0, .1);
    overflow-x: hidden;
    overflow-y: auto;
}

.sidebar .nav-link {
    font-weight: 500;
    color: #333;
    padding: 0.5rem 1rem;
}

.sidebar .nav-link:hover {
    color: var(--ls-primary);
    background-color: rgba(0, 0, 0, .05);
}

.sidebar .nav-link.active {
    color: var(--ls-primary);
    border-left: 3px solid var(--ls-primary);
    background-color: rgba(13, 110, 253, .1);
}

.sidebar-heading {
    font-size: .75rem;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.05em;
}

/* --- Main Content --- */
main {
    padding-top: 1rem;
    min-height: calc(100vh - 120px);
}

@media (min-width: 768px) {
    main {
        margin-left: var(--sidebar-width);
    }
}

/* --- Typography --- */
h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
}

h1 {
    font-size: 2rem;
}

h2 {
    font-size: 1.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--ls-border);
}

h3 {
    font-size: 1.5rem;
}

.lead {
    font-size: 1.15rem;
    color: #6c757d;
}

/* --- Screenshots & Images --- */
.figure {
    margin: 1.5rem 0;
}

.figure-img {
    max-width: 100%;
    height: auto;
    border: 1px solid var(--ls-border);
}

.figure-caption {
    font-size: 0.9rem;
    color: #6c757d;
    font-style: italic;
    margin-top: 0.5rem;
}

/* --- Cards --- */
.card {
    box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
}

/* --- Alerts --- */
.alert {
    border-left: 4px solid;
}

.alert-info {
    border-left-color: #0dcaf0;
}

.alert-warning {
    border-left-color: #ffc107;
}

.alert-danger {
    border-left-color: #dc3545;
}

.alert-success {
    border-left-color: #198754;
}

/* --- Code & Keyboard Shortcuts --- */
kbd {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 0.25rem;
    padding: 0.2rem 0.4rem;
    font-size: 0.875rem;
    color: #212529;
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.1);
}

code {
    color: #d63384;
    background-color: #f8f9fa;
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
}

/* --- Tables --- */
.table {
    margin-bottom: 1rem;
}

.table thead th {
    border-bottom: 2px solid var(--ls-border);
    font-weight: 600;
}

/* --- Footer --- */
.footer {
    position: fixed;
    bottom: 0;
    width: 100%;
    background-color: var(--ls-light);
    border-top: 1px solid var(--ls-border);
    z-index: 1000;
}

/* --- Print Styles --- */
@media print {
    .navbar,
    .sidebar,
    .footer,
    .btn-toolbar {
        display: none !important;
    }

    main {
        margin-left: 0 !important;
        padding: 0 !important;
    }

    .figure-img {
        max-width: 100%;
        page-break-inside: avoid;
    }

    h2, h3 {
        page-break-after: avoid;
    }
}

/* --- Responsive Design --- */
@media (max-width: 767.98px) {
    .sidebar {
        position: static;
        height: auto;
        box-shadow: none;
    }

    main {
        margin-left: 0;
    }

    .footer {
        position: static;
    }

    body {
        padding-bottom: 0;
    }
}

/* --- Smooth Scrolling --- */
html {
    scroll-behavior: smooth;
}

/* --- Active Navigation Highlighting --- */
.nav-link:focus,
.nav-link:hover {
    outline: none;
}

/* --- Back to Top Button --- */
.back-to-top {
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 999;
    display: none;
}

.back-to-top.show {
    display: block;
}
```

### Bootstrap 5 CDN Strategy

**Primary CDN:** jsDelivr (with integrity hashes)
```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
      rel="stylesheet"
      integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN"
      crossorigin="anonymous">
```

**Rationale:**
- CDN provides fast loading and browser caching
- No need to bundle Bootstrap in repository
- Integrity hashes ensure security
- Fallback to offline: users can view content even if CDN fails (Bootstrap enhances but isn't required)

**Offline Alternative (Optional):**
For fully offline support, download Bootstrap and store in `assets/vendor/`:
```
assets/
└── vendor/
    └── bootstrap-5.3.2/
        ├── css/
        │   └── bootstrap.min.css
        └── js/
            └── bootstrap.bundle.min.js
```

## JavaScript Architecture

### Optional Enhancements (`assets/js/manual.js`)

```javascript
/* ========================================
   LeagueSphere User Manual JavaScript
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Highlight current page in sidebar
    highlightCurrentPage();

    // Add back-to-top button
    addBackToTopButton();

    // Enable tooltips (if Bootstrap tooltips are used)
    enableTooltips();

    // Track scroll position for sidebar highlighting
    trackScrollPosition();
});

/**
 * Highlight the current page in the sidebar navigation
 */
function highlightCurrentPage() {
    const currentPage = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.sidebar .nav-link');

    navLinks.forEach(link => {
        const linkHref = link.getAttribute('href');
        if (linkHref === currentPage) {
            link.classList.add('active');
        }
    });
}

/**
 * Add a back-to-top button
 */
function addBackToTopButton() {
    const button = document.createElement('button');
    button.innerHTML = '&uarr;';
    button.className = 'btn btn-primary back-to-top';
    button.setAttribute('aria-label', 'Nach oben');
    button.title = 'Nach oben';

    document.body.appendChild(button);

    // Show/hide button based on scroll position
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            button.classList.add('show');
        } else {
            button.classList.remove('show');
        }
    });

    // Scroll to top on click
    button.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

/**
 * Enable Bootstrap tooltips
 */
function enableTooltips() {
    const tooltipTriggerList = [].slice.call(
        document.querySelectorAll('[data-bs-toggle="tooltip"]')
    );
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

/**
 * Track scroll position and highlight sections in sidebar
 */
function trackScrollPosition() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.sidebar .nav-link');

    if (sections.length === 0) return;

    window.addEventListener('scroll', function() {
        let current = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;

            if (window.pageYOffset >= (sectionTop - 60)) {
                current = section.getAttribute('id');
            }
        });

        // This would require anchor links in sidebar
        // Implementation depends on content structure
    });
}

/**
 * Copy code snippets to clipboard (if code examples are present)
 */
function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('pre code');

    codeBlocks.forEach(codeBlock => {
        const button = document.createElement('button');
        button.className = 'btn btn-sm btn-outline-secondary copy-button';
        button.textContent = 'Kopieren';
        button.style.position = 'absolute';
        button.style.top = '5px';
        button.style.right = '5px';

        const pre = codeBlock.parentElement;
        pre.style.position = 'relative';
        pre.appendChild(button);

        button.addEventListener('click', function() {
            const text = codeBlock.textContent;
            navigator.clipboard.writeText(text).then(() => {
                button.textContent = 'Kopiert!';
                setTimeout(() => {
                    button.textContent = 'Kopieren';
                }, 2000);
            });
        });
    });
}

/**
 * Add search functionality (optional advanced feature)
 */
function addSearchFunctionality() {
    // This would require indexing content or using a simple client-side search
    // Implementation deferred to future enhancement
}
```

## Screenshot Organization

### Naming Convention

**Format:** `[feature]-[action]-[number].png`

**Examples:**
- `gamedays-list-01.png` - First screenshot of gamedays list view
- `passcheck-search-01.png` - Passcheck search interface
- `scorecard-scoring-02.png` - Second screenshot of scoring interface

**Guidelines:**
- Use lowercase
- Use hyphens for separation
- Use descriptive action names
- Number sequentially (01, 02, 03...)
- Keep names under 50 characters
- PNG format preferred (best for UI screenshots)

### Screenshot Specifications

**Image Requirements:**
- Format: PNG (recommended) or JPG
- Resolution: 1920x1080 or actual browser viewport
- Quality: High quality, no compression artifacts
- Size: Optimize to <500KB per image (use tools like TinyPNG)
- Content: Crop to relevant UI area (remove unnecessary browser chrome)

**Screenshot Capture Guidelines:**
1. Use consistent browser (Chrome/Firefox)
2. Set browser zoom to 100%
3. Use consistent viewport size (1920x1080 recommended)
4. Capture in light mode (for consistency)
5. Hide personal information (anonymize user names/emails if present)
6. Focus on the feature being documented
7. Use annotation tools sparingly (prefer captions in HTML)

**Recommended Tools:**
- **macOS:** Screenshot app (Cmd+Shift+4) or CleanShot X
- **Windows:** Snipping Tool or ShareX
- **Linux:** Flameshot or GNOME Screenshot
- **Browser:** Chrome DevTools device toolbar for consistent viewport
- **Annotation:** Skitch, Greenshot, or Photoshop (if needed)

### Directory Organization

Each feature gets its own subdirectory under `screenshots/`:

```
screenshots/
├── intro/           # Navigation & getting started
├── gamedays/        # Gamedays management
├── passcheck/       # Player eligibility
├── scorecard/       # Live scoring
├── officials/       # Officials management
├── liveticker/      # Real-time ticker
├── league-table/    # Standings & schedules
├── teammanager/     # Team management
└── accounts/        # User accounts
```

**Rationale:** Organizing by feature makes it easy to:
- Find screenshots quickly
- Update feature-specific screenshots without affecting others
- Maintain parallel structure with HTML pages
- Delete/replace outdated screenshots

## Page-Specific Architecture

### index.html - Landing Page

**Purpose:** Main entry point to the manual, providing overview and quick navigation.

**Content Structure:**
```html
<main>
    <!-- Hero Section -->
    <div class="jumbotron bg-light p-5 rounded">
        <h1 class="display-4">LeagueSphere Benutzerhandbuch</h1>
        <p class="lead">
            Willkommen zum Benutzerhandbuch von LeagueSphere, Ihrer
            Plattform für Flag-Football-Ligaverwaltung.
        </p>
        <hr class="my-4">
        <p>
            Dieses Handbuch führt Sie durch alle Funktionen der Anwendung.
        </p>
        <a class="btn btn-primary btn-lg" href="intro.html">
            Erste Schritte
        </a>
    </div>

    <!-- Feature Cards Grid -->
    <div class="row mt-5">
        <div class="col-md-4 mb-4">
            <div class="card h-100">
                <div class="card-body">
                    <h3 class="card-title">Spieltage verwalten</h3>
                    <p class="card-text">
                        Erstellen und verwalten Sie Spieltage, planen Sie Spiele
                        und verwalten Sie den Spielbetrieb.
                    </p>
                    <a href="gamedays.html" class="btn btn-primary">
                        Mehr erfahren
                    </a>
                </div>
            </div>
        </div>
        <!-- Repeat for each feature -->
    </div>

    <!-- Quick Links Section -->
    <div class="row mt-5">
        <div class="col-md-6">
            <h2>Schnellstart</h2>
            <ul class="list-group">
                <li class="list-group-item">
                    <a href="intro.html#login">Anmelden</a>
                </li>
                <li class="list-group-item">
                    <a href="intro.html#navigation">Navigation</a>
                </li>
                <!-- More quick links -->
            </ul>
        </div>
        <div class="col-md-6">
            <h2>Häufige Aufgaben</h2>
            <ul class="list-group">
                <li class="list-group-item">
                    <a href="gamedays.html#create">Spieltag erstellen</a>
                </li>
                <li class="list-group-item">
                    <a href="scorecard.html#scoring">Spiel bewerten</a>
                </li>
                <!-- More common tasks -->
            </ul>
        </div>
    </div>
</main>
```

### intro.html - Navigation & Getting Started

**Purpose:** Introduction to LeagueSphere UI, navigation patterns, and first steps.

**Sections:**
1. **Überblick** - What is LeagueSphere?
2. **Anmelden** - How to log in
3. **Hauptnavigation** - Overview of navigation bar
4. **Dashboard** - Main dashboard overview
5. **Benutzerrollen** - User roles and permissions

### gamedays.html - Gamedays Management

**Purpose:** Document gamedays list, creation, editing, and scheduling.

**Sections:**
1. **Übersicht** - Introduction to gamedays
2. **Spieltagsliste** - Viewing list of gamedays
3. **Spieltag erstellen** - Creating a new gameday
4. **Spieltag bearbeiten** - Editing gameday details
5. **Spiele planen** - Scheduling games
6. **Konflikte erkennen** - Conflict detection

### passcheck.html - Player Eligibility

**Purpose:** Document player eligibility checking interface.

**Sections:**
1. **Übersicht** - What is passcheck?
2. **Spieler suchen** - Searching for players
3. **Spielberechtigung prüfen** - Checking eligibility
4. **Statusanzeige** - Understanding eligibility status
5. **Integration mit Moodle** - Moodle integration explanation

### scorecard.html - Live Scoring

**Purpose:** Document live game scoring interface.

**Sections:**
1. **Übersicht** - Introduction to scorecard
2. **Spiel auswählen** - Selecting a game
3. **Punkte eingeben** - Entering scores
4. **Spieluhr verwalten** - Managing game clock
5. **Plays aufzeichnen** - Recording plays
6. **Spiel abschließen** - Finalizing game

### officials.html - Officials Management

**Purpose:** Document officials assignment and management.

**Sections:**
1. **Übersicht** - Officials management overview
2. **Schiedsrichter-Liste** - Viewing officials
3. **Schiedsrichter zuweisen** - Assigning officials to games
4. **Verfügbarkeit verwalten** - Managing availability

### liveticker.html - Real-time Ticker

**Purpose:** Document real-time game ticker display.

**Sections:**
1. **Übersicht** - What is the liveticker?
2. **Live-Anzeige** - Viewing live games
3. **Ereignisse** - Understanding events
4. **Filter** - Filtering games
5. **Aktualisierung** - How updates work

### league-table.html - League Standings

**Purpose:** Document standings and schedule displays.

**Sections:**
1. **Übersicht** - Standings and schedules overview
2. **Tabelle anzeigen** - Viewing league table
3. **Spielplan anzeigen** - Viewing schedule
4. **Statistiken** - Understanding statistics
5. **Export** - Exporting data

### teammanager.html - Team Management

**Purpose:** Document team and roster management.

**Sections:**
1. **Übersicht** - Team management overview
2. **Team-Liste** - Viewing teams
3. **Kader verwalten** - Managing rosters
4. **Spieler hinzufügen** - Adding players

### accounts.html - User Accounts

**Purpose:** Document user authentication and profile management.

**Sections:**
1. **Übersicht** - User accounts overview
2. **Anmelden** - Logging in
3. **Abmelden** - Logging out
4. **Profil bearbeiten** - Editing profile
5. **Passwort ändern** - Changing password
6. **Google OAuth** - Google authentication

## Navigation Strategy

### Primary Navigation Paths

1. **Top Navigation Bar**
   - Home → Landing page (index.html)
   - Erste Schritte → Getting started (intro.html)
   - Zur Anwendung → External link to https://leaguesphere.app

2. **Sidebar Navigation**
   - Lists all feature pages
   - Always visible (desktop) or collapsible (mobile)
   - Highlights current page

3. **In-Page Navigation**
   - Breadcrumbs at top of page
   - Table of contents (for long pages)
   - Anchor links to sections
   - Previous/Next navigation at bottom

4. **Cross-References**
   - Related pages linked in content
   - "See also" sections
   - Contextual links in text

### URL Structure

**Simple flat structure:**
```
/index.html
/intro.html
/gamedays.html
/passcheck.html
/scorecard.html
/officials.html
/liveticker.html
/league-table.html
/teammanager.html
/accounts.html
```

**Anchor links for sections:**
```
/gamedays.html#create
/passcheck.html#search
/scorecard.html#scoring
```

**Rationale:** Flat structure is simple, easy to maintain, and works reliably with `file://` protocol.

### Mobile Responsiveness

**Breakpoints:**
- **Desktop (≥768px):** Sidebar always visible, two-column layout
- **Tablet (576px-767px):** Collapsible sidebar, single-column main content
- **Mobile (<576px):** Hamburger menu, stacked layout, simplified navigation

**Mobile Optimizations:**
- Larger tap targets (min 44x44px)
- Collapsible navigation
- Optimized images (responsive images with srcset)
- Reduced padding/margins
- Simplified layouts

## Opening and Using the Manual

### Method 1: Direct File Opening (Recommended for Local Use)

1. Navigate to `/home/cda/dev/leaguesphere/docs/user-manual/` in file explorer
2. Double-click `index.html`
3. Browser will open with `file:///home/cda/dev/leaguesphere/docs/user-manual/index.html`

**Pros:**
- No server required
- Works offline
- Simple for end users

**Cons:**
- Bootstrap CDN requires internet connection
- Some browsers may restrict certain features (rare)

### Method 2: Local Web Server (Recommended for Development)

**Python SimpleHTTPServer:**
```bash
cd /home/cda/dev/leaguesphere/docs/user-manual
python3 -m http.server 8080
# Open browser to http://localhost:8080
```

**Node.js http-server:**
```bash
cd /home/cda/dev/leaguesphere/docs/user-manual
npx http-server -p 8080
# Open browser to http://localhost:8080
```

**Pros:**
- More reliable than file:// protocol
- Easier to test
- Mirrors production behavior

### Method 3: Integrated into Django (Production)

**Add to Django static files:**

1. Copy manual to Django static directory:
   ```bash
   cp -r docs/user-manual league_manager/static/manual
   ```

2. Add URL route in `league_manager/urls.py`:
   ```python
   from django.views.generic import RedirectView

   urlpatterns = [
       # ... existing patterns
       path('manual/', RedirectView.as_view(url='/static/manual/index.html')),
   ]
   ```

3. Update navigation in Django templates to include manual link

**Pros:**
- Integrated with main application
- Single deployment
- Version synchronized with application

**Cons:**
- Requires Django deployment
- Larger deployment size

### Method 4: GitHub Pages (Public Distribution)

**Deploy to GitHub Pages:**

1. Create `gh-pages` branch
2. Copy manual files to root of branch
3. Enable GitHub Pages in repository settings
4. Access at https://[username].github.io/leaguesphere/

**Pros:**
- Free public hosting
- Automatic deployment via GitHub Actions
- Professional URL

**Cons:**
- Public only (not suitable for internal documentation with screenshots of real data)

### Method 5: ZIP Distribution

**Create distributable archive:**
```bash
cd /home/cda/dev/leaguesphere/docs
zip -r leaguesphere-manual.zip user-manual/
```

**Pros:**
- Easy to share via email or file sharing
- Self-contained
- Version-specific

## Deployment Strategy

### Version Control

**Recommendation:** Track manual in main LeagueSphere repository under `docs/user-manual/`.

**Benefits:**
- Version synchronized with application
- Changes tracked in git history
- Easy to update during feature development
- Reviewable via pull requests

**Git Ignore Configuration:**
```
# .gitignore entries for manual
# Do NOT ignore the manual itself, but ignore temporary files
docs/user-manual/.DS_Store
docs/user-manual/Thumbs.db
docs/user-manual/**/*.tmp
```

### CI/CD Integration

**GitHub Actions workflow for manual deployment:**

```yaml
name: Deploy Manual

on:
  push:
    tags:
      - 'v*'
    paths:
      - 'docs/user-manual/**'

jobs:
  deploy-manual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate HTML
        run: |
          # Optional: Use HTML validator
          npm install -g html-validator-cli
          html-validator docs/user-manual/*.html

      - name: Optimize images
        run: |
          # Optional: Optimize PNG files
          sudo apt-get install -y optipng
          find docs/user-manual/screenshots -name "*.png" -exec optipng -o5 {} \;

      - name: Create archive
        run: |
          cd docs
          zip -r leaguesphere-manual-${{ github.ref_name }}.zip user-manual/

      - name: Upload to releases
        uses: softprops/action-gh-release@v1
        with:
          files: docs/leaguesphere-manual-${{ github.ref_name }}.zip
```

### Update Strategy

**When to update manual:**
1. **New features:** Document immediately after implementation
2. **UI changes:** Update screenshots when UI changes significantly
3. **Bug fixes:** Update if behavior changes
4. **Version releases:** Review entire manual for accuracy

**Update checklist:**
- [ ] Update screenshots if UI changed
- [ ] Update text descriptions
- [ ] Test all links
- [ ] Validate HTML
- [ ] Check mobile responsiveness
- [ ] Update version number in footer
- [ ] Create git commit with descriptive message

## Accessibility

### WCAG 2.1 AA Compliance

**Semantic HTML:**
- Use proper heading hierarchy (h1 → h2 → h3)
- Use semantic elements (`<nav>`, `<main>`, `<article>`, `<section>`)
- Use `<figure>` and `<figcaption>` for images

**Alt Text for Images:**
```html
<img src="screenshots/gamedays/gamedays-list-01.png"
     alt="Spieltagsliste zeigt Übersicht aller geplanten Spieltage mit Datum, Ort und Status"
     loading="lazy">
```

**Keyboard Navigation:**
- All interactive elements accessible via Tab
- Focus indicators visible
- Skip to main content link (optional enhancement)

**Color Contrast:**
- Text: minimum 4.5:1 ratio
- Large text: minimum 3:1 ratio
- Use Bootstrap's built-in accessible colors

**Screen Reader Support:**
- ARIA labels where appropriate
- Landmark roles
- Skip navigation link

**Example accessibility enhancements:**
```html
<!-- Skip to main content link -->
<a href="#main-content" class="visually-hidden-focusable">
    Zum Hauptinhalt springen
</a>

<!-- ARIA landmarks -->
<nav role="navigation" aria-label="Hauptnavigation">
    <!-- Navigation content -->
</nav>

<main id="main-content" role="main">
    <!-- Main content -->
</main>

<!-- Accessible buttons -->
<button type="button"
        class="btn btn-primary"
        aria-label="Spieltag erstellen">
    Erstellen
</button>
```

## Internationalization (Future)

While the initial manual is in German, the architecture supports future internationalization:

**Directory structure for multi-language:**
```
docs/user-manual/
├── de/                  # German (default)
│   ├── index.html
│   ├── intro.html
│   └── ...
├── en/                  # English
│   ├── index.html
│   ├── intro.html
│   └── ...
└── assets/              # Shared assets
    ├── css/
    ├── js/
    └── images/
```

**Language switcher:**
```html
<div class="dropdown">
    <button class="btn btn-sm btn-outline-secondary dropdown-toggle"
            type="button"
            data-bs-toggle="dropdown">
        Deutsch (DE)
    </button>
    <ul class="dropdown-menu">
        <li><a class="dropdown-item" href="../de/index.html">Deutsch</a></li>
        <li><a class="dropdown-item" href="../en/index.html">English</a></li>
    </ul>
</div>
```

## Testing & Validation

### Browser Compatibility

**Target Browsers:**
- Chrome 100+ (primary)
- Firefox 100+ (primary)
- Safari 15+ (secondary)
- Edge 100+ (secondary)

**Testing checklist:**
- [ ] All pages render correctly
- [ ] Navigation works
- [ ] Images load
- [ ] Responsive design works
- [ ] Print layout works
- [ ] Links work (both internal and external)

### HTML Validation

**Use W3C Validator:**
```bash
# Install validator
npm install -g html-validator-cli

# Validate all HTML files
html-validator docs/user-manual/*.html
```

### Accessibility Testing

**Tools:**
- WAVE browser extension
- axe DevTools
- Lighthouse accessibility audit
- NVDA or JAWS screen reader testing

### Performance Testing

**Target Metrics:**
- Page load: <2 seconds (on 3G)
- First Contentful Paint: <1 second
- Images: All <500KB
- Total page size: <2MB

**Optimization:**
- Optimize images (TinyPNG, ImageOptim)
- Lazy load images
- Minify CSS (optional, for production)
- Use CDN for Bootstrap (caching benefit)

## Maintenance & Documentation

### Content Update Process

1. **Identify change:** Feature update, bug fix, or UI change
2. **Update screenshots:** Capture new screenshots if UI changed
3. **Update HTML:** Modify content in relevant HTML file
4. **Test changes:** Open in browser, check links, verify rendering
5. **Commit to git:** Descriptive commit message
6. **Create PR:** Review by team member
7. **Merge and deploy:** Update production manual

### Style Guide for Content

**Writing Guidelines:**
- **Tone:** Professional but friendly
- **Voice:** Second person ("Sie" formal in German)
- **Tense:** Present tense for instructions
- **Length:** Short paragraphs (3-4 sentences max)
- **Lists:** Use bullet points or numbered lists for steps

**Formatting Guidelines:**
- **Headings:** Use sentence case (not title case)
- **Bold:** For UI elements (button names, menu items)
- **Italic:** For emphasis or new terms
- **Code:** For technical terms or URLs
- **Keyboard shortcuts:** Use `<kbd>` tag

**Example:**
```html
<p>
    Klicken Sie auf den Button <strong>Spieltag erstellen</strong>, um einen
    neuen Spieltag anzulegen. Alternativ können Sie die Tastenkombination
    <kbd>Strg</kbd>+<kbd>N</kbd> verwenden.
</p>
```

### Screenshot Update Guidelines

**When to update screenshots:**
- UI layout changes
- New features added
- Buttons or labels renamed
- Color scheme changes
- Accessibility improvements

**How to update:**
1. Navigate to feature on https://leaguesphere.app/
2. Capture screenshot using consistent tool and settings
3. Crop to relevant area
4. Optimize file size (<500KB)
5. Save with same filename (overwrite old screenshot)
6. Test in manual (reload page in browser)
7. Commit to git

## Implementation Guidance

### Development Phases

#### Phase 1: Structure Setup (Week 1)
- Create directory structure
- Create base HTML template
- Write custom CSS (`manual.css`)
- Write optional JS (`manual.js`)
- Create README.md with setup instructions

**Deliverables:**
- Complete directory structure
- Base HTML template with navigation
- Custom CSS file
- Optional JavaScript enhancements
- README with quick start guide

#### Phase 2: Content Creation (Week 2-3)
- Write content for each HTML page
- Create placeholder images
- Implement navigation between pages
- Add breadcrumbs and pagination

**Deliverables:**
- All 9 feature HTML pages with content
- Landing page (index.html)
- Cross-page navigation working
- Consistent layout and styling

#### Phase 3: Screenshot Capture (Week 4)
- Capture screenshots from https://leaguesphere.app/
- Organize screenshots by feature
- Optimize image sizes
- Add alt text descriptions

**Deliverables:**
- Complete screenshot library (~50-80 screenshots)
- Optimized images (<500KB each)
- Screenshots properly referenced in HTML

#### Phase 4: Testing & Refinement (Week 5)
- Browser compatibility testing
- Mobile responsiveness testing
- Accessibility testing
- Content review and proofreading
- Link validation

**Deliverables:**
- Validated HTML
- Tested across browsers
- Accessibility audit passed
- Content reviewed and approved

#### Phase 5: Deployment (Week 6)
- Integrate with Django (optional)
- Setup CI/CD for manual updates
- Create distribution ZIP
- Document usage instructions

**Deliverables:**
- Deployed manual (via chosen method)
- Distribution archive
- Documentation for end users
- Update process documented

### Task Breakdown

**For Implementation Engineer:**

1. **Setup Phase:**
   - Create directory structure
   - Copy base HTML template to all pages
   - Write custom CSS
   - Write optional JavaScript

2. **Content Phase:**
   - Fill in content for each page (German text)
   - Create placeholder images
   - Implement navigation

3. **Screenshot Phase:**
   - Capture screenshots from production app
   - Organize and optimize images
   - Insert into HTML pages

4. **Testing Phase:**
   - Validate HTML
   - Test in multiple browsers
   - Run accessibility audit
   - Fix issues

5. **Deployment Phase:**
   - Choose deployment method
   - Setup CI/CD (if applicable)
   - Create distribution archive
   - Write user documentation

## Risks & Mitigations

### Risk 1: Screenshots Become Outdated
**Probability:** High
**Impact:** Medium

**Mitigation:**
- Version screenshots with app version
- Create screenshot update checklist
- Automate screenshot capture (Playwright/Puppeteer)
- Document screenshot update process
- Include "last updated" dates on pages

### Risk 2: Bootstrap CDN Unavailable
**Probability:** Low
**Impact:** Medium

**Mitigation:**
- Manual still functional without Bootstrap (degraded styling)
- Consider bundling Bootstrap for offline use
- Use integrity hashes to prevent tampering
- Fallback to local Bootstrap if CDN fails (optional enhancement)

### Risk 3: Content Becomes Stale
**Probability:** Medium
**Impact:** High

**Mitigation:**
- Include manual updates in feature development workflow
- Assign manual ownership to team member
- Review manual quarterly
- Track manual version with app version
- Add "last updated" metadata to pages

### Risk 4: Large File Size
**Probability:** Medium
**Impact:** Low

**Mitigation:**
- Optimize all images (<500KB target)
- Use lazy loading for images
- Consider progressive JPEGs
- Monitor total manual size (<50MB target)

## Future Considerations

### Enhancement Ideas

1. **Interactive Elements:**
   - Embedded video tutorials
   - Interactive walkthroughs
   - Searchable content
   - Collapsible sections

2. **Advanced Features:**
   - Full-text search (client-side)
   - Glossary with term definitions
   - Tooltips for technical terms
   - Dark mode toggle
   - Print-friendly layouts

3. **Automation:**
   - Automated screenshot capture
   - Automated screenshot diffing (detect UI changes)
   - Automated HTML validation in CI/CD
   - Automated accessibility testing

4. **Analytics:**
   - Track page views (if hosted)
   - Identify most-visited sections
   - Track search queries
   - Monitor user feedback

5. **Multilingual Support:**
   - English translation
   - Language switcher
   - Localized screenshots

## Appendix

### Technology Stack

**Frontend:**
- HTML5
- CSS3
- JavaScript (ES6+)
- Bootstrap 5.3.2 (via CDN)

**Tools:**
- Any modern text editor (VS Code, Sublime, etc.)
- Browser DevTools (Chrome/Firefox)
- Screenshot tools (platform-specific)
- Image optimization tools (TinyPNG, ImageOptim)
- HTML validator (W3C)

**No Build Tools Required:**
- No webpack, npm build, or transpilation
- Direct HTML editing
- Simple CSS and JS files
- CDN-based dependencies

### File Size Estimates

**Per Page:**
- HTML: ~20-50 KB
- Screenshots: ~200-500 KB each (5-10 per page = 1-5 MB)
- Total per page: ~1-5 MB

**Total Manual:**
- 10 HTML pages: ~200-500 KB
- ~80 screenshots: ~16-40 MB
- CSS/JS: ~50 KB
- Total: ~20-50 MB

**Optimization target:** Keep total manual under 30 MB for reasonable download/distribution.

### Glossary

- **Gameday:** Spieltag - A scheduled day with multiple games
- **Passcheck:** Player eligibility verification system
- **Scorecard:** Live game scoring interface
- **Liveticker:** Real-time game event ticker
- **Officials:** Schiedsrichter - Game referees
- **Division:** Liga - League division/tier

### References

- **Bootstrap 5 Documentation:** https://getbootstrap.com/docs/5.3/
- **HTML5 Specification:** https://html.spec.whatwg.org/
- **WCAG 2.1 Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **LeagueSphere Production:** https://leaguesphere.app/
- **LeagueSphere GitHub:** https://github.com/dachrisch/leaguesphere

### Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-07 | Architecture Designer | Initial architecture document |

---

**Document Status:** Draft - Ready for Implementation

**Next Steps:**
1. Review and approve architecture
2. Begin Phase 1 implementation (structure setup)
3. Capture initial screenshots
4. Create first content pages
5. Test and iterate

**Approval Required By:**
- Project Owner
- Implementation Engineer
- QA Engineer (for testing strategy review)

**Questions or Feedback:**
Please discuss in project repository or team channel.
