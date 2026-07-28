import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GramophonePlayer } from "./GramophonePlayer";

describe("GramophonePlayer hydration", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
    cleanup();
  });

  it("keeps browser-derived position out of SSR and restores it after hydration", async () => {
    sessionStorage.setItem(
      "nkddiary-player-position",
      JSON.stringify({ x: 42, y: 84 }),
    );

    const serverHtml = renderToString(<GramophonePlayer />);
    expect(serverHtml).not.toContain("left:42px");
    expect(serverHtml).not.toContain("top:84px");

    container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    await act(async () => {
      root = hydrateRoot(container!, <GramophonePlayer />);
    });

    await waitFor(() => {
      const player = container?.querySelector("aside");
      expect(player).toHaveStyle({ left: "42px", top: "84px" });
    });
  });
});
