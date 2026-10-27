import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CurrentUserProvider } from "../app/currentUser";
import UserAvatar from "./UserAvatar";

describe("UserAvatar", () => {
  it("shows the initials and names the user for assistive tech", () => {
    render(
      <CurrentUserProvider user={{ id: 1, username: "scorecard-test" }}>
        <UserAvatar />
      </CurrentUserProvider>,
    );

    const avatar = screen.getByRole("img", {
      name: "Angemeldet als scorecard-test",
    });
    expect(avatar).toHaveTextContent("ST");
    expect(avatar).toHaveAttribute("title", "Angemeldet als scorecard-test");
  });

  it("is not an interactive control", () => {
    render(
      <CurrentUserProvider user={{ id: 1, username: "max" }}>
        <UserAvatar />
      </CurrentUserProvider>,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("img")).toHaveTextContent("M");
  });

  it("renders nothing without a user", () => {
    const { container } = render(
      <CurrentUserProvider user={null}>
        <UserAvatar />
      </CurrentUserProvider>,
    );

    expect(container.querySelector(".avatar")).toBeNull();
  });

  it("renders nothing outside a provider and for an empty username", () => {
    const { container } = render(
      <>
        <UserAvatar />
        <CurrentUserProvider user={{ id: 2, username: "  " }}>
          <UserAvatar />
        </CurrentUserProvider>
      </>,
    );

    expect(container.querySelector(".avatar")).toBeNull();
  });
});
