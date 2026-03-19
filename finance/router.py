from django.conf import settings


class FinanceRouter:
    """
    A router to control all database operations on models in the
    finance application. Supports transparent fallback to 'default'
    if no 'finance' database is configured (useful for Local/Stage).
    """

    def _get_finance_db(self):
        # Use 'finance' if it exists in settings, otherwise fallback to 'default'
        if "finance" in settings.DATABASES:
            return "finance"
        return "default"

    def db_for_read(self, model, **hints):
        if model._meta.app_label == "finance":
            return self._get_finance_db()
        return "default"

    def db_for_write(self, model, **hints):
        if model._meta.app_label == "finance":
            return self._get_finance_db()
        return "default"

    def allow_relation(self, obj1, obj2, **hints):
        """
        Allow relations between 'finance' and other apps.
        Physical constraints are disabled in models.py via db_constraint=False.
        """
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        target_db = self._get_finance_db()

        if app_label == "finance":
            return db == target_db

        # Prevent other apps from migrating into the 'finance' DB
        # when it is isolated on Production.
        if db == target_db and target_db != "default":
            return False

        return None
