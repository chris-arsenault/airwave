import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface BreadcrumbEntry {
  id: string;
  title: string;
}

export const LIBRARY_ROOT: BreadcrumbEntry = { id: "0", title: "Library" };

interface UiState {
  /** Currently open drawer id (library/queue/devices/settings) or null. */
  drawer: string | null;
  /**
   * Fallback library browse path when no playback device is selected.
   */
  libraryPath: BreadcrumbEntry[];
  /**
   * Library browse paths remembered per playback device. Re-opening the
   * library returns to where that device last browsed/played from instead of
   * resetting to the root.
   */
  libraryPathsByDevice: Record<string, BreadcrumbEntry[]>;
  setDrawer: (drawer: string | null) => void;
  toggleDrawer: (id: string) => void;
  setLibraryPath: (path: BreadcrumbEntry[], deviceId?: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      drawer: null,
      libraryPath: [LIBRARY_ROOT],
      libraryPathsByDevice: {},
      setDrawer: (drawer) => set({ drawer }),
      toggleDrawer: (id) => set((state) => ({ drawer: state.drawer === id ? null : id })),
      setLibraryPath: (path, deviceId) =>
        set((state) => {
          const nextPath = path.length ? path : [LIBRARY_ROOT];
          if (!deviceId) return { libraryPath: nextPath };
          return {
            libraryPathsByDevice: {
              ...state.libraryPathsByDevice,
              [deviceId]: nextPath,
            },
          };
        }),
    }),
    {
      name: "airwave-ui",
      // Only library browse positions are durable; the open drawer is not.
      partialize: (state) => ({
        libraryPath: state.libraryPath,
        libraryPathsByDevice: state.libraryPathsByDevice,
      }),
    }
  )
);
