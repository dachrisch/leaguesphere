# Journey Dashboard Integration Design

**Date:** 2026-05-07  
**Status:** Design Phase  
**Scope:** Add journey dashboard to main navigation with email-based access control and integrated header navigation

## Overview

The journey dashboard is a user event-tracking analytics tool for all LeagueSphere apps. Currently, it exists as a standalone Django view at `/journeys/dashboard/` rendered without navigation, making it impossible to access from other parts of the application or navigate back.

This design integrates the journey dashboard into the main LeagueSphere navigation with:
- **Email-based access control** — Only @bumbleflies.de users can access
- **Dedicated Analytics menu** — Journey Dashboard appears under a new "Analytics" menu in the main navigation
- **Integrated header navigation** — Journey dashboard includes a header bar with app branding and back/home navigation

## Architecture

### Menu System Integration

The existing LeagueSphere menu system dynamically discovers menu items from each Django app's `menu.py` file. The journey app will implement this pattern:

```
journey/
├── menu.py (NEW)          # JourneyMenu class with @bumbleflies.de check
├── views.py (MODIFIED)    # Add email guard to JourneyDashboardView
└── ...
```

**Flow:**
1. User navigates to any page that includes `base.html`
2. `league_manager/context_processors.py` calls `get_menu_items(request)`
3. Menu discovery loads `journey/menu.py` → `JourneyMenu.get_menu_items(request)`
4. If user email is @bumbleflies.de, returns "Analytics" menu with "Journey Dashboard" link
5. If not @bumbleflies.de, returns empty list (menu item hidden)

### Backend Access Control

The `JourneyDashboardView` will enforce the same email restriction:

```python
class JourneyDashboardView(LoginRequiredMixin, TemplateView):
    template_name = 'journey_dashboard/index.html'
    login_url = 'login'
    
    def dispatch(self, request, *args, **kwargs):
        if not self._is_authorized_user(request):
            raise Http403PermissionDenied()
        return super().dispatch(request, *args, **kwargs)
    
    @staticmethod
    def _is_authorized_user(request):
        return request.user.email.endswith('@bumbleflies.de')
```

This ensures users cannot bypass the menu by accessing the URL directly.

### Journey Dashboard Header Navigation

The journey_dashboard React app currently renders without any navigation. We'll add:

1. **Shared Header Component** (`journey_dashboard/src/components/JourneyHeader.tsx`)
   - Similar structure to gameday_designer's `AppHeader`
   - Shows: LeagueSphere branding | "Journey Dashboard" title | Back button | Language selector | User info
   - Dark navbar matching existing LeagueSphere style

2. **Layout Wrapper** (`journey_dashboard/src/components/JourneyLayout.tsx`)
   - Similar to gameday_designer's `MainLayout`
   - Wraps the content with header + main area
   - Ensures consistent spacing and structure

3. **Updated App.tsx**
   - Import JourneyLayout
   - Wrap existing content with layout
   - Back button navigates to home (`/`)

**Navigation Flow:**
- From home/menu: User clicks "Journey Dashboard" → navigates to `/journeys/dashboard/`
- From journey: User clicks back button → navigates to `/` (home)

## Implementation Details

### 1. Create `journey/menu.py`

```python
from league_manager.base_menu import BaseMenu, MenuItem

class JourneyMenu(BaseMenu):
    def get_name(self):
        return "Analytics"
    
    def get_menu_items(self, request):
        if not self._is_authorized_user(request):
            return []
        
        return [
            MenuItem.create(
                name="Journey Dashboard",
                url="journey-dashboard",
                permissions=[]
            )
        ]
    
    @staticmethod
    def _is_authorized_user(request):
        return request.user.is_authenticated and request.user.email.endswith('@bumbleflies.de')
```

### 2. Update `journey/views.py`

Add email check to `JourneyDashboardView`:
- Extract email check logic to reusable helper
- Use in both menu and view
- Return 403 Forbidden if unauthorized

### 3. Update `journey/urls.py`

Ensure the `journey-dashboard` URL name is defined:

```python
path('dashboard/', JourneyDashboardView.as_view(), name='journey-dashboard')
```

