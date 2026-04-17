import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  selectedStoreId: string | null;
  setSelectedStoreId: (id: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedStoreId: null,
      setSelectedStoreId: (id) => set({ selectedStoreId: id }),
    }),
    {
      name: 'mrcod-app-state',
    }
  )
);
