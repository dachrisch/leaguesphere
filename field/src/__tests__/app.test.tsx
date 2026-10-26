import { render, screen } from "@testing-library/react";

import App from "../App";

it("renders the field shell headline", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: /Feld-Ansicht/i })
  ).toBeInTheDocument();
});
