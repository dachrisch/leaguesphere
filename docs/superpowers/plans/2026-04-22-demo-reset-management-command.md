# Demo Reset Management Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shell script's mysql-dependent demo reset with a Django management command that works in containerized environments without external MySQL client tools.

**Architecture:** Create a `reset_demo_database` Django management command that handles database snapshots and restoration using Django's ORM and raw SQL execution. The command will replace direct `mysql` command invocations with database-agnostic Python code. It supports both snapshot creation (after initial seeding) and restoration (for midnight resets), logging all operations for debugging.

**Tech Stack:** Django management commands, database transactions, subprocess for mysqldump (with fallback to SQL import), Python file I/O, Django logging.

---

## File Structure

**New Files:**
- `league_manager/management/commands/reset_demo_database.py` - Main management command
- `tests/league_manager/management/commands/test_reset_demo_database.py` - Comprehensive tests

**Modified Files:**
- `container/entrypoint.demo.sh` - Update to call management command instead of mysql
- `league_manager/management/commands/__init__.py` - No changes needed, already exists

---

## Task 1: Test snapshot creation from current database

**Files:**
- Create: `tests/league_manager/management/commands/test_reset_demo_database.py`
- Modify: `league_manager/management/commands/reset_demo_database.py` (implementation file, will create in Task 3)

- [ ] **Step 1: Create test file with initial test for snapshot creation**

Create `/home/cda/dev/leaguesphere/tests/league_manager/management/commands/test_reset_demo_database.py`:

```python
from django.test import TestCase, override_settings
from django.core.management import call_command
from django.contrib.auth.models import User
from gamedays.models import Team, League
from io import StringIO
import os
import tempfile
import shutil


class ResetDemoDatabaseCommandTest(TestCase):
    """Tests for reset_demo_database management command."""

    @override_settings(DEMO_SNAPSHOT_DIR=None)
    def setUp(self):
        """Create temporary directory for snapshots."""
        self.temp_dir = tempfile.mkdtemp()
        self.snapshot_path = os.path.join(self.temp_dir, 'demo_snapshot.sql')

    def tearDown(self):
        """Clean up temporary files."""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_create_snapshot_creates_sql_file(self):
        """Test that create_snapshot generates a SQL file."""
        # Create some test data
        User.objects.create_user(username='testuser', password='pass123')
        league = League.objects.create(name='Test League', slug='test-league')

        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={self.snapshot_path}',
            stdout=out
        )

        # Verify snapshot file was created
        self.assertTrue(os.path.exists(self.snapshot_path))

        # Verify file has content
        with open(self.snapshot_path, 'r') as f:
            content = f.read()
            self.assertGreater(len(content), 0)
            # SQL file should contain SQL keywords
            self.assertIn('SQL', content.upper())

    def test_create_snapshot_contains_database_dump(self):
        """Test that snapshot file contains CREATE and INSERT statements."""
        User.objects.create_user(username='dumptest', password='pass123')

        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={self.snapshot_path}',
            stdout=out
        )

        with open(self.snapshot_path, 'r') as f:
            content = f.read()
            # Should contain SQL structure or data
            self.assertTrue(
                'CREATE' in content.upper() or 'INSERT' in content.upper(),
                "Snapshot should contain CREATE or INSERT statements"
            )

    def test_create_snapshot_output_message(self):
        """Test that create_snapshot outputs success message."""
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={self.snapshot_path}',
            stdout=out
        )

        output = out.getvalue()
        self.assertIn('snapshot', output.lower())
        self.assertIn('created', output.lower())
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/cda/dev/leaguesphere
python manage.py test tests.league_manager.management.commands.test_reset_demo_database.ResetDemoDatabaseCommandTest.test_create_snapshot_creates_sql_file -v 2
```

Expected: FAIL with "management.commands.reset_demo_database: No such application or it doesn't have a 'reset_demo_database' command"

---

## Task 2: Implement snapshot creation in management command

**Files:**
- Create: `league_manager/management/commands/reset_demo_database.py`

- [ ] **Step 1: Create management command file with snapshot creation**

Create `/home/cda/dev/leaguesphere/league_manager/management/commands/reset_demo_database.py`:

