import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  email: string;
  role: string;
  centerIds: string[];
  name?: string;
}

interface AuthState {
  currentUser: User | null;
  accessToken: string | null;
  selectedCenterId: string | null;

  setAuth: (user: User, token: string) => void;
  setAccessToken: (token: string) => void;
  setSelectedCenterId: (id: string | null) => void;
  initializeAuth: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      accessToken: null,
      selectedCenterId: null,

      setAuth: (user, token) => {
        set({
          currentUser: user,
          accessToken: token,
          selectedCenterId: user.centerIds.length > 0 ? user.centerIds[0] : null,
        });
      },

      setAccessToken: (token) => {
        set({ accessToken: token });
      },

      setSelectedCenterId: (id) => set({ selectedCenterId: id }),

      initializeAuth: () => {
        // Hydration via persist happens automatically.
      },

      logout: async () => {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
          });
        } catch (err) {
          console.error("Logout API failed", err);
        }

        set({
          currentUser: null,
          accessToken: null,
          selectedCenterId: null,
        });
      },
    }),
    {
      name: "auth-storage",
    }
  )
);