"""Forms for the request flow. The table picker is a closed list on purpose."""

from __future__ import annotations

from django import forms

from dbaccess.models import AccessRequest, GrantableTable, TTL_CAP_HOURS


class AccessRequestForm(forms.ModelForm):
    tables = forms.ModelMultipleChoiceField(
        queryset=GrantableTable.objects.filter(grantable=True),
        help_text="Only tables on the curated list can be requested.",
    )
    ttl_hours = forms.IntegerField(min_value=1, max_value=TTL_CAP_HOURS, initial=4)

    class Meta:
        model = AccessRequest
        fields = ["person", "purpose", "ticket_url", "ttl_hours"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk and self.instance.tables_csv:
            self.fields["tables"].initial = self.instance.tables()

    def clean_person(self):
        person = self.cleaned_data["person"].lower()
        if not person.isalnum():
            raise forms.ValidationError("Lowercase letters and digits only.")
        return person

    def clean_tables(self):
        tables = self.cleaned_data["tables"]
        if not tables:
            raise forms.ValidationError("Pick at least one table.")
        return tables

    def save(self, commit=True):
        instance = super().save(commit=False)
        instance.tables_csv = ",".join(sorted(t.name for t in self.cleaned_data["tables"]))
        if commit:
            instance.save()
        return instance
