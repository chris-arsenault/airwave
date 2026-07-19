import { create } from "zustand";

export interface BreadcrumbEntry {
  id: string;
  title: string;
}

export const LIBRARY_ROOT: BreadcrumbEntry = { id: "0", title: "Library" };

interface UiState {
  /** Currently open drawer id (library/queue/devices/settings) or null. */
  drawer: string | null;
  setDrawer: (drawer: string | null) => void;
  toggleDrawer: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawer: null,
  setDrawer: (drawer) => set({ drawer }),
  toggleDrawer: (id) => set((state) => ({ drawer: state.drawer === id ? null : id })),
}));
