---
name: lookup-stage-data
description: Use when the user wants to query or inspect data from the staging environment. Triggers on keywords like "check stage", "query staging", "lookup stage data", "what's on staging", "stage database", "stage gameday".
---

# Lookup Data from Staging

Queries the staging environment to inspect gamedays, game results, teams, and other data.

## SSH Access

The staging server is accessed via SSH:
- **Host**: `cda@lehel.xyz`
- **Container**: `leaguesphere_stage.staging-app`

## Common Queries

### List recent gamedays
```bash
ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app python manage.py shell -c \"
from gamedays.models import Gameday
for g in Gameday.objects.order_by('-date')[:10]:
    print(f'{g.pk}: {g.name} ({g.date}) [{g.format}]')
\""
```

### Check if a gameday has a designer state (already migrated)
```bash
ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app python manage.py shell -c \"
from gamedays.models import GamedayDesignerState
print(GamedayDesignerState.objects.filter(gameday_id=<GAMEDAY_ID>).exists())
\""
```

### View migration plan for a gameday
```bash
ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app python manage.py shell -c \"
from gamedays.service.gameday_migration_service import GamedayMigrationService
from gamedays.models import Gameday
plan = GamedayMigrationService(Gameday.objects.get(pk=<GAMEDAY_ID>)).build_plan()
import json; print(json.dumps(plan, indent=2, default=str))
\""
```

### Check gameday format and games
```bash
ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app python manage.py shell -c \"
from gamedays.models import Gameday, Gameinfo
g = Gameday.objects.get(pk=<GAMEDAY_ID>)
print(f'Format: {g.format}')
for gi in Gameinfo.objects.filter(gameday=g).order_by('field','scheduled'):
    print(f'  Field {gi.field} {gi.scheduled}: {gi.standing} ({gi.stage})')
\""
```

### Check teams in a gameday
```bash
ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app python manage.py shell -c \"
from gamedays.models import Gameresult, Gameinfo
for gr in Gameresult.objects.filter(gameinfo__gameday_id=<GAMEDAY_ID>).select_related('team','gameinfo'):
    role = 'Home' if gr.isHome else 'Away'
    print(f'{gr.gameinfo.field}/{gr.gameinfo.scheduled}: {gr.team.name} ({role})')
\""
```

### Check template applications
```bash
ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app python manage.py shell -c \"
from gameday_designer.models import TemplateApplication
for ta in TemplateApplication.objects.select_related('gameday','template'):
    print(f'Gameday {ta.gameday_id}: template \"{ta.template.name}\" (pk={ta.template.pk})')
\""
```

### Check schedule templates
```bash
ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app python manage.py shell -c \"
from gameday_designer.models import ScheduleTemplate
for t in ScheduleTemplate.objects.all():
    print(f'{t.pk}: {t.name} (teams={t.num_teams}, fields={t.num_fields}, groups={t.num_groups})')
\""
```

## Notes

- All commands run inside the Docker container on the staging server
- The staging database is separate from production (`leaguesphere.app`)
- Custom format gamedays (e.g. `NRW U13_Gruppen1_Felder2`) have no ScheduleTemplate
- Staging deployments use `-rc.N` version tags