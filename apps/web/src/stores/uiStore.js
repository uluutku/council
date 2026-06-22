import { create } from 'zustand';

export const useUiStore = create((set) => ({
  navigationOpen: false,
  pendingAiForward: null,
  toggleNavigation: () => set((state) => ({ navigationOpen: !state.navigationOpen })),
  closeNavigation: () => set({ navigationOpen: false }),
  setPendingAiForward: (request) => set({ pendingAiForward: request }),
  clearPendingAiForward: () => set({ pendingAiForward: null }),
}));
