# ResourceURL CRUD in React Gameday Designer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the React gameday designer's metadata accordion list, add, edit, and delete a gameday's resource URLs, persisting them as real `ResourceUrl` DB rows.

**Architecture:** Reuse the existing `/api/gamedays/{id}/` endpoint. Add a nested writable `resource_urls` field to `GamedaySerializer` whose `update()` reconciles the set (create new / update existing / delete omitted). The accordion fetches URLs via `getGameday(metadata.id)`, holds them in local state, and saves the whole list via `patchGameday(id, { resource_urls })` on row blur / delete — independent of the designer-state autosave blob, so URLs persist immediately.

**Tech Stack:** Django REST Framework (backend), React 19 + TypeScript + react-bootstrap + Vitest/Testing Library (frontend), i18next.

## Global Constraints

- Reuse the existing `/api/gamedays/{id}/` endpoint — no new route or viewset.
- Save semantics: PATCH replaces the whole URL set (create new, update existing, delete omitted). Matches the old Django designer's formset (`can_delete`).
- URLs persist immediately via `patchGameday`, NOT through the flow-state (`updateDesignerState`) blob.
- `readOnly` mode disables all URL editing (no inputs editable, no add/delete).
- German UI parity via i18next keys in both `en/ui.json` and `de/ui.json`.
- Reverse accessor for URLs on a gameday is `resourceurl_set` (no `related_name` on the model). The PR already added `prefetch_related('resourceurl_set')` to the detail view.
- `ResourceUrl` fields: `url` (`URLField`, max 500, required), `description` (`CharField`, max 50, required).

---

### Task 1: Backend — expose `resource_urls` on GamedaySerializer (read)

**Files:**
- Modify: `gamedays/api/serializers.py` (imports at top ~line 6-15; `GamedaySerializer` at lines 33-38)
- Test: `gamedays/tests/api/test_gameday_viewset.py`

**Interfaces:**
- Produces: `ResourceUrlSerializer` (fields `id` optional, `url`, `description`); `GamedaySerializer.resource_urls` nested list field with `source="resourceurl_set"`. GET `/api/gamedays/{id}/` response includes `resource_urls: [{id, url, description}, ...]`.

- [ ] **Step 1: Write the failing test**

Add to `gamedays/tests/api/test_gameday_viewset.py` inside `GamedayViewSetTest`:

```python
def test_get_gameday_includes_resource_urls(self):
    from gamedays.models import ResourceUrl
    ResourceUrl.objects.create(
        gameday=self.gameday1, url="https://example.com/a", description="Livestream"
    )
    response = self.client.get(f"/api/gamedays/{self.gameday1.id}/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["resource_urls"] == [
        {"id": self.gameday1.resourceurl_set.first().id,
         "url": "https://example.com/a",
         "description": "Livestream"}
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && ./container/spinup_test_db.sh` is NOT needed for API serializer tests; run `cd leaguesphere && uv run pytest gamedays/tests/api/test_gameday_viewset.py::GamedayViewSetTest::test_get_gameday_includes_resource_urls -v`
Expected: FAIL with `KeyError: 'resource_urls'`.

- [ ] **Step 3: Write minimal implementation**

In `gamedays/api/serializers.py`, add `ResourceUrl` to the `from gamedays.models import (...)` block:

```python
from gamedays.models import (
    Gameday,
    GamedayDesignerState,
    Gameinfo,
    GameOfficial,
    GameSetup,
    Season,
    League,
    Gameresult,
    ResourceUrl,
)
```

Add the serializer above `GamedaySerializer`:

```python
class ResourceUrlSerializer(ModelSerializer):
    id = IntegerField(required=False)

    class Meta:
        model = ResourceUrl
        fields = ["id", "url", "description"]
```

Add the nested field to `GamedaySerializer`:

