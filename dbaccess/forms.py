"""Forms for the request flow. The table picker is a closed list on purpose."""

from __future__ import annotations

from django import forms

from dbaccess.models import AccessRequest, GrantableTable, TTL_CAP_HOURS


class AccessRequestForm(forms.ModelForm):
    tables = forms.ModelMultipleChoiceField(
        queryset=GrantableTable.objects.filter(grantable=True),
        widget=forms.SelectMultiple(attrs={"class": "form-select", "size": 12}),
        help_text=(
            "Only tables on the curated list can be requested. The account can read the "
            "whole schema but update nothing outside the tables picked here."
        ),
    )
    ttl_hours = forms.IntegerField(
        label="How long (hours)",
        min_value=1,
        max_value=TTL_CAP_HOURS,
        initial=4,
        widget=forms.NumberInput(
            attrs={"class": "form-control", "min": 1, "max": TTL_CAP_HOURS}
        ),
        help_text=(
            f"1 to {TTL_CAP_HOURS} hours. The account stops working at the cap whether or "
            "not anyone remembers it."
        ),
    )

    class Meta:
        model = AccessRequest
        # `person` is not a choice: it is the requester's login, so the account
        # can always be traced back to one named human. RequestCreateView sets it.
        fields = ["purpose", "ticket_url", "ttl_hours"]
        labels = {
            "purpose": "What needs fixing",
            "ticket_url": "Ticket",
        }
        widgets = {
            "purpose": forms.Textarea(
                attrs={
                    "class": "form-control",
                    "rows": 4,
                    "placeholder": (
                        "What is wrong, what will you change, and how will you check "
                        "it afterwards?"
                    ),
                }
            ),
            "ticket_url": forms.URLInput(
                attrs={"class": "form-control", "placeholder": "https://… (optional)"}
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk and self.instance.tables_csv:
            self.fields["tables"].initial = self.instance.tables()

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
