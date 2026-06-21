import { create } from 'zustand';

export const useUiStore = create((set) => ({
  navigationOpen: false,
  toggleNavigation: () => set((state) => ({ navigationOpen: !state.navigationOpen })),
  closeNavigation: () => set({ navigationOpen: false }),
}));
