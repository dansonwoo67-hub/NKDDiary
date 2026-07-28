import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TodayInfo } from "./TodayInfo";

vi.mock("@/lib/date/chinese-calendar", () => ({
  getDateInfo: () => ({
    year: 2026,
    month: 7,
    day: 28,
    weekday: "星期二",
    holiday: null,
    solarTerm: null,
    lunar: {
      yearName: "丙午",
      monthName: "六月",
      dayName: "十五",
    },
  }),
}));

vi.mock("./EarthDecoration", () => ({
  EarthDecoration: () => <div>earth</div>,
}));

describe("TodayInfo hydration", () => {
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

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the live clock out of SSR and shows it after hydration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T09:08:07+08:00"));

    const serverHtml = renderToString(<TodayInfo />);
    expect(serverHtml).not.toMatch(/\d{2}:\d{2}:\d{2}/);

    container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    await act(async () => {
      root = hydrateRoot(container!, <TodayInfo />);
      await Promise.resolve();
    });

    expect(container).toHaveTextContent("09:08:07");
  });
});