```python
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, connections
from django.conf import settings
import os
import subprocess
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Create snapshot or reset demo database from snapshot'

    def add_arguments(self, parser):
        parser.add_argument(
            '--create-snapshot',
            action='store_true',
            help='Create a snapshot of the current database'
        )
        parser.add_argument(
            '--restore-snapshot',
            action='store_true',
            help='Restore database from existing snapshot'
        )
        parser.add_argument(
            '--snapshot-path',
            type=str,
            default=None,
            help='Path to snapshot file (default: from settings or /app/snapshots/demo_snapshot.sql)'
        )

    def handle(self, *args, **options):
        """Main command handler."""
        create = options.get('create_snapshot')
        restore = options.get('restore_snapshot')
        snapshot_path = options.get('snapshot_path')

        if not create and not restore:
            raise CommandError('Specify either --create-snapshot or --restore-snapshot')

        if create and restore:
            raise CommandError('Cannot use --create-snapshot and --restore-snapshot together')

        snapshot_path = self._get_snapshot_path(snapshot_path)

        try:
            if create:
                self.create_snapshot(snapshot_path)
            elif restore:
                self.restore_snapshot(snapshot_path)
        except Exception as e:
            logger.error(f"Demo database operation failed: {e}")
            raise CommandError(f"Failed to reset demo database: {e}")

    def _get_snapshot_path(self, provided_path):
        """Determine snapshot path from provided argument, settings, or default."""
        if provided_path:
            return provided_path

        # Try settings first
        if hasattr(settings, 'DEMO_SNAPSHOT_PATH'):
            return settings.DEMO_SNAPSHOT_PATH

        # Default path
        return '/app/snapshots/demo_snapshot.sql'

    def create_snapshot(self, snapshot_path):
        """Create database snapshot using mysqldump or Django export."""
        self.stdout.write(f"Creating demo database snapshot...")

        try:
            # Try to use mysqldump first (preferred for MySQL)
            self._create_snapshot_with_mysqldump(snapshot_path)
        except (FileNotFoundError, subprocess.CalledProcessError):
            # Fallback to Django-based export
            self.stdout.write("mysqldump not available, using Django-based export...")
            self._create_snapshot_with_django(snapshot_path)

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Demo snapshot created at {snapshot_path}"
            )
        )
        logger.info(f"Demo snapshot created: {snapshot_path}")

    def _create_snapshot_with_mysqldump(self, snapshot_path):
        """Create snapshot using mysqldump command."""
        # Ensure snapshot directory exists
        os.makedirs(os.path.dirname(snapshot_path) or '.', exist_ok=True)

        db_settings = settings.DATABASES.get('default', {})
        if db_settings.get('ENGINE') != 'django.db.backends.mysql':
            raise FileNotFoundError("mysqldump requires MySQL backend")

        cmd = [
            'mysqldump',
            f"-h{db_settings.get('HOST', 'localhost')}",
            f"-u{db_settings.get('USER')}",
            f"-p{db_settings.get('PASSWORD')}",
            '--single-transaction',
            '--quick',
            '--lock-tables=false',
            db_settings.get('NAME'),
        ]

        with open(snapshot_path, 'w') as f:
            subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, check=True)

    def _create_snapshot_with_django(self, snapshot_path):
        """Fallback: Create snapshot using Django's dumpdata for models."""
        # Note: This exports only Django model data, not raw database structure
        # For a more complete export, mysqldump is preferred
        os.makedirs(os.path.dirname(snapshot_path) or '.', exist_ok=True)

        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command('dumpdata', '--all', stdout=out)

        with open(snapshot_path, 'w') as f:
            # Write as JSON for loaddata compatibility
            f.write(out.getvalue())

    def restore_snapshot(self, snapshot_path):
        """Restore database from snapshot."""
        self.stdout.write("Restoring demo database from snapshot...")

        if not os.path.exists(snapshot_path):
            raise CommandError(f"Snapshot file not found: {snapshot_path}")

        # Determine if snapshot is JSON (Django dumpdata) or SQL (mysqldump)
        is_json = snapshot_path.endswith('.json') or self._is_json_snapshot(snapshot_path)

        if is_json:
            self._restore_snapshot_json(snapshot_path)
        else:
            self._restore_snapshot_sql(snapshot_path)

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Demo database restored from {snapshot_path}"
            )
        )
        logger.info(f"Demo database restored from: {snapshot_path}")

    def _is_json_snapshot(self, snapshot_path):
        """Check if snapshot file starts with JSON marker."""
        try:
            with open(snapshot_path, 'r') as f:
                first_char = f.read(1)
                return first_char in '[{'
        except Exception:
            return False

    def _restore_snapshot_sql(self, snapshot_path):
        """Restore from SQL dump file."""
        db_settings = settings.DATABASES.get('default', {})
        db_name = db_settings.get('NAME')

        # Drop and recreate database
        self._recreate_database(db_name)

        # Read and execute SQL from snapshot
        with open(snapshot_path, 'r') as f:
            sql_content = f.read()

        # Execute SQL file
        with connection.cursor() as cursor:
            cursor.execute('USE ' + db_name)
            # Split and execute statements carefully
            statements = sql_content.split(';')
            for statement in statements:
                statement = statement.strip()
                if statement:
                    cursor.execute(statement)

    def _restore_snapshot_json(self, snapshot_path):
        """Restore from Django dumpdata JSON file."""
        from django.core.management import call_command

        # Clear existing data first
        self.stdout.write("Clearing existing data...")
        call_command('flush', '--no-input', verbosity=0)

        # Load from snapshot
        self.stdout.write("Loading snapshot data...")
        call_command('loaddata', snapshot_path, verbosity=0)

    def _recreate_database(self, db_name):
        """Drop and recreate database."""
        self.stdout.write("Recreating database...")

        with connection.cursor() as cursor:
            cursor.execute(f'DROP DATABASE IF EXISTS `{db_name}`')
            cursor.execute(
                f'CREATE DATABASE `{db_name}` '
                f'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
            )

        logger.info(f"Database recreated: {db_name}")
```

