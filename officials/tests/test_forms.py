from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from officials.forms import (
    ExternalGameSuggestionForm,
    ExternalGameSuggestionFormSet,
    GameOfficialImportUploadForm,
    InternalFixSuggestionForm,
    InternalFixSuggestionFormSet,
)
from officials.service.game_official_entries import (
    ALLOWED_POSITIONS,
    EXTERNAL_ALLOWED_POSITIONS,
)


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


class TestExternalGameSuggestionForm(TestCase):
    def test_has_expected_fields(self):
        form = ExternalGameSuggestionForm()
        expected = {
            "row_number",
            "status",
            "reason",
            "include",
            "official_id",
            "number_games",
            "date",
            "position",
            "association",
            "halftime_duration",
            "has_clockcontrol",
            "is_international",
            "reporter_name",
            "notification_date",
            "comment",
        }
        assert expected <= set(form.fields.keys())

    def test_position_choices_are_allowed_positions(self):
        form = ExternalGameSuggestionForm()
        choice_values = [choice[0] for choice in form.fields["position"].choices]
        for position in ALLOWED_POSITIONS:
            assert position in choice_values

    def test_include_is_not_required(self):
        form = ExternalGameSuggestionForm(
            data={
                "official_id": "1",
                "number_games": "2",
                "date": "2024-05-01",
                "position": "Referee",
                "association": "Hamburg",
                "halftime_duration": "20",
            }
        )
        assert form.is_valid(), form.errors
        assert form.cleaned_data["include"] is False

    def test_position_choices_include_mix(self):
        form = ExternalGameSuggestionForm()
        choice_values = [choice[0] for choice in form.fields["position"].choices]
        for position in EXTERNAL_ALLOWED_POSITIONS:
            assert position in choice_values

    def test_accepts_position_mix(self):
        form = ExternalGameSuggestionForm(
            data={
                "official_id": "1",
                "number_games": "2",
                "date": "2024-05-01",
                "position": "Mix",
                "association": "Hamburg",
                "halftime_duration": "20",
            }
        )
        assert form.is_valid(), form.errors
        assert form.cleaned_data["position"] == "Mix"


class TestInternalFixSuggestionForm(TestCase):
    def test_has_expected_fields(self):
        form = InternalFixSuggestionForm()
        expected = {
            "row_number",
            "status",
            "reason",
            "include",
            "gameinfo_id",
            "official_id",
            "position",
        }
        assert expected <= set(form.fields.keys())

    def test_position_choices_are_allowed_positions(self):
        form = InternalFixSuggestionForm()
        choice_values = [choice[0] for choice in form.fields["position"].choices]
        for position in ALLOWED_POSITIONS:
            assert position in choice_values

    def test_rejects_position_mix(self):
        # Regression guard: "Mix" is only a valid position on the
        # external branch's ChoiceField (see
        # TestExternalGameSuggestionForm.test_accepts_position_mix) - the
        # internal-fix branch must keep the strict 4-value choice list.
        form = InternalFixSuggestionForm(
            data={
                "gameinfo_id": "7",
                "official_id": "1",
                "position": "Mix",
            }
        )
        assert not form.is_valid()
        assert "position" in form.errors


class TestSuggestionFormSets(TestCase):
    def test_external_formset_with_no_initial_renders_one_blank_manual_row(self):
        formset = ExternalGameSuggestionFormSet(initial=[])
        assert len(formset.forms) == 1

    def test_external_formset_with_initial_renders_initial_plus_one_blank_row(self):
        formset = ExternalGameSuggestionFormSet(
            initial=[
                {
                    "row_number": 2,
                    "official_id": 1,
                    "number_games": 2,
                    "position": "Referee",
                }
            ]
        )
        assert len(formset.forms) == 2

    def test_internal_fix_formset_with_no_initial_renders_one_blank_manual_row(self):
        formset = InternalFixSuggestionFormSet(initial=[])
        assert len(formset.forms) == 1
