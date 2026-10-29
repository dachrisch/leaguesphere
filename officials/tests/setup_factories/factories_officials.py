import factory

from factory.django import DjangoModelFactory

from officials.models import (
    Official,
    OfficialLicense,
    OfficialLicenseHistory,
    OfficialExternalGames,
)


class OfficialFactory(DjangoModelFactory):
    class Meta:
        model = Official

    first_name = "default first"
    last_name = "default last"


class OfficialLicenseFactory(DjangoModelFactory):
    class Meta:
        model = OfficialLicense

    id = factory.Sequence(lambda n: n + 1)  # Ensure unique ID
    name = factory.Faker("word")

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        """Upsert by primary key when the fixture names one.

        The licence rows ``id=1`` ("F1") and ``id=3`` ("F2") are reference data
        shared by several test modules. Looking them up with
        ``get_or_create(id=…, name=…)`` makes the *pair* the key, so a row left
        behind by an earlier test with a different name is not matched and the
        insert then collides on the primary key (``Duplicate entry '3'``, seen
        on MySQL where rolled-back rows do not free the id). The id is the
        identity here; the name is just a value to keep in sync.
        """
        pk = kwargs.get("id")
        if pk is None:
            return model_class.objects.create(**kwargs)
        defaults = {key: value for key, value in kwargs.items() if key != "id"}
        obj, created = model_class.objects.get_or_create(pk=pk, defaults=defaults)
        if not created:
            stale = [
                (key, value)
                for key, value in defaults.items()
                if getattr(obj, key) != value
            ]
            for key, value in stale:
                setattr(obj, key, value)
            if stale:
                obj.save(update_fields=[key for key, _ in stale])
        return obj


class OfficialLicenseHistoryFactory(DjangoModelFactory):
    class Meta:
        model = OfficialLicenseHistory


class OfficialExternalGamesFactory(DjangoModelFactory):
    class Meta:
        model = OfficialExternalGames
