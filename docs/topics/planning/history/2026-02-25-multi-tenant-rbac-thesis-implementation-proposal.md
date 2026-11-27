# Multi-Tenant RBAC Implementation Proposal
## Response to Bachelor Thesis: "Entwurf und Implementierung eines multimandantenfähigen Rechtemanagementsystems"

**Date**: February 2026  
**Thesis Author**: Niklas Just (2123394)  
**Supervisors**: Dipl.-Inf. (FH), Dipl.-Des. Erich Seifert & Prof. Dr. Michael Strohmeier  

---

## Executive Summary

We recognize the thesis proposal as **academically rigorous and strategically sound** for LeagueSphere's scale challenges. Your Model 3 (Shared Database + Shared Schema + TenantID) is cost-appropriate for a non-sensitive sports data system managing 12+ leagues.

**Critical Success Factor**: Security enforcement through architectural patterns, not developer discipline. We propose **middleware-based tenant isolation** as the foundation to eliminate data leakage risks inherent in Model 3.

This document focuses on the **middleware implementation strategy** and key architectural decisions needed before development begins.

---

## 1. Middleware-Based Tenant Isolation Architecture

### Problem Statement
Model 3's primary risk: Any ORM bypass, SQL injection, or forgotten filter could expose all league data to unauthorized users. One developer mistake becomes a security breach.

### Solution: Tenant Middleware Layer

We propose a **three-layer middleware approach** that enforces tenant isolation at the framework level:

```
Request → TenantResolutionMiddleware 
        → TenantContextMiddleware 
        → TenantFilteringMiddleware 
        → View Logic (guaranteed tenant-filtered)
```

#### **Layer 1: TenantResolutionMiddleware**
**Purpose**: Determine current tenant from request context

**Implementation**:
- Extract tenant from URL path: `/api/leagues/{league_id}/gamedays/`
- Extract tenant from JWT/session token claims
- Extract tenant from subdomain (if multi-domain strategy: `dffl.leaguesphere.de`, `dffl2.leaguesphere.de`)
- Fallback validation: Verify user has role in requested league

**Error Handling**:
- Return 403 if tenant mismatch or user not member of league
- Prevents accidental cross-league access before data layer

**Example**:
```python
class TenantResolutionMiddleware:
    def __call__(self, request):
        # Extract from URL kwargs first
        league_id = request.resolver_match.kwargs.get('league_id')
        
        if not league_id:
            # Extract from JWT token
            league_id = self.get_tenant_from_token(request)
        
        if not self._user_has_league_access(request.user, league_id):
            return HttpResponseForbidden()
        
        request.tenant_id = league_id
        return self.get_response(request)
```

#### **Layer 2: TenantContextMiddleware**
**Purpose**: Store tenant context in thread-local storage for ORM access

**Implementation**:
- Uses Django's thread-local context (similar to Django's timezone module)
- Makes `get_current_tenant()` available globally without passing parameters
- Enables transparent filtering in querysets without view-level awareness

**Example**:
```python
# In middleware
_thread_locals = threading.local()

def set_tenant(tenant_id):
    _thread_locals.tenant_id = tenant_id

def get_tenant():
    return getattr(_thread_locals, 'tenant_id', None)

class TenantContextMiddleware:
    def __call__(self, request):
        set_tenant(request.tenant_id)
        try:
            return self.get_response(request)
        finally:
            set_tenant(None)  # Clean up
```

#### **Layer 3: TenantFilteringMiddleware**
**Purpose**: Automatic queryset filtering at ORM level

**Implementation**:
- Override Django's default manager to auto-filter by current tenant
- All `.all()`, `.filter()` queries include `tenant_id=current_tenant` automatically
- Prevents developers from forgetting filters

**Example**:
```python
class TenantAwareQuerySet(models.QuerySet):
    def get_queryset(self):
        tenant_id = get_tenant()
        if tenant_id is None:
            raise ImproperlyConfigured("Tenant not set in context")
        return super().get_queryset().filter(tenant_id=tenant_id)

class TenantAwareManager(models.Manager):
    def get_queryset(self):
        return TenantAwareQuerySet(self.model, using=self._db)

# Usage in models:
class Gameday(models.Model):
    tenant = models.ForeignKey(League, on_delete=models.CASCADE)
    objects = TenantAwareManager()  # Auto-filters by tenant
```