- [ ] **Step 2: Run test to verify basic creation works**

```bash
cd /home/cda/dev/leaguesphere
python manage.py test tests.league_manager.management.commands.test_reset_demo_database.ResetDemoDatabaseCommandTest.test_create_snapshot_creates_sql_file -v 2
```

Expected: PASS

---

## Task 3: Add tests for snapshot restoration

**Files:**
- Modify: `tests/league_manager/management/commands/test_reset_demo_database.py`

- [ ] **Step 1: Add restoration test cases**

Add to `/home/cda/dev/leaguesphere/tests/league_manager/management/commands/test_reset_demo_database.py` before the final closing:

```python
    def test_restore_snapshot_restores_data(self):
        """Test that restore_snapshot repopulates database from snapshot."""
        # Create initial data and snapshot
        original_user = User.objects.create_user(
            username='original',
            password='pass123',
            email='original@test.local'
        )
        original_league = League.objects.create(name='Original League', slug='original')

        # Create snapshot
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={self.snapshot_path}',
            stdout=out
        )

        # Clear database
        User.objects.all().delete()
        League.objects.all().delete()
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(League.objects.count(), 0)

        # Restore from snapshot
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--restore-snapshot',
            f'--snapshot-path={self.snapshot_path}',
            stdout=out
        )

        # Verify data was restored
        self.assertGreater(User.objects.count(), 0)
        self.assertGreater(League.objects.count(), 0)
        restored_user = User.objects.filter(username='original').first()
        self.assertIsNotNone(restored_user)

    def test_restore_snapshot_fails_without_file(self):
        """Test that restore fails gracefully when snapshot doesn't exist."""
        nonexistent_path = '/tmp/nonexistent_snapshot_xyz.sql'

        with self.assertRaises(CommandError) as context:
            call_command(
                'reset_demo_database',
                '--restore-snapshot',
                f'--snapshot-path={nonexistent_path}',
            )

        self.assertIn('not found', str(context.exception).lower())

    def test_restore_snapshot_output_message(self):
        """Test that restore outputs success message."""
        # Create a snapshot first
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={self.snapshot_path}',
        )

        # Restore and check output
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--restore-snapshot',
            f'--snapshot-path={self.snapshot_path}',
            stdout=out
        )

        output = out.getvalue()
        self.assertIn('restored', output.lower())
        self.assertIn(self.snapshot_path, output)
```

- [ ] **Step 2: Run all tests to verify they pass**

```bash
cd /home/cda/dev/leaguesphere
python manage.py test tests.league_manager.management.commands.test_reset_demo_database -v 2
```

Expected: All tests PASS

---

## Task 4: Update entrypoint.demo.sh to use management command

**Files:**
- Modify: `container/entrypoint.demo.sh`

- [ ] **Step 1: Replace mysql calls with management command**

Modify `/home/cda/dev/leaguesphere/container/entrypoint.demo.sh`:

Replace the `reset_database()` function (lines 54-77) with:

```bash
# Reset database from snapshot
reset_database() {
    log "Resetting demo database from snapshot..."

    if [ ! -f "$DEMO_SNAPSHOT" ]; then
        log "ERROR: Demo snapshot not found at $DEMO_SNAPSHOT"
        log "Initializing database instead..."
        init_database
        return
    fi

    cd /app
    python manage.py reset_demo_database \
        --restore-snapshot \
        --snapshot-path="$DEMO_SNAPSHOT" 2>&1 | tee -a "$LOGS_DIR/demo_reset.log"

    if [ $? -eq 0 ]; then
        log "Database reset successful"
    else
        log "ERROR: Database reset failed"
        exit 1
    fi
}
```

- [ ] **Step 2: Replace snapshot creation call**

Modify the `init_database()` function (lines 35-51), replacing lines 46-50 with:

