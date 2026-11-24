import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { socketService } from "./socket.service";
import { isLikelyNetworkError } from "../utils/offlineAttendanceQueue";
import { getPendingLocalSyncCounts } from "../offline/offlineDb";
import { API_BASE_URL } from "../utils/apiBase";

const api = axios.create({
  baseURL: API_BASE_URL,
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
        const res = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
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
        // Never wipe local session/outbox when refresh failed simply because the device is offline
        if (isLikelyNetworkError(refreshError)) {
          useAuthStore.getState().setOfflineSession(true);
          return Promise.reject(refreshError);
        }

        // If user has unsynced offline changes, pause and prompt inline re-authentication instead of hard-logout
        const authState = useAuthStore.getState();
        if (authState.currentUser) {
          const tenantId = authState.currentTenant?.id || authState.currentUser.tenantId;
          const counts = await getPendingLocalSyncCounts(tenantId, authState.currentUser.id);
          if (counts.pending > 0 || counts.conflicts > 0) {
            authState.setNeedsReauth(true);
            return Promise.reject(refreshError);
          }
        }

        // Refresh failed and no unsynced local work → logout
        await authState.logout();
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
