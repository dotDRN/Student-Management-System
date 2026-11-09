import api from "./api";
import type { OrganizationInfo } from "../store/useAuthStore";

export type AuthUser = {
  id: string;
  tenantId: string;
  tenantSlug?: string;
  tenantName?: string;
  email: string;
  fullName: string;
  role: string;
  centerIds: string[];
};

export type WorkspaceOption = {
  tenantId: string;
  name: string;
  slug: string;
  role: string;
};

export type LoginResponse = {
  token?: string;
  accessToken?: string;
  user?: AuthUser;
  organization?: OrganizationInfo;
  requiresWorkspaceSelection?: boolean;
  workspaces?: WorkspaceOption[];
};

export type RegisterInstancePayload = {
  organizationName: string;
  slug?: string;
  adminName: string;
  email: string;
  password: string;
  phone?: string;
  defaultCenterName?: string;
  defaultCenterLocation?: string;
};

export type RegisterInstanceResponse = {
  success: boolean;
  message: string;
  accessToken: string;
  user: AuthUser;
  organization: OrganizationInfo;
};

export type CheckSlugResponse = {
  success: boolean;
  available: boolean;
  normalizedSlug: string;
  message?: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
};

export const login = (
  email: string,
  password: string,
  options?: { slug?: string; tenantId?: string },
) =>
  api
    .post<LoginResponse>("/auth/login", {
      email,
      password,
      ...(options?.slug ? { slug: options.slug } : {}),
      ...(options?.tenantId ? { tenantId: options.tenantId } : {}),
    })
    .then((r) => r.data);

export const registerInstance = (payload: RegisterInstancePayload) =>
  api
    .post<RegisterInstanceResponse>("/auth/register-instance", payload)
    .then((r) => r.data);

export const checkSlugAvailability = (slug: string) =>
  api
    .get<CheckSlugResponse>("/auth/check-slug", { params: { slug } })
    .then((r) => r.data);

export const getMe = () =>
  api.get<{ user: AuthUser }>("/auth/me").then((r) => r.data.user);