```python
class GamedaySerializer(ModelSerializer):
    resource_urls = ResourceUrlSerializer(
        many=True, source="resourceurl_set", required=False
    )

    class Meta:
        model = Gameday
        fields = "__all__"
        read_only_fields = ["author"]
        extra_kwargs = {"start": {"format": "%H:%M"}}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd leaguesphere && uv run pytest gamedays/tests/api/test_gameday_viewset.py::GamedayViewSetTest::test_get_gameday_includes_resource_urls -v`
Expected: PASS

- [ ] **Step 5: Run the full viewset test file to check for regressions**

Run: `cd leaguesphere && uv run pytest gamedays/tests/api/test_gameday_viewset.py -v`
Expected: PASS (create/list tests unaffected — `resource_urls` is `required=False`).

- [ ] **Step 6: Commit**

```bash
cd leaguesphere
git add gamedays/api/serializers.py gamedays/tests/api/test_gameday_viewset.py
git commit -m "feat(api): expose resource_urls on GamedaySerializer"
```

---

### Task 2: Backend — reconcile `resource_urls` on PATCH (write)

**Files:**
- Modify: `gamedays/api/serializers.py` (`GamedaySerializer` — add `update()` + `_sync_resource_urls`)
- Test: `gamedays/tests/api/test_gameday_viewset.py`

**Interfaces:**
- Consumes: `GamedaySerializer.resource_urls` field from Task 1.
- Produces: PATCH `/api/gamedays/{id}/` with `{"resource_urls": [...]}` reconciles rows — items with a matching `id` are updated, items without are created, existing rows whose `id` is omitted are deleted.

- [ ] **Step 1: Write the failing tests**

Add to `GamedayViewSetTest`:

```python
def test_patch_adds_resource_url(self):
    from gamedays.models import ResourceUrl
    response = self.client.patch(
        f"/api/gamedays/{self.gameday1.id}/",
        {"resource_urls": [{"url": "https://example.com/x", "description": "X"}]},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    urls = ResourceUrl.objects.filter(gameday=self.gameday1)
    assert urls.count() == 1
    assert urls.first().url == "https://example.com/x"
    assert urls.first().description == "X"

def test_patch_updates_existing_resource_url(self):
    from gamedays.models import ResourceUrl
    ru = ResourceUrl.objects.create(
        gameday=self.gameday1, url="https://example.com/old", description="Old"
    )
    response = self.client.patch(
        f"/api/gamedays/{self.gameday1.id}/",
        {"resource_urls": [
            {"id": ru.id, "url": "https://example.com/new", "description": "New"}
        ]},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    ru.refresh_from_db()
    assert ru.url == "https://example.com/new"
    assert ru.description == "New"
    assert ResourceUrl.objects.filter(gameday=self.gameday1).count() == 1

def test_patch_deletes_omitted_resource_url(self):
    from gamedays.models import ResourceUrl
    ru_keep = ResourceUrl.objects.create(
        gameday=self.gameday1, url="https://example.com/keep", description="Keep"
    )
    ResourceUrl.objects.create(
        gameday=self.gameday1, url="https://example.com/drop", description="Drop"
    )
    response = self.client.patch(
        f"/api/gamedays/{self.gameday1.id}/",
        {"resource_urls": [
            {"id": ru_keep.id, "url": ru_keep.url, "description": ru_keep.description}
        ]},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    remaining = list(
        ResourceUrl.objects.filter(gameday=self.gameday1)
        .values_list("id", flat=True)
    )
    assert remaining == [ru_keep.id]

def test_patch_invalid_url_returns_400(self):
    response = self.client.patch(
        f"/api/gamedays/{self.gameday1.id}/",
        {"resource_urls": [{"url": "not-a-url", "description": "Bad"}]},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere && uv run pytest gamedays/tests/api/test_gameday_viewset.py -v -k resource_url`
Expected: `test_patch_adds_resource_url`, `test_patch_updates_existing_resource_url`, `test_patch_deletes_omitted_resource_url` FAIL (URLs not persisted — default nested write is ignored/raises). `test_patch_invalid_url_returns_400` may already pass (field validation) — that is fine.

- [ ] **Step 3: Write the implementation**

Add `update()` and `_sync_resource_urls` to `GamedaySerializer` (below the `Meta` class):

