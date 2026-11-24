import api from './api';
import type { UserRole } from '../types';
import { withOfflineRead } from '../offline/offlineServiceHelper';

export type UserAdminItem = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
};

export type UsersListResponse = {
  users: UserAdminItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type CreateUserPayload = {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  centerIds: string[];
  role: UserRole;
  
};

export type UpdateUserPayload = {
  fullName?: string;
  phone?: string;
  role?: UserRole;
  isActive?: boolean;
};

const USERS_CACHE_KEY = 'edbase_users_cache_v1';

export const listUsers = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
}) =>
  withOfflineRead<UsersListResponse>(
    () => api.get<UsersListResponse>('/users', { params }).then((r) => r.data),
    async () => {
      try {
        const raw = localStorage.getItem(USERS_CACHE_KEY);
        let users: UserAdminItem[] = raw ? JSON.parse(raw) : [];
        if (params?.role) users = users.filter((u) => u.role === params.role);
        if (params?.isActive !== undefined) users = users.filter((u) => u.isActive === params.isActive);
        if (params?.search) {
          const q = params.search.toLowerCase();
          users = users.filter(
            (u) => u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q),
          );
        }
        return { users, total: users.length, page: 1, totalPages: 1 };
      } catch {
        return { users: [], total: 0, page: 1, totalPages: 1 };
      }
    },
    async (res) => {
      try {
        if (Array.isArray(res.users) && res.users.length > 0 && !params?.search && !params?.role) {
          localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(res.users));
        }
      } catch {
        // Ignore
      }
    },
  );

export const createUser = (payload: CreateUserPayload) =>
  api.post<UserAdminItem>('/users', payload).then((r) => r.data);

export const updateUser = (userId: string, payload: UpdateUserPayload) =>
  api.put<UserAdminItem>(`/users/${userId}`, payload).then((r) => r.data);

export const resetUserPassword = (userId: string, newPassword: string) =>
  api.post<{ success: boolean }>(`/users/${userId}/reset-password`, { newPassword }).then((r) => r.data);

export const deactivateUser = (userId: string) =>
  api.delete<UserAdminItem>(`/users/${userId}`).then((r) => r.data);

export const updateUserCenters = (userId: string, centerIds: string[]) =>
  api.put(`/users/${userId}/centers`, { centerIds }).then((r) => r.data);