### Key Benefits
1. **Enforcement**: Cannot access cross-tenant data even with SQL access
2. **DRY**: Eliminates repeated `.filter(tenant_id=current_tenant)` in views
3. **API Protection**: Works for REST endpoints, admin interface, GraphQL
4. **Testing**: Easy to inject test tenants without database manipulation

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Raw SQL queries bypass filtering | Disable raw SQL in code review; use ORM-only |
| Thread-local context pollution in tests | Use pytest fixtures to reset context between tests |
| Async operations lose context (Django async) | Use `asgiref.sync.iscoroutinefunction` checks; document async limitations |
| Admin interface leaks data | Apply TenantAwareManager to Django admin |

---

## 2. API Routing Strategy

The middleware approach requires consistent URL structure to extract tenant:

### Recommended REST Structure
```
GET    /api/leagues/{league_id}/gamedays/           # List all gamedays in league
GET    /api/leagues/{league_id}/gamedays/{id}/      # Get specific gameday
POST   /api/leagues/{league_id}/gamedays/           # Create gameday
PUT    /api/leagues/{league_id}/gamedays/{id}/      # Update gameday
GET    /api/leagues/{league_id}/teams/              # List teams in league
GET    /api/users/me/leagues/                       # User's accessible leagues
```

**Enforcement in Django URLs**:
```python
urlpatterns = [
    path('api/leagues/<int:league_id>/', include([
        path('gamedays/', GamedayListView.as_view()),
        path('teams/', TeamListView.as_view()),
        # All nested views automatically get league_id from URL
    ])),
]
```

**Middleware validates**: User has role in `league_id` from URL

---

## 3. Data Model Changes

### New Tables Required

#### `tenants_league` (Tenant definition)
```python
class League(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)  # e.g., "DFFL", "DFFL2", "DFFL-F"
    slug = models.SlugField(unique=True)     # e.g., "dffl", "dffl2", "dffl-f"
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'tenants_league'
```

#### `auth_userrole` (User-to-role-to-league mapping)
```python
class UserRole(models.Model):
    ROLE_CHOICES = [
        ('PLAYER', 'Player'),
        ('TEAM_MANAGER', 'Team Manager'),
        ('REFEREE', 'Referee'),
        ('LEAGUE_ADMIN', 'League Admin'),
        ('SYSTEM_ADMIN', 'System Admin'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    league = models.ForeignKey(League, on_delete=models.CASCADE, null=True, blank=True)
    role = models.CharField(max_length=50, choices=ROLE_CHOICES)
    
    # System Admin has league=NULL
    # Scoped admins have league=specific_league
    # Players have league=their_team's_league
    
    class Meta:
        unique_together = ('user', 'league', 'role')
        db_table = 'auth_userrole'
```

#### Existing Models: Add `tenant_id`
```python
class Gameday(models.Model):
    # Existing fields...
    league = models.ForeignKey(League, on_delete=models.CASCADE)
    
    # Update model manager:
    objects = TenantAwareManager()

class Team(models.Model):
    # Existing fields...
    league = models.ForeignKey(League, on_delete=models.CASCADE)
    objects = TenantAwareManager()

# Apply to: Gameday, Team, Player, Official, Season, etc.
```

---

## 4. Role-Based Permission Checks

After middleware ensures correct tenant, view logic performs **role-based authorization**:

### Permission Pattern
```python
from django.contrib.auth.decorators import permission_required
from django.utils.decorators import method_decorator

@method_decorator(permission_required('gamedays.add_gameday'), name='post')
class GamedayCreateView(CreateAPIView):
    """Only users with 'gamedays.add_gameday' can POST"""
    queryset = Gameday.objects.all()  # Auto-filtered by tenant middleware
    serializer_class = GamedaySerializer
```

### Role → Permissions Mapping
Define in Django's permission system:

```python
# In a management command or migration
ROLE_PERMISSIONS = {
    'LEAGUE_ADMIN': [
        'gamedays.add_gameday',
        'gamedays.change_gameday',
        'gamedays.delete_gameday',
        'teams.change_team',
        'officials.add_official',
    ],
    'TEAM_MANAGER': [
        'teams.change_team',  # Only their own team (checked in view)
        'players.view_players',
    ],
    'REFEREE': [
        'gamedays.view_gameday',
        'scorecard.edit_scorecard',
    ],
    'PLAYER': [
        'gamedays.view_gameday',
        'players.view_stats',
    ],
}
```

---

## 5. Migration Path from Current System

### Phase 1: Dual-Write (Backward Compatibility)
**Duration**: 1-2 sprints