```python
    def update(self, instance, validated_data):
        resource_urls = validated_data.pop("resourceurl_set", None)
        gameday = super().update(instance, validated_data)
        if resource_urls is not None:
            self._sync_resource_urls(gameday, resource_urls)
        return gameday

    @staticmethod
    def _sync_resource_urls(gameday, resource_urls):
        existing = {ru.id: ru for ru in gameday.resourceurl_set.all()}
        seen_ids = set()
        for item in resource_urls:
            ru_id = item.get("id")
            if ru_id and ru_id in existing:
                ru = existing[ru_id]
                ru.url = item["url"]
                ru.description = item["description"]
                ru.save()
                seen_ids.add(ru_id)
            else:
                ResourceUrl.objects.create(
                    gameday=gameday,
                    url=item["url"],
                    description=item["description"],
                )
        for ru_id, ru in existing.items():
            if ru_id not in seen_ids:
                ru.delete()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere && uv run pytest gamedays/tests/api/test_gameday_viewset.py -v`
Expected: PASS (all, including the Task 1 read test and pre-existing tests).

- [ ] **Step 5: Commit**

```bash
cd leaguesphere
git add gamedays/api/serializers.py gamedays/tests/api/test_gameday_viewset.py
git commit -m "feat(api): reconcile resource_urls on gameday PATCH"
```

---

### Task 3: Frontend — types + i18n keys + render existing URLs in accordion

**Files:**
- Modify: `gameday_designer/src/types/api.ts` (`GamedayMetadata` at lines 156-170; add `ResourceUrl`)
- Modify: `gameday_designer/src/types/index.ts` (export list ~lines 54-57)
- Modify: `gameday_designer/src/i18n/locales/en/ui.json` and `gameday_designer/src/i18n/locales/de/ui.json` (`label` and `button` objects)
- Modify: `gameday_designer/src/components/GamedayMetadataAccordion.tsx`
- Test: `gameday_designer/src/components/__tests__/GamedayMetadataAccordion.test.tsx`

**Interfaces:**
- Consumes: `gamedayApi.getGameday(id)` returning `Gameday` including `resource_urls`.
- Produces: exported `ResourceUrl` type `{ id?: number; url: string; description: string }`; a "Links" section in the accordion body rendering one row per URL (description + url) plus an add button; local state `resourceUrls: ResourceUrl[]` seeded from `getGameday(metadata.id)`.

- [ ] **Step 1: Write the failing test**

In `GamedayMetadataAccordion.test.tsx`, update the `renderAccordion` helper to also mock `getGameday`, then add a test. First, extend the helper (add inside `renderAccordion`, before `render(...)`):

```typescript
    vi.mocked(gamedayApi.getGameday).mockResolvedValue({
      ...mockMetadata,
      resource_urls: extraProps.metadata?.resource_urls ?? [],
    } as never);
```

Add the test:

```typescript
  it('renders existing resource URLs from the loaded gameday', async () => {
    vi.mocked(gamedayApi.getGameday).mockResolvedValue({
      ...mockMetadata,
      resource_urls: [
        { id: 5, url: 'https://twitch.tv/live', description: 'Livestream' },
      ],
    } as never);

    await renderAccordion();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Livestream')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('https://twitch.tv/live')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/GamedayMetadataAccordion.test.tsx -t "renders existing resource URLs"`
Expected: FAIL — `getGameday` is not called / no inputs with those values.

- [ ] **Step 3: Add the `ResourceUrl` type**

In `gameday_designer/src/types/api.ts`, above `GamedayMetadata`:

```typescript
export interface ResourceUrl {
  id?: number;
  url: string;
  description: string;
}
```

Add the field to `GamedayMetadata` (after `status: string;`):

```typescript
  resource_urls?: ResourceUrl[];
```

In `gameday_designer/src/types/index.ts`, add `ResourceUrl` to the `from './api'` export block:

```typescript
  GamedayMetadata,
  ResourceUrl,
```

- [ ] **Step 4: Add i18n keys**

