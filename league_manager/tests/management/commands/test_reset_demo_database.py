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
