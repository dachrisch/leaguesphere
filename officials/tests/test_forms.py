from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from officials.forms import AddExternalGameOfficialEntryForm, GameOfficialImportUploadForm


class TestGameOfficialImportUploadForm(TestCase):
    def test_valid_with_csv_extension(self):
        upload = SimpleUploadedFile("import.csv", b"a,b\n1,2", content_type="text/csv")
        form = GameOfficialImportUploadForm(files={"file": upload})
        assert form.is_valid(), form.errors

    def test_valid_with_xlsx_extension(self):
        upload = SimpleUploadedFile(
            "import.xlsx",
            b"pretend-xlsx-bytes",
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        form = GameOfficialImportUploadForm(files={"file": upload})
        assert form.is_valid(), form.errors

    def test_invalid_with_unsupported_extension(self):
        upload = SimpleUploadedFile(
            "import.txt", b"anything", content_type="text/plain"
        )
        form = GameOfficialImportUploadForm(files={"file": upload})
        assert not form.is_valid()
        assert "file" in form.errors

    def test_missing_file_is_invalid(self):
        form = GameOfficialImportUploadForm(data={})
        assert not form.is_valid()


class TestAddExternalGameOfficialEntryForm(TestCase):
    def test_has_entries_field(self):
        form = AddExternalGameOfficialEntryForm()
        assert "entries" in form.fields

    def test_missing_entries_is_invalid(self):
        form = AddExternalGameOfficialEntryForm(data={})
        assert not form.is_valid()

    def test_valid_with_entries(self):
        form = AddExternalGameOfficialEntryForm(
            data={"entries": "1, 2, 2024-05-01, Referee, Hamburg, 20"}
        )
        assert form.is_valid(), form.errors