In `gameday_designer/src/i18n/locales/en/ui.json`, add to the `label` object:

```json
    "links": "Links",
    "urlDescription": "Description",
    "url": "URL",
```

and to the `button` object:

```json
    "addUrl": "Add URL",
    "deleteUrl": "Delete",
```

In `gameday_designer/src/i18n/locales/de/ui.json`, add to the `label` object:

```json
    "links": "Links",
    "urlDescription": "Beschreibung",
    "url": "URL",
```

and to the `button` object:

```json
    "addUrl": "URL hinzufügen",
    "deleteUrl": "Löschen",
```

- [ ] **Step 5: Implement fetch + render**

In `GamedayMetadataAccordion.tsx`, add the type import near the other type imports:

```typescript
import { ResourceUrl } from '../types/api';
```

Add state near the other `useState` hooks (after `leagues`):

```typescript
  const [resourceUrls, setResourceUrls] = useState<ResourceUrl[]>([]);
```

Add a fetch effect after the existing metadata `useEffect` (the one fetching seasons/leagues):

```typescript
  React.useEffect(() => {
    const fetchResourceUrls = async () => {
      if (!gamedayApi || !metadata.id) return;
      try {
        const gd = await gamedayApi.getGameday(metadata.id);
        setResourceUrls(gd.resource_urls ?? []);
      } catch (error) {
        console.error('Failed to fetch resource URLs', error);
      }
    };
    fetchResourceUrls();
  }, [metadata.id]);
```

Add the "Links" section inside `<Form>`, immediately before the `<hr />` that precedes the action buttons (around line 440):

```tsx
            <Row className="mb-3">
              <Col md={12}>
                <Form.Label>{t('ui:label.links', 'Links')}</Form.Label>
                {resourceUrls.map((ru, idx) => (
                  <Row className="mb-2 align-items-end" key={ru.id ?? `new-${idx}`} data-testid="resource-url-row">
                    <Col md={4}>
                      <Form.Control
                        type="text"
                        value={ru.description}
                        placeholder={t('ui:label.urlDescription', 'Description')}
                        disabled={readOnly}
                        onChange={(e) => handleUrlChange(idx, 'description', e.target.value)}
                        onBlur={() => persistResourceUrls(resourceUrls)}
                        data-testid="resource-url-description"
                      />
                    </Col>
                    <Col md={7}>
                      <Form.Control
                        type="url"
                        value={ru.url}
                        placeholder={t('ui:label.url', 'URL')}
                        disabled={readOnly}
                        onChange={(e) => handleUrlChange(idx, 'url', e.target.value)}
                        onBlur={() => persistResourceUrls(resourceUrls)}
                        data-testid="resource-url-url"
                      />
                    </Col>
                    <Col md={1}>
                      {!readOnly && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDeleteUrl(idx)}
                          data-testid="resource-url-delete"
                          aria-label={t('ui:button.deleteUrl', 'Delete')}
                        >
                          <i className={`bi ${ICONS.TRASH}`}></i>
                        </Button>
                      )}
                    </Col>
                  </Row>
                ))}
                {!readOnly && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleAddUrl}
                    data-testid="resource-url-add"
                  >
                    <i className="bi bi-plus-lg me-1"></i>
                    {t('ui:button.addUrl', 'Add URL')}
                  </Button>
                )}
              </Col>
            </Row>
```

Add the three handlers plus the persist function among the other handlers (e.g. after `handleChange`). `handleAddUrl`/`handleDeleteUrl`/`handleUrlChange`/`persistResourceUrls`:

