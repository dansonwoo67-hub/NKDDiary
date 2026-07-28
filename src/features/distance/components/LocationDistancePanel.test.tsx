import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationDistancePanel } from "./LocationDistancePanel";

const refresh = vi.fn();
const recordLocation = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/features/profile/actions", () => ({
  recordLoginLocationAction: (input: { latitude: number; longitude: number }) => recordLocation(input),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("LocationDistancePanel", () => {
  it("explains privacy before requesting location", () => {
    render(
      <LocationDistancePanel
        userA={{ displayName: "Susan", avatarUrl: null }}
        userB={{ displayName: "Niki", avatarUrl: null }}
        distanceKm={null}
        currentHasLocation={false}
        otherHasLocation={false}
        currentUpdatedAt={null}
        otherUpdatedAt={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "开启位置距离" })).toBeVisible();
    expect(screen.getByText(/不会向对方展示精确位置/)).toBeVisible();
  });

  it("shows a one-sided waiting state", () => {
    render(
      <LocationDistancePanel
        userA={{ displayName: "Susan", avatarUrl: null }}
        userB={{ displayName: "Niki", avatarUrl: null }}
        distanceKm={null}
        currentHasLocation
        otherHasLocation={false}
        currentUpdatedAt="2026-07-26T10:00:00.000Z"
        otherUpdatedAt={null}
      />,
    );

    expect(screen.getByText(/等待伴侣开启位置距离/)).toBeVisible();
    expect(screen.getByRole("button", { name: "更新位置" })).toBeVisible();
  });

  it("shows distance and both update times without coordinates", () => {
    render(
      <LocationDistancePanel
        userA={{ displayName: "Susan", avatarUrl: null }}
        userB={{ displayName: "Niki", avatarUrl: null }}
        distanceKm={1234.56}
        currentHasLocation
        otherHasLocation
        currentUpdatedAt="2026-07-26T10:00:00.000Z"
        otherUpdatedAt="2026-07-25T10:00:00.000Z"
      />,
    );

    expect(screen.getByText("相距 1,234.6 公里")).toBeVisible();
    expect(screen.getByText(/你更新于/)).toBeVisible();
    expect(screen.getByText(/伴侣更新于/)).toBeVisible();
    expect(document.body.textContent).not.toContain("latitude");
    expect(document.body.textContent).not.toContain("longitude");
  });

  it("requests location only after the user clicks and refreshes after saving", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 23.5, longitude: 121.2 } } as GeolocationPosition);
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    recordLocation.mockResolvedValue({ ok: true, message: "位置已更新。" });

    render(
      <LocationDistancePanel
        userA={{ displayName: "Susan", avatarUrl: null }}
        userB={{ displayName: "Niki", avatarUrl: null }}
        distanceKm={null}
        currentHasLocation={false}
        otherHasLocation={false}
        currentUpdatedAt={null}
        otherUpdatedAt={null}
      />,
    );

    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "开启位置距离" }));

    await waitFor(() => expect(recordLocation).toHaveBeenCalledWith({
      latitude: 23.5,
      longitude: 121.2,
      source: "manual",
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("remembers a denied permission and keeps a manual enable button", async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(
      <LocationDistancePanel
        userA={{ displayName: "Susan", avatarUrl: null }}
        userB={{ displayName: "Niki", avatarUrl: null }}
        distanceKm={null}
        currentHasLocation={false}
        otherHasLocation={false}
        currentUpdatedAt={null}
        otherUpdatedAt={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开启位置距离" }));
    expect(await screen.findByText(/你拒绝了定位权限/)).toBeVisible();
    expect(localStorage.getItem("nkd-location-permission-declined")).toBe("1");
    expect(screen.getByRole("button", { name: "再次开启" })).toBeVisible();
  });

  it("restores the denied state after a refresh instead of showing first-time enablement", () => {
    localStorage.setItem("nkd-location-permission-declined", "1");

    render(
      <LocationDistancePanel
        userA={{ displayName: "Susan", avatarUrl: null }}
        userB={{ displayName: "Niki", avatarUrl: null }}
        distanceKm={null}
        currentHasLocation={false}
        otherHasLocation={false}
        currentUpdatedAt={null}
        otherUpdatedAt={null}
      />,
    );

    expect(screen.getByText(/你拒绝了定位权限/)).toBeVisible();
    expect(screen.getByRole("button", { name: "再次开启" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "开启位置距离" })).not.toBeInTheDocument();
  });

  it("keeps a denied permission isolated to the current account", () => {
    localStorage.setItem("nkd-location-permission-declined:susan", "1");
    const sharedProps = {
      userA: { displayName: "Susan", avatarUrl: null },
      userB: { displayName: "Niki", avatarUrl: null },
      distanceKm: null,
      currentHasLocation: false,
      otherHasLocation: false,
      currentUpdatedAt: null,
      otherUpdatedAt: null,
    };

    const { rerender } = render(
      <LocationDistancePanel {...sharedProps} currentUserId="susan" />,
    );
    expect(screen.getByRole("button", { name: "再次开启" })).toBeVisible();

    rerender(<LocationDistancePanel {...sharedProps} currentUserId="niki" />);
    expect(screen.getByRole("button", { name: "开启位置距离" })).toBeVisible();
    expect(screen.queryByText(/你拒绝了定位权限/)).not.toBeInTheDocument();
  });

  it("handles browsers without geolocation", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });

    render(
      <LocationDistancePanel
        userA={{ displayName: "Susan", avatarUrl: null }}
        userB={{ displayName: "Niki", avatarUrl: null }}
        distanceKm={null}
        currentHasLocation={false}
        otherHasLocation={false}
        currentUpdatedAt={null}
        otherUpdatedAt={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开启位置距离" }));
    expect(await screen.findByText(/当前浏览器不支持定位/)).toBeVisible();
  });
});
