import json
import pathlib

from pandas import DataFrame


class DataFrameWrapper:
    def __init__(self, dataframe: DataFrame):
        self.dataframe = dataframe

    def to_equal_json(self, filename):
        actual = JsonHelper.loads(self.dataframe.to_json(orient="table"))
        expected = JsonHelper.read_file(filename)

        # Normalize schema "type" mismatches (Pandas 1.x vs 2.x vs 3.x)
        def normalize_schema(data):
            if "schema" in data:
                # Remove version-specific field
                data["schema"].pop("pandas_version", None)
                for field in data.get("schema", {}).get("fields", []):
                    # Normalize 'any' to 'string'
                    if field.get("type") == "any":
                        field["type"] = "string"
                    # Remove 'extDtype' as it varies across versions
                    field.pop("extDtype", None)
                # Drop volatile write-stamps: updated_at is set at row-creation
                # time, so golden files cannot pin it (same reason the
                # snapshot ETag treats it as a freshness signal, not content).
                data["schema"]["fields"] = [
                    field
                    for field in data["schema"].get("fields", [])
                    if field.get("name") != "updated_at"
                ]
            for row in data.get("data", []):
                row.pop("updated_at", None)
            return data

        actual = normalize_schema(actual)
        expected = normalize_schema(expected)

        assert actual == expected, f"\nExpected:\n{expected}\n\nGot:\n{actual}"


class DataFrameAssertion(object):

    @classmethod
    def expect(cls, dataframe: DataFrame):
        return DataFrameWrapper(dataframe)


class JsonHelper(object):
    @staticmethod
    def read_file(filename) -> dict:
        with open(pathlib.Path(__file__).parent / "testdata" / f"{filename}.json") as f:
            expected_gamelog = json.load(f)
        return expected_gamelog

    @staticmethod
    def loads(json_str) -> dict:
        return json.loads(json_str)
