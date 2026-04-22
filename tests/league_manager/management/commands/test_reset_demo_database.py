import os
import tempfile
from io import StringIO
from pathlib import Path

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from gamedays.models import League


@pytest.mark.django_db
class TestResetDemoDatabaseCommand:
    """Tests for reset_demo_database management command."""

    @pytest.fixture
    def temp_snapshot_dir(self):
        """Create temporary directory for snapshots."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        # Cleanup
        if os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir)

    @pytest.fixture
    def snapshot_path(self, temp_snapshot_dir):
        """Get snapshot file path."""
        return os.path.join(temp_snapshot_dir, 'demo_snapshot.sql')

    def test_create_snapshot_creates_sql_file(self, snapshot_path):
        """Test that create_snapshot generates a SQL file."""
        # Create some test data
        User.objects.create_user(username='testuser', password='pass123')
        League.objects.create(name='Test League', slug='test-league')

        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={snapshot_path}',
            stdout=out
        )

        # Verify snapshot file was created
        assert os.path.exists(snapshot_path), f"Snapshot file not created at {snapshot_path}"

        # Verify file has content
        with open(snapshot_path, 'r') as f:
            content = f.read()
            assert len(content) > 0, "Snapshot file is empty"
            # SQL file should contain SQL keywords
            assert 'CREATE' in content.upper() or 'INSERT' in content.upper(), \
                "Snapshot should contain CREATE or INSERT statements"

    def test_create_snapshot_output_message(self, snapshot_path):
        """Test that create_snapshot outputs success message."""
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={snapshot_path}',
            stdout=out
        )

        output = out.getvalue()
        assert 'snapshot' in output.lower(), "Output should mention 'snapshot'"
        assert 'created' in output.lower(), "Output should mention 'created'"

    def test_restore_snapshot_restores_data(self, snapshot_path):
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
            f'--snapshot-path={snapshot_path}',
            stdout=out
        )

        # Clear database
        User.objects.all().delete()
        League.objects.all().delete()
        assert User.objects.count() == 0
        assert League.objects.count() == 0

        # Restore from snapshot
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--restore-snapshot',
            f'--snapshot-path={snapshot_path}',
            stdout=out
        )

        # Verify data was restored
        assert User.objects.count() > 0
        assert League.objects.count() > 0
        restored_user = User.objects.filter(username='original').first()
        assert restored_user is not None

    def test_restore_snapshot_fails_without_file(self):
        """Test that restore fails gracefully when snapshot doesn't exist."""
        nonexistent_path = '/tmp/nonexistent_snapshot_xyz_12345.sql'

        with pytest.raises(CommandError) as exc_info:
            call_command(
                'reset_demo_database',
                '--restore-snapshot',
                f'--snapshot-path={nonexistent_path}',
            )

        assert 'not found' in str(exc_info.value).lower()

    def test_restore_snapshot_output_message(self, snapshot_path):
        """Test that restore outputs success message."""
        # Create a snapshot first
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={snapshot_path}',
        )

        # Restore and check output
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--restore-snapshot',
            f'--snapshot-path={snapshot_path}',
            stdout=out
        )

        output = out.getvalue()
        assert 'restored' in output.lower()
        assert snapshot_path in output


@pytest.mark.django_db
class DemoResetIntegrationTest:
    """Integration tests for the full demo reset workflow."""

    @pytest.fixture
    def temp_snapshot_dir(self):
        """Create temporary directory for snapshots."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        # Cleanup
        if os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir)

    @pytest.fixture
    def snapshot_path(self, temp_snapshot_dir):
        """Get snapshot file path."""
        return os.path.join(temp_snapshot_dir, 'demo_snapshot.sql')

    def test_full_demo_reset_workflow(self, snapshot_path):
        """Test complete workflow: seed -> snapshot -> clear -> restore."""
        # Step 1: Seed demo data
        out = StringIO()
        call_command('seed_demo_data', stdout=out)
        initial_user_count = User.objects.count()
        initial_league_count = League.objects.count()
        assert initial_user_count > 0
        assert initial_league_count > 0

        # Step 2: Create snapshot
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            f'--snapshot-path={snapshot_path}',
            stdout=out
        )
        assert os.path.exists(snapshot_path)

        # Step 3: Modify data to simulate user changes
        User.objects.create_user(username='newuser', password='pass123')
        League.objects.create(name='New League', slug='new-league')
        assert User.objects.count() == initial_user_count + 1

        # Step 4: Restore from snapshot
        out = StringIO()
        call_command(
            'reset_demo_database',
            '--restore-snapshot',
            f'--snapshot-path={snapshot_path}',
            stdout=out
        )

        # Step 5: Verify database is back to snapshot state
        assert User.objects.count() == initial_user_count
        assert League.objects.count() == initial_league_count
        assert User.objects.filter(username='newuser').first() is None

    def test_snapshot_path_from_settings(self, snapshot_path, settings):
        """Test that command respects DEMO_SNAPSHOT_PATH setting."""
        settings.DEMO_SNAPSHOT_PATH = snapshot_path

        out = StringIO()
        call_command(
            'reset_demo_database',
            '--create-snapshot',
            stdout=out
        )

        assert os.path.exists(snapshot_path)
