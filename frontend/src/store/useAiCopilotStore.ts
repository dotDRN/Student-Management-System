import { create } from 'zustand';

interface AiCopilotState {
  isOpen: boolean;
  activeThreadId: string | null;
  pendingPrompt: string | null;
  openDrawer: (prefillPrompt?: string) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setActiveThreadId: (threadId: string | null) => void;
  consumePendingPrompt: () => string | null;
}

export const useAiCopilotStore = create<AiCopilotState>((set, get) => ({
  isOpen: false,
  activeThreadId: null,
  pendingPrompt: null,
  openDrawer: (prefillPrompt?: string) =>
    set({
      isOpen: true,
      ...(prefillPrompt ? { pendingPrompt: prefillPrompt } : {}),
    }),
  closeDrawer: () => set({ isOpen: false }),
  toggleDrawer: () => set((s) => ({ isOpen: !s.isOpen })),
  setActiveThreadId: (threadId) => set({ activeThreadId: threadId }),
  consumePendingPrompt: () => {
    const val = get().pendingPrompt;
    if (val !== null) set({ pendingPrompt: null });
    return val;
  },
}));
