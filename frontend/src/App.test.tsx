import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import App from "./App";
import { useDeviceStore } from "./stores/deviceStore";
import { usePlayerStore } from "./stores/playerStore";

// Mock api
vi.mock("./api/client", () => ({
  api: {
    getDevices: vi.fn(() => Promise.resolve([])),
    browse: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    getQueue: vi.fn(() => Promise.resolve({ tracks: [], position: 0 })),
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    getSleepTimer: vi.fn(() => Promise.resolve({ remaining_seconds: null })),
    getPresets: vi.fn(() => Promise.resolve({ presets: {} })),
    artUrl: vi.fn((id: string) => `/api/art/${id}`),
  },
}));

// Mock SSE
vi.mock("./hooks/useSSE", () => ({
  useSSE: vi.fn(),
}));

// Mock art color hook
vi.mock("./hooks/useArtColor", () => ({
  useArtColor: () => ({ dominant: "#6366f1", muted: "#2d2b55" }),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe("App", () => {
  beforeEach(() => {
    useDeviceStore.setState({ devices: [], activeDeviceId: null });
    usePlayerStore.setState({ playing: false, currentTrack: null, session: null });
  });

  it("shows player as main view", () => {
    renderWithProviders(<App />);
    expect(screen.getByText("Nothing playing")).toBeInTheDocument();
  });

  it("renders bottom navigation", () => {
    renderWithProviders(<App />);
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveTextContent("Library");
    expect(nav).toHaveTextContent("Queue");
    expect(nav).toHaveTextContent("Rooms");
    expect(nav).toHaveTextContent("EQ");
  });

  it("opens Library drawer on nav click", async () => {
    renderWithProviders(<App />);
    fireEvent.click(screen.getAllByText("Library")[0]);
    await waitFor(() => {
      // Both desktop and mobile drawers render in JSDOM
      expect(
        screen.getAllByPlaceholderText("Search tracks, artists, albums...").length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("opens Rooms drawer on nav click", () => {
    renderWithProviders(<App />);
    fireEvent.click(screen.getAllByText("Rooms")[0]);
    expect(screen.getAllByText("Discovering devices...").length).toBeGreaterThanOrEqual(1);
  });

  it("toggles drawer closed on second click", () => {
    renderWithProviders(<App />);
    fireEvent.click(screen.getAllByText("Rooms")[0]);
    expect(screen.getAllByText("Discovering devices...").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getAllByText("Rooms")[0]);
    expect(screen.getByText("Nothing playing")).toBeInTheDocument();
  });
});
