import { AsyncLocalStorage } from "node:async_hooks";

export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export interface TenantStore {
  tenantId: string;
  userId?: string;
  role?: string;
  bypassTenantScope?: boolean;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * Executes `callback` within a tenant-scoped AsyncLocalStorage context.
 * All Prisma queries executed inside this context are automatically scoped to `store.tenantId`.
 */
export function runWithTenantContext<T>(store: TenantStore, callback: () => T): T {
  return tenantStorage.run(store, callback);
}

/**
 * Executes `callback` with tenant auto-scoping temporarily bypassed
 * (e.g., for cross-tenant slug availability checks or multi-tenant login discovery).
 */
export function runWithoutTenantScope<T>(callback: () => T): T {
  const current = tenantStorage.getStore();
  return tenantStorage.run(
    {
      tenantId: current?.tenantId || DEFAULT_TENANT_ID,
      userId: current?.userId,
      role: current?.role,
      bypassTenantScope: true,
    },
    callback,
  );
}

export function getTenantContext(): TenantStore | undefined {
  return tenantStorage.getStore();
}

export function getCurrentTenantId(): string | undefined {
  const store = tenantStorage.getStore();
  if (!store || store.bypassTenantScope) {
    return undefined;
  }
  return store.tenantId;
}
