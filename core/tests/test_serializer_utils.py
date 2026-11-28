from core.serializer_utils import Obfuscator


def test_staff_sees_the_full_value():
    assert Obfuscator.reveal_unless_obfuscated(True, "Anna", "", "Muster") == (
        "Anna Muster"
    )


def test_others_see_the_obfuscated_value():
    assert Obfuscator.reveal_unless_obfuscated(
        False, "Anna", "Muster"
    ) == Obfuscator.obfuscate("Anna", "Muster")
