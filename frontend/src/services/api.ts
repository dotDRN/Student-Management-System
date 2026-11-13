import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { socketService } from "./socket.service";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true, // required for cookies
});

// ----------------------
// REQUEST INTERCEPTOR
// ----------------------

api.interceptors.request.use((config) => {
  const state = useAuthStore.getState();
  const token = state.accessToken;
  const tenantId = state.currentTenant?.id || state.currentUser?.tenantId;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (tenantId) {
    config.headers["x-tenant-id"] = tenantId;
  }

  return config;
});

// ----------------------
// RESPONSE INTERCEPTOR
// ----------------------

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;

    // If unauthorized
    if (err.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes("/auth/refresh")) {
      originalRequest._retry = true;

      // If already refreshing → queue requests
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        const baseURL = import.meta.env.VITE_API_URL || "/api";
        const res = await axios.post(
          `${baseURL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newToken = res.data.accessToken;

        // Save new token to Zustand and update Socket.IO auth
        useAuthStore.getState().setAccessToken(newToken);
        socketService.updateToken(newToken);

        // Update header
        api.defaults.headers.Authorization = `Bearer ${newToken}`;

        onRefreshed(newToken);

        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed → logout
        useAuthStore.getState().logout();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export function getApiErrorMessage(err: unknown, fallback = "Request failed"): string {
  const responseData = (
    err as { response?: { data?: { error?: string; message?: string } } }
  )?.response?.data;
  if (responseData?.error) return responseData.error;
  if (responseData?.message) return responseData.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default api;