```typescript
  const persistResourceUrls = async (urls: ResourceUrl[]) => {
    if (readOnly || !metadata.id) return;
    const payload = urls.filter((u) => u.url.trim() !== '');
    try {
      await gamedayApi.patchGameday(metadata.id, { resource_urls: payload });
    } catch (error) {
      console.error('Failed to save resource URLs', error);
    }
  };

  const handleAddUrl = () => {
    if (readOnly) return;
    setResourceUrls((prev) => [...prev, { url: '', description: '' }]);
  };

  const handleUrlChange = (index: number, field: 'url' | 'description', value: string) => {
    if (readOnly) return;
    setResourceUrls((prev) =>
      prev.map((ru, i) => (i === index ? { ...ru, [field]: value } : ru))
    );
  };

  const handleDeleteUrl = (index: number) => {
    if (readOnly) return;
    setResourceUrls((prev) => {
      const next = prev.filter((_, i) => i !== index);
      persistResourceUrls(next);
      return next;
    });
  };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/GamedayMetadataAccordion.test.tsx -t "renders existing resource URLs"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd leaguesphere
git add gameday_designer/src/types/api.ts gameday_designer/src/types/index.ts \
  gameday_designer/src/i18n/locales/en/ui.json gameday_designer/src/i18n/locales/de/ui.json \
  gameday_designer/src/components/GamedayMetadataAccordion.tsx \
  gameday_designer/src/components/__tests__/GamedayMetadataAccordion.test.tsx
git commit -m "feat(designer): render gameday resource URLs in metadata accordion"
```

---

### Task 4: Frontend — add / edit / delete URLs with immediate save

**Files:**
- Modify: `gameday_designer/src/components/GamedayMetadataAccordion.tsx` (only if adjustments needed — handlers were added in Task 3)
- Test: `gameday_designer/src/components/__tests__/GamedayMetadataAccordion.test.tsx`

**Interfaces:**
- Consumes: `handleAddUrl`, `handleUrlChange`, `handleDeleteUrl`, `persistResourceUrls`, and `gamedayApi.patchGameday` from Task 3.
- Produces: verified add/edit/delete/save/readOnly behavior.

- [ ] **Step 1: Write the failing tests**

Add to `GamedayMetadataAccordion.test.tsx`:

```typescript
  it('adds a new URL row when the add button is clicked', async () => {
    vi.mocked(gamedayApi.getGameday).mockResolvedValue({
      ...mockMetadata, resource_urls: [],
    } as never);
    await renderAccordion();

    await userEvent.click(screen.getByTestId('resource-url-add'));

    expect(screen.getAllByTestId('resource-url-row')).toHaveLength(1);
  });

  it('saves the URL list via patchGameday on blur', async () => {
    vi.mocked(gamedayApi.getGameday).mockResolvedValue({
      ...mockMetadata, resource_urls: [],
    } as never);
    vi.mocked(gamedayApi.patchGameday).mockResolvedValue(mockMetadata as never);
    await renderAccordion();

    await userEvent.click(screen.getByTestId('resource-url-add'));
    await userEvent.type(screen.getByTestId('resource-url-description'), 'Livestream');
    await userEvent.type(screen.getByTestId('resource-url-url'), 'https://twitch.tv/live');
    fireEvent.blur(screen.getByTestId('resource-url-url'));

    await waitFor(() => {
      expect(vi.mocked(gamedayApi.patchGameday)).toHaveBeenCalledWith(1, {
        resource_urls: [{ url: 'https://twitch.tv/live', description: 'Livestream' }],
      });
    });
  });

  it('deletes a URL row and persists the shorter list', async () => {
    vi.mocked(gamedayApi.getGameday).mockResolvedValue({
      ...mockMetadata,
      resource_urls: [{ id: 5, url: 'https://x.tv/a', description: 'A' }],
    } as never);
    vi.mocked(gamedayApi.patchGameday).mockResolvedValue(mockMetadata as never);
    await renderAccordion();

    await waitFor(() => expect(screen.getByDisplayValue('A')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('resource-url-delete'));

    await waitFor(() => {
      expect(vi.mocked(gamedayApi.patchGameday)).toHaveBeenCalledWith(1, { resource_urls: [] });
    });
    expect(screen.queryByTestId('resource-url-row')).not.toBeInTheDocument();
  });

  it('does not allow editing URLs in readOnly mode', async () => {
    vi.mocked(gamedayApi.getGameday).mockResolvedValue({
      ...mockMetadata,
      resource_urls: [{ id: 5, url: 'https://x.tv/a', description: 'A' }],
    } as never);
    await renderAccordion({ readOnly: true });

    await waitFor(() => expect(screen.getByDisplayValue('A')).toBeInTheDocument());
    expect(screen.getByTestId('resource-url-url')).toBeDisabled();
    expect(screen.queryByTestId('resource-url-add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-url-delete')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify status**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/GamedayMetadataAccordion.test.tsx -t "URL"`
