import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_BASE_URL } from "../utils/apiBase";

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  plan?: string;
}

export interface User {
  id: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
  email: string;
  role: string;
  centerIds: string[];
  name?: string;
  fullName?: string;
}

interface AuthState {
  currentUser: User | null;
  currentTenant: OrganizationInfo | null;
  accessToken: string | null;
  selectedCenterId: string | null;
  isOfflineSession: boolean;
  needsReauth: boolean;

  setAuth: (
    user: User,
    token: string,
    tenant?: OrganizationInfo | null,
  ) => void;
  setAccessToken: (token: string) => void;
  setSelectedCenterId: (id: string | null) => void;
  setOfflineSession: (offline: boolean) => void;
  setNeedsReauth: (needsReauth: boolean) => void;
  initializeAuth: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      currentTenant: null,
      accessToken: null,
      selectedCenterId: null,
      isOfflineSession: false,
      needsReauth: false,

      setAuth: (user, token, tenant) => {
        const normalizeName = (raw?: string | null) =>
          !raw ||
          raw === "SPARSHA Default Organization" ||
          raw === "SPARSHA Workspace" ||
          raw === "VantageEd Workspace"
            ? "EdBase Workspace"
            : raw;

        const resolvedTenant: OrganizationInfo | null = tenant
          ? {
              ...tenant,
              name: normalizeName(tenant.name),
            }
          : user.tenantId
            ? {
                id: user.tenantId,
                name: normalizeName(user.tenantName),
                slug: user.tenantSlug || "default",
              }
            : null;

        set({
          currentUser: {
            ...user,
            name: user.name || user.fullName,
          },
          currentTenant: resolvedTenant,
          accessToken: token,
          selectedCenterId:
            user.centerIds && user.centerIds.length > 0
              ? user.centerIds[0]
              : null,
          isOfflineSession: false,
          needsReauth: false,
        });
      },

      setAccessToken: (token) => {
        set({ accessToken: token, isOfflineSession: false, needsReauth: false });
      },

      setSelectedCenterId: (id) => set({ selectedCenterId: id }),

      setOfflineSession: (offline) => set({ isOfflineSession: offline }),

      setNeedsReauth: (needsReauth) => set({ needsReauth }),

      initializeAuth: () => {
        // Hydration via persist happens automatically.
      },

      logout: async () => {
        try {
          if (typeof navigator === "undefined" || navigator.onLine) {
            await fetch(`${API_BASE_URL}/auth/logout`, {
              method: "POST",
              credentials: "include",
            });
          }
        } catch (err) {
          console.error("Logout API failed", err);
        }

        set({
          currentUser: null,
          currentTenant: null,
          accessToken: null,
          selectedCenterId: null,
          isOfflineSession: false,
          needsReauth: false,
        });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        currentUser: state.currentUser,
        currentTenant: state.currentTenant,
        accessToken: state.accessToken,
        selectedCenterId: state.selectedCenterId,
      }),
    },
  ),
);
