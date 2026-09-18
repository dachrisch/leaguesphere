import os

from django import forms

from officials.service.game_official_entries import (
    ALLOWED_POSITIONS,
    EXTERNAL_ALLOWED_POSITIONS,
)

POSITION_CHOICES = [(position, position) for position in ALLOWED_POSITIONS]
EXTERNAL_POSITION_CHOICES = [
    (position, position) for position in EXTERNAL_ALLOWED_POSITIONS
]

IMPORT_UPLOAD_ALLOWED_EXTENSIONS = (".csv", ".xlsx", ".xls")


class AddInternalGameOfficialEntryForm(forms.Form):
    entries = forms.CharField(
        widget=forms.Textarea,
        label="Spieleinträge",
        help_text="Einträge in der folgenden Reihenfolge jeweils mit Komma separiert: "
        "gameinfo_id, official_id, "
        "Position (Referee, Down Judge, Field Judge, Side Judge)",
    )


class MoodleLoginForm(forms.Form):
    username = forms.CharField(
        label="Benutername",
        widget=forms.TextInput(attrs={"placeholder": "Benutername / E-Mail-Adresse"}),
    )
    password = forms.CharField(
        label="Passwort", widget=forms.PasswordInput(attrs={"placeholder": "Passwort"})
    )
    remember_me = forms.BooleanField(
        required=False,
        label="Angemeldet bleiben",
    )


class GameOfficialImportUploadForm(forms.Form):
    file = forms.FileField(
        label="Datei (Google-Sheet-Export)",
        help_text="Export der Selbstmelde-Tabelle als .csv oder .xlsx.",
    )

    def clean_file(self):
        uploaded_file = self.cleaned_data["file"]
        _, extension = os.path.splitext(uploaded_file.name.lower())
        if extension not in IMPORT_UPLOAD_ALLOWED_EXTENSIONS:
            raise forms.ValidationError(
                "Nicht unterstütztes Dateiformat - bitte eine .csv- oder "
                ".xlsx-Datei hochladen."
            )
        return uploaded_file


class ExternalGameSuggestionForm(forms.Form):
    """One editable row for a suggested OfficialExternalGames entry. The
    hidden row_number/status/reason fields are for display continuity
    only (so a re-rendered form after a validation error still shows the
    same status badge/reason as preview time) - the view NEVER trusts them
    for the actual save decision, which always re-runs
    ExternalGameOfficialEntry's own validation from scratch."""

    row_number = forms.IntegerField(required=False, widget=forms.HiddenInput)
    status = forms.CharField(required=False, widget=forms.HiddenInput)
    reason = forms.CharField(required=False, widget=forms.HiddenInput)

    # Every substantive field is required=False at the Django-form level
    # on purpose: a "needs_attention" row (e.g. an official_id that
    # couldn't be resolved) must not block the *whole formset* from
    # validating just because it's sitting there unchecked. Real
    # validation of a checked row happens in ExternalGameOfficialEntry at
    # save time, which raises clear, German, per-row errors - mirroring
    # how AddInternalGameOfficialUpdateView already validates its raw
    # pasted text via the entry classes rather than Django field
    # constraints.
    include = forms.BooleanField(required=False, label="Übernehmen")
    official_id = forms.IntegerField(label="Official-ID (Lizenznummer)", required=False)
    number_games = forms.IntegerField(label="Anzahl Spiele", required=False)
    date = forms.DateField(label="Datum des Einsatzes", required=False)
    position = forms.ChoiceField(
        choices=EXTERNAL_POSITION_CHOICES, label="Position", required=False
    )
    association = forms.CharField(label="Verband", required=False)
    halftime_duration = forms.IntegerField(
        label="Dauer einer Halbzeit (Minuten)", required=False
    )
    has_clockcontrol = forms.BooleanField(required=False, label="Mit Clock Control")
    is_international = forms.BooleanField(
        required=False, label="Internationales Turnier"
    )
    reporter_name = forms.CharField(label="Name", required=False)
    notification_date = forms.DateField(label="Zeitstempel", required=False)
    comment = forms.CharField(label="Anmerkung / Turniername", required=False)


class InternalFixSuggestionForm(forms.Form):
    """One editable row for a suggested GameOfficial correction (the
    "DFFL" branch). Same hidden-fields-are-display-only contract as
    ExternalGameSuggestionForm - GameOfficialCorrectionEntry re-derives
    create/update/ambiguous from scratch at save time."""

    row_number = forms.IntegerField(required=False, widget=forms.HiddenInput)
    status = forms.CharField(required=False, widget=forms.HiddenInput)
    reason = forms.CharField(required=False, widget=forms.HiddenInput)
    action = forms.CharField(required=False, widget=forms.HiddenInput)
    current_official_display = forms.CharField(required=False, widget=forms.HiddenInput)

    # See ExternalGameSuggestionForm's comment: required=False throughout
    # so an unchecked, flawed row can't block the whole formset.
    include = forms.BooleanField(required=False, label="Übernehmen")
    gameinfo_id = forms.IntegerField(label="Spiel-ID", required=False)
    official_id = forms.IntegerField(label="Official-ID (Lizenznummer)", required=False)
    position = forms.ChoiceField(
        choices=POSITION_CHOICES, label="Position", required=False
    )


ExternalGameSuggestionFormSet = forms.formset_factory(
    ExternalGameSuggestionForm, extra=1
)
InternalFixSuggestionFormSet = forms.formset_factory(InternalFixSuggestionForm, extra=1)
