import { create } from "zustand";
import type { Marker } from "./markers";
export const useMarkerStore = create<{
  markers: Marker[];
  setMarkers: (markers: Marker[]) => void;
}>((set) => ({ markers: [], setMarkers: (markers) => set({ markers }) }));