Expected: If Task 3's handlers are complete, `add`, `save on blur`, `delete`, and `readOnly` tests PASS. If any fails, fix the handler/JSX in `GamedayMetadataAccordion.tsx` per the failure (these tests are the acceptance criteria for the Task 3 handlers).

- [ ] **Step 3: Make any needed fixes**

If a test fails, adjust the corresponding handler or JSX (`data-testid`s, disabled bindings, payload shape) in `GamedayMetadataAccordion.tsx` until green. No new interfaces — reuse Task 3's functions.

- [ ] **Step 4: Run the full accordion test file**

Run: `cd leaguesphere/gameday_designer && npx vitest run src/components/__tests__/GamedayMetadataAccordion.test.tsx`
Expected: PASS (all, including pre-existing tests and the coverage test file's expectations).

- [ ] **Step 5: Typecheck + lint**

Run: `cd leaguesphere/gameday_designer && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd leaguesphere
git add gameday_designer/src/components/GamedayMetadataAccordion.tsx \
  gameday_designer/src/components/__tests__/GamedayMetadataAccordion.test.tsx
git commit -m "feat(designer): add/edit/delete gameday resource URLs with immediate save"
```

---

### Task 5: Full verification + push

**Files:** none (verification only)

- [ ] **Step 1: Run backend gameday API tests**

Run: `cd leaguesphere && uv run pytest gamedays/tests/api/test_gameday_viewset.py -v`
Expected: PASS

- [ ] **Step 2: Run frontend designer tests**

Run: `cd leaguesphere/gameday_designer && npx vitest run`
Expected: PASS (no regressions in the wider suite).

- [ ] **Step 3: Push to update the PR**

```bash
cd leaguesphere && git push origin feat/gameday_detail_enhancements
```

- [ ] **Step 4: Confirm CI + reply to the review thread**

Verify the PR's checks re-run and, if desired, reply on the top-level review thread noting the React accordion now has ResourceURL CRUD.

---

## Self-Review

**1. Spec coverage:**
- Reuse existing endpoint via nested writable field → Task 1 (read) + Task 2 (write). ✓
- Replace-whole-set reconcile (create/update/delete-omit) → Task 2. ✓
- Extend `GamedayMetadata` with `resource_urls` → Task 3. ✓
- Links section UI (description + URL, delete per row, add button) → Task 3. ✓
- Save via `patchGameday` on blur/delete, not the flow-state blob → Task 3 (`persistResourceUrls`) + Task 4 tests. ✓
- `readOnly` disables editing → Task 3 (bindings) + Task 4 test. ✓
- Backend tests (create/update/delete-omit/invalid) → Task 2. ✓
- Frontend tests (render/add/edit/delete/save payload/readOnly) → Tasks 3-4. ✓
- German parity via i18n → Task 3 Step 4. ✓

**2. Placeholder scan:** No TBD/TODO; all steps show concrete code and commands. ✓

**3. Type consistency:** `ResourceUrl { id?: number; url: string; description: string }` used consistently in `api.ts`, the accordion state, handlers, and the `patchGameday` payload. `resource_urls` (snake_case) matches the serializer field name in both backend and frontend payloads. `resourceurl_set` used only backend-side as the ORM reverse accessor. ✓

**Note for implementer:** the accordion imports `GamedayMetadata` from `../types/flowchart`, but `getGameday`/`patchGameday` use the `Gameday`/`GamedayMetadata` from `../types/api`. `resource_urls` is added to the **api.ts** `GamedayMetadata` only — the accordion reads URLs via `getGameday` (api.ts `Gameday`) and never off the `metadata` prop, so the flowchart.ts type does not need the field.
