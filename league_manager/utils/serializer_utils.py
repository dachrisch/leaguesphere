from rest_framework.fields import SerializerMethodField
from rest_framework.serializers import Serializer


class Obfuscator:

    @staticmethod
    def obfuscate(*args: str):
        obfuscated_text = ""
        for current_arg in args:
            if current_arg is not None and current_arg != "":
                obfuscated_text += current_arg[0] + 4 * "*"
        return obfuscated_text

    @staticmethod
    def reveal_unless_obfuscated(is_staff: bool, *args: str) -> str:
        """
        Staff-aware display helper: joins the given parts with a space
        when `is_staff` is true, otherwise reduces them via `obfuscate()`.
        Centralizes the "full value for staff, redacted otherwise" policy
        so it has one implementation instead of being reimplemented at
        each call site (e.g. OfficialSerializer.get_name() and the
        officials statistics leaderboard).
        """
        if is_staff:
            return " ".join(arg for arg in args if arg)
        return Obfuscator.obfuscate(*args)


class ObfuscatorSerializer(Serializer):
    def __init__(self, is_staff=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.is_staff = is_staff

    def obfuscate_field_if_necessary(self, field_name, obj: dict):
        value = obj[field_name]
        if self.is_staff:
            return value
        return Obfuscator.obfuscate(value)


class ObfuscateField(SerializerMethodField):
    def __init__(self, field_name, **kwargs):
        super().__init__(method_name="obfuscate_field_if_necessary", **kwargs)
        self.db_field_name = field_name

    def to_representation(self, value):
        method = getattr(self.parent, self.method_name)
        return method(self.db_field_name, value)
