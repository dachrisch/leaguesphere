# Content Template for Documentation Specialist

This file provides templates and examples for adding content to the user manual HTML pages.

## Section Structure Template

Each section should follow this pattern:

```html
<section id="section-id" class="mb-5">
    <h2>Section Title</h2>
    <p class="lead">
        Brief introduction to this section (1-2 sentences).
    </p>

    <!-- Main content -->
    <p>
        Detailed explanation of the feature or functionality.
    </p>

    <!-- Screenshot (to be added by qa-engineer) -->
    <figure class="figure">
        <img src="screenshots/[feature]/[screenshot-name].png"
             class="figure-img img-fluid rounded shadow-sm"
             alt="[Description]"
             loading="lazy">
        <figcaption class="figure-caption">
            Screenshot caption explaining what the user sees
        </figcaption>
    </figure>

    <!-- Additional content if needed -->
</section>
```

## Step-by-Step Instructions Template

For procedural instructions, use this pattern:

```html
<div class="card mb-4">
    <div class="card-header">
        <h3 class="h5 mb-0">Task: Einen Spieltag erstellen</h3>
    </div>
    <div class="card-body">
        <ol class="list-group list-group-numbered list-group-flush">
            <li class="list-group-item">
                <strong>Schritt 1:</strong> Navigieren Sie zur Spieltags-Übersicht
                <p class="text-muted mb-0 mt-2">
                    Klicken Sie im Hauptmenü auf "Spieltage".
                </p>
            </li>
            <li class="list-group-item">
                <strong>Schritt 2:</strong> Klicken Sie auf "Neuer Spieltag"
                <p class="text-muted mb-0 mt-2">
                    Der Button befindet sich oben rechts in der Liste.
                </p>
            </li>
            <li class="list-group-item">
                <strong>Schritt 3:</strong> Füllen Sie das Formular aus
                <p class="text-muted mb-0 mt-2">
                    Geben Sie Datum, Ort und weitere Details ein.
                </p>
            </li>
            <li class="list-group-item">
                <strong>Schritt 4:</strong> Speichern Sie den Spieltag
                <p class="text-muted mb-0 mt-2">
                    Klicken Sie auf "Speichern" am Ende des Formulars.
                </p>
            </li>
        </ol>
    </div>
</div>
```

## Alert/Notice Template

For important notes, tips, warnings, or errors:

```html
<!-- Info Alert -->
<div class="alert alert-info" role="alert">
    <strong>Hinweis:</strong> Diese Funktion ist nur für angemeldete Benutzer verfügbar.
</div>

<!-- Warning Alert -->
<div class="alert alert-warning" role="alert">
    <strong>Achtung:</strong> Änderungen können nicht rückgängig gemacht werden.
</div>

<!-- Success Alert -->
<div class="alert alert-success" role="alert">
    <strong>Tipp:</strong> Nutzen Sie Tastenkombinationen für schnelleren Zugriff.
</div>

<!-- Danger Alert -->
<div class="alert alert-danger" role="alert">
    <strong>Warnung:</strong> Diese Aktion löscht alle zugehörigen Daten.
</div>
```

## Quick Reference Card Template

For feature summaries or button descriptions:

```html
<div class="card border-primary mb-3">
    <div class="card-header bg-primary text-white">
        Schnellreferenz: Scoring-Buttons
    </div>
    <div class="card-body">
        <table class="table table-sm">
            <thead>
                <tr>
                    <th>Button</th>
                    <th>Punkte</th>
                    <th>Beschreibung</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><kbd>Touchdown</kbd></td>
                    <td>6</td>
                    <td>Touchdown für das gewählte Team</td>
                </tr>
                <tr>
                    <td><kbd>Extra Point</kbd></td>
                    <td>1</td>
                    <td>Extrapunkt nach Touchdown</td>
                </tr>
                <tr>
                    <td><kbd>Safety</kbd></td>
                    <td>2</td>
                    <td>Safety für das gegnerische Team</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
```

## List Templates

### Unordered List (Bullet Points)
```html
<ul>
    <li>Erster Punkt</li>
    <li>Zweiter Punkt</li>
    <li>Dritter Punkt</li>
</ul>
```