- Create new League, UserRole tables
- Keep existing `is_staff` boolean
- New code reads from UserRole; old code still works with `is_staff`
- Gradually migrate users: `is_staff=True` → `UserRole(role='LEAGUE_ADMIN')`

### Phase 2: Middleware Deployment
**Duration**: 1 sprint

- Deploy TenantResolutionMiddleware first (non-breaking)
- Validates user has role but doesn't enforce filtering yet
- Monitor logs for 403s; fix missing league memberships
- Deploy TenantContextMiddleware + TenantFilteringMiddleware together

### Phase 3: View Layer Update
**Duration**: 2-3 sprints

- Update REST endpoints to extract `league_id` from URL
- Remove manual `.filter(league_id=...)` from views (now automatic)
- Add permission checks: `@permission_required('gamedays.add_gameday')`
- Test thoroughly before removing `is_staff` checks

### Phase 4: Deprecation & Cleanup
**Duration**: 1 sprint

- Remove `is_staff` field from User model
- Retire old views/endpoints that didn't migrate
- Database cleanup: archive old permission logs

---

## 6. Security Considerations

### Defense in Depth

| Layer | Defense |
|-------|---------|
| Network | HTTPS only; CORS restricted to domain |
| Middleware | Tenant resolution; request rejection if mismatch |
| Database | ORM auto-filtering; indexes on (tenant_id, resource_id) |
| View Logic | Permission checks (@permission_required); custom authorization |
| Frontend | UI permission guards; client-side role checks |

### Monitoring & Auditing

- Log all 403 Forbidden responses (potential attacks)
- Log role changes (audit trail)
- Monitor unusual cross-league API calls
- Alert on multiple 403s from same user (brute force attempt)

---

## 7. Implementation Timeline & Milestones

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Planning** | 1 week | Migration plan; data model finalized; API design doc |
| **Phase 1 (Dual-Write)** | 2 weeks | League + UserRole tables; backward-compatible code |
| **Phase 2 (Middleware)** | 1 week | TenantResolutionMiddleware deployed to staging |
| **Phase 3 (API Layer)** | 3 weeks | REST endpoints updated; permission checks added |
| **Phase 4 (Testing)** | 2 weeks | Integration tests; security audit; load testing |
| **Phase 5 (Frontend)** | 2 weeks | React/Angular apps updated; tenant context implemented |
| **Phase 6 (Cleanup)** | 1 week | Deprecate `is_staff`; prod deployment |
| **Total** | ~12 weeks | Full multi-tenant RBAC system live |

---

## 8. Recommendations Before Coding Starts

### Must-Do
1. ✅ **Finalize data model** with team; confirm foreign keys
2. ✅ **Define permission matrix** (Role × Resource × Action) explicitly
3. ✅ **Audit existing code** for raw SQL queries; mark for refactoring
4. ✅ **Set up staging environment** with realistic multi-league test data

### Should-Do
5. **Evaluate async Django support**: Does your stack use async views/background tasks?
6. **Plan for System Admin access**: How do global admins bypass tenant filtering when needed?
7. **Database backup strategy**: How to safely restore single-league data if needed?

---

## 9. Questions for Clarification

Please address before we proceed to coding:

1. **Async Django**: Does your stack use `async def` views or Celery tasks? If yes, thread-local context won't work; we need `contextvars` instead.

2. **System Admin God Mode**: When a system admin needs to access data across all leagues (e.g., viewing global statistics), how should middleware handle this? Bypass filtering? Or admin only sees their own league?

3. **Cross-League Operations**: Are there operations that span multiple leagues? (e.g., national rankings, multi-league playoffs) This affects tenant boundary design.

4. **API Versioning**: Will `/api/v1/leagues/{league_id}/...` co-exist with `/api/gamedays/` (old route) during migration? Or hard break on `/api/v2/`?

5. **Database Platform**: Thesis assumes MySQL. Is this locked in? PostgreSQL with Row-Level Security would be more secure for Model 3.

---

## Conclusion

Your thesis provides the **strategic foundation**. This proposal operationalizes it through **middleware-enforced tenant isolation**, reducing implementation risk significantly.

The middleware approach transforms tenant separation from a "remember to filter" developer responsibility into a **framework-level guarantee**. This is critical for a volunteer-run sports organization where code review discipline may vary.

---

**Prepared by**: LeagueSphere Development Team  
**Date**: February 2026
