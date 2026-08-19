import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../test-utils";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";

const { mockGetPlaylists, mockAddToPlaylist, mockCreatePlaylist } = vi.hoisted(() => ({
  mockGetPlaylists: vi.fn(),
  mockAddToPlaylist: vi.fn(() => Promise.resolve({ added: 12 })),
  mockCreatePlaylist: vi.fn(() => Promise.resolve({ id: 3, name: "Fresh", track_count: 12 })),
}));

vi.mock("../../api/client", () => ({
  api: {
    getPlaylists: mockGetPlaylists,
    addToPlaylist: mockAddToPlaylist,
    createPlaylist: mockCreatePlaylist,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPlaylists.mockResolvedValue([
    { id: 1, name: "Road Trip", track_count: 2, created_at: null, updated_at: null },
  ]);
});

describe("AddToPlaylistDialog", () => {
  it("adds an album container to an existing playlist", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <AddToPlaylistDialog trackIds={["aa7"]} label="Kind of Blue" onClose={onClose} />
    );

    fireEvent.click(await screen.findByText("Road Trip"));
    await waitFor(() => expect(mockAddToPlaylist).toHaveBeenCalledWith(1, ["aa7"]));
    expect(onClose).toHaveBeenCalled();
  });

  it("creates a playlist seeded with the selection", async () => {
    renderWithProviders(
      <AddToPlaylistDialog trackIds={["aa7"]} label="Kind of Blue" onClose={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText("New Playlist"), { target: { value: "Fresh" } });
    fireEvent.click(screen.getByText("Create & Add"));
    await waitFor(() => expect(mockCreatePlaylist).toHaveBeenCalledWith("Fresh", ["aa7"]));
  });

  it("reports a failure without closing", async () => {
    const onClose = vi.fn();
    mockAddToPlaylist.mockRejectedValueOnce(new Error("400 Bad Request"));
    renderWithProviders(
      <AddToPlaylistDialog trackIds={["aa7"]} label="Kind of Blue" onClose={onClose} />
    );

    fireEvent.click(await screen.findByText("Road Trip"));
    expect(await screen.findByText("400 Bad Request")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
