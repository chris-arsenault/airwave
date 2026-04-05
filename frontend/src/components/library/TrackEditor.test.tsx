import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../test-utils";
import { TrackEditor, BulkAlbumArtistDialog, RenameArtistDialog } from "./TrackEditor";
import type { LibraryItem } from "../../api/client";

const { mockUpdateTrack, mockBulkSetAlbumArtist, mockBulkRenameArtist } = vi.hoisted(() => ({
  mockUpdateTrack: vi.fn(() => Promise.resolve()),
  mockBulkSetAlbumArtist: vi.fn(() => Promise.resolve({ total: 5, success: 5, failed: 0 })),
  mockBulkRenameArtist: vi.fn(() => Promise.resolve({ total: 3, success: 3, failed: 0 })),
}));

vi.mock("../../api/client", () => ({
  api: {
    updateTrack: mockUpdateTrack,
    bulkSetAlbumArtist: mockBulkSetAlbumArtist,
    bulkRenameArtist: mockBulkRenameArtist,
  },
}));

const sampleTrack: LibraryItem = {
  type: "track",
  id: "t1",
  parent_id: "c1",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  album_artist: "Test AlbumArtist",
  genre: "Rock",
  track_number: "3",
  class: "object.item.audioItem.musicTrack",
  duration: "3:30",
  stream_url: null,
  mime_type: null,
  sample_rate: null,
  bit_depth: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrackEditor rendering", () => {
  it("renders all metadata fields", () => {
    renderWithProviders(<TrackEditor track={sampleTrack} onClose={vi.fn()} />);
    expect(screen.getByText("Edit Track")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Song")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Artist")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Album")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test AlbumArtist")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rock")).toBeInTheDocument();
  });

  it("shows Cancel and Save buttons", () => {
    renderWithProviders(<TrackEditor track={sampleTrack} onClose={vi.fn()} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(<TrackEditor track={sampleTrack} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("TrackEditor save behavior", () => {
  it("calls api.updateTrack with changed fields on Save", async () => {
    const onClose = vi.fn();
    renderWithProviders(<TrackEditor track={sampleTrack} onClose={onClose} />);
    const titleInput = screen.getByDisplayValue("Test Song");
    fireEvent.change(titleInput, { target: { value: "New Title" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockUpdateTrack).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ title: "New Title" })
      );
    });
  });

  it("closes without API call if nothing changed", async () => {
    const onClose = vi.fn();
    renderWithProviders(<TrackEditor track={sampleTrack} onClose={onClose} />);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(mockUpdateTrack).not.toHaveBeenCalled();
  });
});

describe("BulkAlbumArtistDialog", () => {
  it("renders dialog with current artist", () => {
    renderWithProviders(
      <BulkAlbumArtistDialog containerId="c1" currentArtist="Current" onClose={vi.fn()} />
    );
    expect(screen.getByText("Set Album Artist")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Current")).toBeInTheDocument();
  });

  it("calls API and shows result on Apply", async () => {
    renderWithProviders(
      <BulkAlbumArtistDialog containerId="c1" currentArtist="Old" onClose={vi.fn()} />
    );
    const input = screen.getByDisplayValue("Old");
    fireEvent.change(input, { target: { value: "New Artist" } });
    fireEvent.click(screen.getByText("Apply"));
    await waitFor(() => {
      expect(mockBulkSetAlbumArtist).toHaveBeenCalledWith("c1", "New Artist");
    });
    await waitFor(() => {
      expect(screen.getByText(/Updated 5 tracks/)).toBeInTheDocument();
    });
  });
});

describe("RenameArtistDialog", () => {
  it("renders dialog with initial from value", () => {
    renderWithProviders(<RenameArtistDialog initialFrom="Old Name" onClose={vi.fn()} />);
    expect(screen.getByText("Rename Artist")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Old Name")).toBeInTheDocument();
  });

  it("calls API with from/to values on Rename", async () => {
    renderWithProviders(<RenameArtistDialog initialFrom="Old" onClose={vi.fn()} />);
    const toInput = screen.getByLabelText("To");
    fireEvent.change(toInput, { target: { value: "New" } });
    fireEvent.click(screen.getByText("Rename"));
    await waitFor(() => {
      expect(mockBulkRenameArtist).toHaveBeenCalledWith("Old", "New", "both");
    });
    await waitFor(() => {
      expect(screen.getByText(/Renamed 3 of 3/)).toBeInTheDocument();
    });
  });

  it("shows field selection buttons", () => {
    renderWithProviders(<RenameArtistDialog initialFrom="Test" onClose={vi.fn()} />);
    expect(screen.getByText("Both")).toBeInTheDocument();
    expect(screen.getByText("Artist")).toBeInTheDocument();
    expect(screen.getByText("Album Artist")).toBeInTheDocument();
  });
});
