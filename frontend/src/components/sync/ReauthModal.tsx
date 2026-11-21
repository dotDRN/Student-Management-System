import React, { useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { useSyncStore } from "../../store/useSyncStore";
import { login } from "../../services/auth.service";
import { socketService } from "../../services/socket.service";
import { syncEngine } from "../../offline/syncEngine";

export const ReauthModal: React.FC = () => {
  const { needsReauth, currentUser, currentTenant, setAuth, setNeedsReauth } =
    useAuthStore();
  const { pendingCount, conflictCount } = useSyncStore();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsReauth || !currentUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await login(currentUser.email, password, {
        tenantId: currentTenant?.id || currentUser.tenantId,
      });
      const token = res.accessToken || res.token;
      if (!token || !res.user) {
        throw new Error("Unable to restore session. Please try again.");
      }
      setAuth(res.user, token, res.organization ?? currentTenant);
      socketService.updateToken(token);
      setPassword("");
      setNeedsReauth(false);
      void syncEngine.syncNow();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const totalUnsynced = pendingCount + conflictCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 w-full max-w-md overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-neutral-900">
                Session Expired — Resume Sync
              </h3>
              <p className="text-xs text-neutral-500">{currentUser.email}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2 mb-4">
            <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              Your offline work ({totalUnsynced}{" "}
              {totalUnsynced === 1 ? "item" : "items"}) is safely preserved on
              this device. Re-enter your password to upload everything to the cloud.
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 font-medium">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNeedsReauth(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Continue Offline
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "Signing in..." : "Sign In & Sync"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
