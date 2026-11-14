import { create } from "zustand";
import { persist } from "zustand/middleware";

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

  setAuth: (
    user: User,
    token: string,
    tenant?: OrganizationInfo | null,
  ) => void;
  setAccessToken: (token: string) => void;
  setSelectedCenterId: (id: string | null) => void;
  initializeAuth: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      currentTenant: null,
      accessToken: null,
      selectedCenterId: null,

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
          currentTenant: null,
          accessToken: null,
          selectedCenterId: null,
        });
      },
    }),
    {
      name: "auth-storage",
    },
  ),
);
