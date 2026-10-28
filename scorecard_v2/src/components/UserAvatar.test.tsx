import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CurrentUserProvider } from "../app/currentUser";
import UserAvatar from "./UserAvatar";

describe("UserAvatar", () => {
  it("shows the initials over the account title", () => {
    const { container } = render(
      <CurrentUserProvider user={{ id: 1, username: "scorecard-test" }}>
        <UserAvatar />
      </CurrentUserProvider>,
    );

    const avatar = container.querySelector(".avatar");
    expect(avatar).toHaveTextContent("ST");
    expect(avatar).toHaveAttribute("title", "Angemeldet als scorecard-test");
  });

  it("is decorative: the account button carries the accessible name", () => {
    const { container } = render(
      <CurrentUserProvider user={{ id: 1, username: "max" }}>
        <UserAvatar />
      </CurrentUserProvider>,
    );

    const avatar = container.querySelector(".avatar");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(avatar).toHaveTextContent("M");
    expect(container.querySelector("img, [role='img']")).toBeNull();
  });

  it("falls back to the account glyph without a user", () => {
    const { container } = render(
      <CurrentUserProvider user={null}>
        <UserAvatar />
      </CurrentUserProvider>,
    );

    const avatar = container.querySelector(".avatar");
    expect(avatar).toHaveTextContent("");
    expect(avatar).toHaveAttribute("title", "Konto");
    expect(avatar?.querySelector("svg")).not.toBeNull();
  });

  it("treats an empty username like no user", () => {
    const { container } = render(
      <CurrentUserProvider user={{ id: 2, username: "  " }}>
        <UserAvatar />
      </CurrentUserProvider>,
    );

    expect(container.querySelector(".avatar svg")).not.toBeNull();
  });
});