### 4. Create `journey_dashboard/src/components/JourneyHeader.tsx`

- Bootstrap navbar (dark variant, matching gameday_designer style)
- Left side: Branding + "Journey Dashboard" title
- Right side: Language selector, user info
- Back button navigates to home

### 5. Create `journey_dashboard/src/components/JourneyLayout.tsx`

- Flex layout with header at top
- Main content area that grows to fill remaining space
- Similar structure to gameday_designer's `MainLayout`

### 6. Update `journey_dashboard/src/App.tsx`

- Import JourneyLayout
- Wrap existing content (SummaryCards, TopActionsTable, UserTimeline) with layout
- Update styling to work with new layout structure

### 7. Update `journey_dashboard/templates/journey_dashboard/index.html`

No changes needed — the React app will handle all UI including header.

## Data Flow

```
User visits LeagueSphere
    ↓
base.html renders navbar
    ↓
context_processor calls get_menu_items(request)
    ↓
journey/menu.py checks: is user @bumbleflies.de?
    ├─ YES → return Analytics menu with Journey Dashboard link
    └─ NO → return empty list (menu hidden)
    ↓
User clicks "Journey Dashboard" link
    ↓
Navigate to /journeys/dashboard/
    ↓
JourneyDashboardView.dispatch() checks email
    ├─ AUTHORIZED → render template
    └─ UNAUTHORIZED → 403 Forbidden
    ↓
journey_dashboard React app renders
    ├─ JourneyLayout wraps content
    ├─ JourneyHeader shows (with back button)
    └─ Content (SummaryCards, etc.)
    ↓
User clicks back button
    ↓
Navigate to /
```

## Testing Strategy

### Unit Tests
- `test_journey_menu_shows_only_for_bumbleflies_email()` — Verify menu item only appears for @bumbleflies.de
- `test_journey_menu_hidden_for_other_emails()` — Verify menu item hidden for other domains
- `test_journey_view_allows_bumbleflies_email()` — Verify authorized access
- `test_journey_view_denies_other_emails()` — Verify 403 for unauthorized users

### Integration Tests
- `test_journey_navigation_flow()` — Test full flow: click menu → view dashboard → click back
- `test_journey_header_renders()` — Verify header displays correctly
- `test_journey_back_button_navigates_home()` — Verify back button works

### Manual Testing
- Log in as @bumbleflies.de user → verify menu appears
- Log in as non-bumbleflies user → verify menu hidden
- Click menu link → verify dashboard loads with header
- Click back button → verify navigation to home
- Try direct URL access with unauthorized account → verify 403

## Files to Create/Modify

### Create
- `journey/menu.py` — Menu integration
- `journey_dashboard/src/components/JourneyHeader.tsx` — Header component
- `journey_dashboard/src/components/JourneyLayout.tsx` — Layout wrapper

### Modify
- `journey/views.py` — Add email guard to JourneyDashboardView
- `journey/urls.py` — Ensure route name is correct (if needed)
- `journey_dashboard/src/App.tsx` — Integrate layout
- `journey_dashboard/src/components/AdoptionMetrics.tsx` or other main components — Adjust styling if needed for new layout

## Success Criteria

1. ✅ Menu item "Analytics > Journey Dashboard" appears only for @bumbleflies.de users
2. ✅ Non-bumbleflies users cannot access `/journeys/dashboard/` (receive 403)
3. ✅ Journey dashboard has a header with app branding and back button
4. ✅ Back button navigates to home (`/`)
5. ✅ Header styling is consistent with gameday_designer
6. ✅ All existing journey dashboard functionality preserved
7. ✅ Unit and integration tests pass

## Known Limitations & Future Work

- Email check is hardcoded to @bumbleflies.de; could be made configurable via Django settings
- Journey header doesn't include language selector integration (can add later if needed)
- No breadcrumb navigation (back button only); could add multi-level navigation later

## Security Considerations

- Email check enforced at both UI (menu) and backend (view) layers
- Django's `LoginRequiredMixin` ensures only authenticated users can access
- 403 response for unauthorized access (not 404, to avoid information leakage)
- Menu discovery is called on every request, so authorization is always fresh