```bash
# Create snapshot for resets
cd /app
python manage.py reset_demo_database \
    --create-snapshot \
    --snapshot-path="$DEMO_SNAPSHOT" 2>&1 | tee -a "$LOGS_DIR/demo_reset.log"

if [ $? -ne 0 ]; then
    log "WARNING: Failed to create snapshot"
fi
```

- [ ] **Step 3: Verify the updated script syntax**

```bash
bash -n /home/cda/dev/leaguesphere/container/entrypoint.demo.sh
```

Expected: No syntax errors

---

## Task 5: Test end-to-end demo reset flow

**Files:**
- Create: `tests/league_manager/management/commands/test_reset_demo_database.py` (add integration test)

- [ ] **Step 1: Add integration test for full demo reset workflow**

Add before final closing in test file:

```python
class DemoResetIntegrationTest(TestCase):
    """Integration tests for the full demo reset workflow."""

    @override_settings(DEMO_SNAPSHOT_DIR=None)
    def setUp(self):
        """Create temporary directory for snapshots."""
        self.temp_dir = tempfile.mkdtemp()
        self.snapshot_path = os.path.join(self.temp_dir, 'demo_snapshot.sql')

    def tearDown(self):
        """Clean up temporary files."""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_full_demo_reset_workflow(self):
        """Test complete workflow: seed -> snapshot -> clear -> restore."""
        # Step 1: Seed demo data
        out = StringIO()
        call_command('seed_demo_data', stdout=out)
        initial_user_count = User.objects.count()
        initial_league_count = League.objects.count()
        self.assertGreater(initial_user_count, 0)
        self.assertGreater(initial_league_count, 0)

        # Step 2: Create snapshot
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={self.snapshot_path}',
            stdout=out
        )
        self.assertTrue(os.path.exists(self.snapshot_path))

        # Step 3: Modify data to simulate user changes
        User.objects.create_user(username='newuser', password='pass123')
        League.objects.create(name='New League', slug='new-league')
        self.assertEqual(User.objects.count(), initial_user_count + 1)

        # Step 4: Restore from snapshot
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--restore-snapshot',
            f'--snapshot-path={self.snapshot_path}',
            stdout=out
        )

        # Step 5: Verify database is back to snapshot state
        self.assertEqual(User.objects.count(), initial_user_count)
        self.assertEqual(League.objects.count(), initial_league_count)
        self.assertIsNone(User.objects.filter(username='newuser').first())

    def test_snapshot_path_from_settings(self):
        """Test that command respects DEMO_SNAPSHOT_PATH setting."""
        with override_settings(DEMO_SNAPSHOT_PATH=self.snapshot_path):
            out = StringIO()
            call_command(
                'reset_demo_database',
                '--create-snapshot',
                stdout=out
            )
            self.assertTrue(os.path.exists(self.snapshot_path))
```

- [ ] **Step 2: Run integration tests**

```bash
cd /home/cda/dev/leaguesphere
python manage.py test tests.league_manager.management.commands.test_reset_demo_database.DemoResetIntegrationTest -v 2
```

Expected: All integration tests PASS

---

## Task 6: Commit the implementation

**Files:**
- `league_manager/management/commands/reset_demo_database.py`
- `tests/league_manager/management/commands/test_reset_demo_database.py`
- `container/entrypoint.demo.sh`

- [ ] **Step 1: Stage all changes**

```bash
cd /home/cda/dev/leaguesphere
git add league_manager/management/commands/reset_demo_database.py \
        tests/league_manager/management/commands/test_reset_demo_database.py \
        container/entrypoint.demo.sh
```

- [ ] **Step 2: Create commit**

```bash
git commit -m "feat: implement Django management command for demo database reset

- Replace mysql CLI dependency with Django management command
- Supports snapshot creation and restoration
- Uses mysqldump when available, falls back to Django dumpdata
- Removes requirement for mysql client in container
- Updates entrypoint.demo.sh to use new command
- Add comprehensive tests for snapshot and restore operations

Fixes: demo reset failure in containerized environment"
```

- [ ] **Step 3: Verify commit**

```bash
git log -1 --stat
```

Expected: Shows all three modified/created files in the commit

---

## Verification Checklist

Before considering implementation complete:

- [ ] All unit tests pass: `python manage.py test tests.league_manager.management.commands.test_reset_demo_database`
- [ ] Management command callable: `python manage.py reset_demo_database --help`
- [ ] Snapshot creation works: `python manage.py reset_demo_database --create-snapshot`
- [ ] Snapshot restoration works: `python manage.py reset_demo_database --restore-snapshot`
- [ ] entrypoint.demo.sh syntax is valid: `bash -n container/entrypoint.demo.sh`
- [ ] No mysql/mysqldump dependencies in command (only optional for optimization)
- [ ] Logging captured for demo_reset.log
- [ ] Works with settings.DEMO_SNAPSHOT_PATH override
