import api from './api';
import type { UserRole } from '../types';

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

export const listUsers = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
}) => api.get<UsersListResponse>('/users', { params }).then((r) => r.data);

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