### Ordered List (Numbered)
```html
<ol>
    <li>Erster Schritt</li>
    <li>Zweiter Schritt</li>
    <li>Dritter Schritt</li>
</ol>
```

### Description List
```html
<dl class="row">
    <dt class="col-sm-3">Spielberechtigt</dt>
    <dd class="col-sm-9">Der Spieler ist berechtigt zu spielen</dd>

    <dt class="col-sm-3">Nicht berechtigt</dt>
    <dd class="col-sm-9">Der Spieler ist nicht berechtigt zu spielen</dd>

    <dt class="col-sm-3">Unbekannt</dt>
    <dd class="col-sm-9">Der Status konnte nicht ermittelt werden</dd>
</dl>
```

## Inline Elements

### Bold (UI Elements, Button Names)
```html
Klicken Sie auf den Button <strong>Speichern</strong>.
```

### Italic (Emphasis)
```html
Dies ist <em>besonders wichtig</em> zu beachten.
```

### Keyboard Shortcut
```html
Verwenden Sie <kbd>Strg</kbd>+<kbd>S</kbd> zum Speichern.
```

### Code (Technical Terms)
```html
Die API-Endpunkt ist <code>/api/gamedays/</code>.
```

### Links
```html
<!-- Internal link -->
Siehe auch <a href="gamedays.html#erstellen">Spieltag erstellen</a>.

<!-- External link -->
Weitere Informationen auf <a href="https://leaguesphere.app" target="_blank" rel="noopener noreferrer">leaguesphere.app</a>.

<!-- Anchor link within same page -->
Springen Sie zu <a href="#section-id">diesem Abschnitt</a>.
```

## Table Template

```html
<table class="table table-striped">
    <thead>
        <tr>
            <th>Spalte 1</th>
            <th>Spalte 2</th>
            <th>Spalte 3</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Daten 1</td>
            <td>Daten 2</td>
            <td>Daten 3</td>
        </tr>
        <tr>
            <td>Daten 4</td>
            <td>Daten 5</td>
            <td>Daten 6</td>
        </tr>
    </tbody>
</table>
```

## Collapsible Section Template (Optional)

```html
<div class="accordion mb-4" id="accordionExample">
    <div class="accordion-item">
        <h2 class="accordion-header">
            <button class="accordion-button" type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#collapseOne">
                Erweiterte Optionen
            </button>
        </h2>
        <div id="collapseOne" class="accordion-collapse collapse"
             data-bs-parent="#accordionExample">
            <div class="accordion-body">
                <p>Inhalt der erweiterten Optionen...</p>
            </div>
        </div>
    </div>
</div>
```

## Writing Guidelines

### Tone and Voice
- **Tone:** Professional but friendly
- **Voice:** Second person formal ("Sie")
- **Tense:** Present tense for instructions

### Writing Style
- Keep paragraphs short (3-4 sentences max)
- Use active voice
- Be concise but clear
- Use bullet points for lists
- Number steps for procedures

### Formatting
- **Headings:** Use sentence case (not title case)
- **Bold:** For UI elements, button names, menu items
- **Italic:** For emphasis or new terms
- **Code:** For technical terms, URLs, code snippets
- **Keyboard shortcuts:** Use `<kbd>` tag

### Examples

**Good:**
```html
<p>
    Klicken Sie auf den Button <strong>Spieltag erstellen</strong>, um einen
    neuen Spieltag anzulegen. Alternativ können Sie die Tastenkombination
    <kbd>Strg</kbd>+<kbd>N</kbd> verwenden.
</p>
```

**Avoid:**
```html
<p>
    Sie können den "Spieltag erstellen" Button klicken oder STRG+N drücken
    um ein neuer Spieltag zu erstellen.
</p>
```

## Content Checklist

Before submitting content, verify:
- [ ] All sections have content (no empty sections)
- [ ] Instructions are clear and step-by-step
- [ ] UI elements are marked with `<strong>`
- [ ] Keyboard shortcuts use `<kbd>` tags
- [ ] Links use proper target and rel attributes
- [ ] Important notes use alert boxes
- [ ] Screenshots have placeholder comments for qa-engineer
- [ ] German language is correct (formal "Sie")
- [ ] HTML is valid (no unclosed tags)
- [ ] Content is accessible (semantic HTML)

