import { describe, expect, it, vi } from "vitest";

import { apiGet } from "./client";
import { searchOfficials } from "./people";

vi.mock("./client", () => ({
  apiGet: vi.fn(async () => []),
}));

const apiGetMock = apiGet as unknown as ReturnType<typeof vi.fn>;

describe("searchOfficials", () => {
  it("passes the team as a ranking hint", async () => {
    await searchOfficials("Klein", 7);
    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/officials/search/list?name=Klein&limit=10&team=7",
    );
  });

  it("searches the whole directory without a team", async () => {
    await searchOfficials("Klein", null);
    expect(apiGetMock).toHaveBeenCalledWith(
      "/api/officials/search/list?name=Klein&limit=10",
    );
  });

  it("trims the query and forwards the limit", async () => {
    await searchOfficials("  Klein  ", 7, 5);
    const calls = apiGetMock.mock.calls;
    const [path] = calls[calls.length - 1] as [string];
    expect(path).toContain("name=Klein");
    expect(path).toContain("limit=5");
  });
});