## Example: Complete Section

```html
<section id="spieltag-erstellen" class="mb-5">
    <h2>Spieltag erstellen</h2>
    <p class="lead">
        Erstellen Sie einen neuen Spieltag mit allen erforderlichen Details
        wie Datum, Ort und beteiligte Teams.
    </p>

    <p>
        Ein Spieltag ist ein Container für mehrere Spiele, die an einem
        bestimmten Tag stattfinden. Sie können für jeden Spieltag einen
        eigenen Namen, ein Datum und einen Ort festlegen.
    </p>

    <div class="alert alert-info" role="alert">
        <strong>Hinweis:</strong> Sie benötigen Administrator-Rechte, um
        Spieltage zu erstellen.
    </div>

    <h3 class="mt-4">So erstellen Sie einen Spieltag:</h3>

    <div class="card mb-4">
        <div class="card-header">
            <h4 class="h5 mb-0">Schritt-für-Schritt-Anleitung</h4>
        </div>
        <div class="card-body">
            <ol class="list-group list-group-numbered list-group-flush">
                <li class="list-group-item">
                    <strong>Öffnen Sie die Spieltags-Übersicht</strong>
                    <p class="text-muted mb-0 mt-2">
                        Klicken Sie im Hauptmenü auf <strong>Spieltage</strong>
                        oder navigieren Sie direkt zu <code>/gamedays/</code>.
                    </p>
                </li>
                <li class="list-group-item">
                    <strong>Klicken Sie auf "Neuer Spieltag"</strong>
                    <p class="text-muted mb-0 mt-2">
                        Der Button befindet sich oben rechts in der Übersicht.
                    </p>
                    <!-- Screenshot will be added by qa-engineer -->
                    <figure class="figure mt-3">
                        <img src="screenshots/gamedays/gamedays-create-01.png"
                             class="figure-img img-fluid rounded shadow-sm"
                             alt="Spieltags-Erstellungsformular mit Feldern für Name, Datum und Ort"
                             loading="lazy">
                        <figcaption class="figure-caption">
                            Das Formular zur Erstellung eines neuen Spieltags
                        </figcaption>
                    </figure>
                </li>
                <li class="list-group-item">
                    <strong>Füllen Sie das Formular aus</strong>
                    <p class="text-muted mb-0 mt-2">
                        Geben Sie folgende Informationen ein:
                    </p>
                    <ul class="mt-2">
                        <li><strong>Name:</strong> Bezeichnung des Spieltags (z.B. "Spieltag 1")</li>
                        <li><strong>Datum:</strong> Datum des Spieltags</li>
                        <li><strong>Ort:</strong> Spielstätte oder Standort</li>
                        <li><strong>Division:</strong> Zugehörige Liga-Division</li>
                    </ul>
                </li>
                <li class="list-group-item">
                    <strong>Speichern Sie den Spieltag</strong>
                    <p class="text-muted mb-0 mt-2">
                        Klicken Sie auf <strong>Speichern</strong> am Ende des Formulars.
                        Der neue Spieltag erscheint nun in der Übersicht.
                    </p>
                </li>
            </ol>
        </div>
    </div>

    <div class="alert alert-success mt-4" role="alert">
        <strong>Tipp:</strong> Verwenden Sie konsistente Namenskonventionen für
        Ihre Spieltage (z.B. "Spieltag 1", "Spieltag 2"), um sie leichter
        wiederzufinden.
    </div>
</section>
```

## Next Steps

1. Review existing HTML files in `/home/cda/dev/leaguesphere/docs/user-manual/`
2. Replace placeholder comments with actual content
3. Follow the templates and examples above
4. Ensure all content is in German (formal "Sie")
5. Leave screenshot placeholders for qa-engineer
6. Test your changes by opening the HTML files in a browser

## Questions?

If you have questions about the structure or need clarification, refer to:
- `ARCHITECTURE.md` - Full architecture documentation
- `README.md` - Quick start guide
- Bootstrap 5 documentation: https://getbootstrap.com/docs/5.3/
