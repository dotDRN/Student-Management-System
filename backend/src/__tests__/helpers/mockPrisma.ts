import type { TestContext } from "node:test";
import prisma from "../../lib/prisma.js";

export function mockPrismaModel(
  t: TestContext,
  prop: string,
  methods: Record<string, unknown>,
): void {
  const originalDesc = Object.getOwnPropertyDescriptor(prisma, prop);
  const existingValue = (prisma as unknown as Record<string, unknown>)[prop];

  const stubValue =
    typeof methods === "function"
      ? methods
      : new Proxy(
          typeof existingValue === "object" && existingValue !== null
            ? (existingValue as Record<string, unknown>)
            : {},
          {
            get(target, key) {
              if (typeof key === "string" && key in methods) {
                return methods[key];
              }
              return Reflect.get(target, key);
            },
          },
        );

  Object.defineProperty(prisma, prop, {
    value: stubValue,
    writable: true,
    configurable: true,
  });

  t.after(() => {
    if (originalDesc) {
      Object.defineProperty(prisma, prop, originalDesc);
    } else {
      delete (prisma as unknown as Record<string, unknown>)[prop];
    }
  });
}

export function mockPrismaTransaction(
  t: TestContext,
  txClientFactory: () => Record<string, unknown> = () => ({}),
): void {
  const originalDesc = Object.getOwnPropertyDescriptor(prisma, "$transaction");
  Object.defineProperty(prisma, "$transaction", {
    value: async (arg: ((tx: Record<string, unknown>) => Promise<unknown>) | Promise<unknown>[]) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(txClientFactory()),
    writable: true,
    configurable: true,
  });
  t.after(() => {
    if (originalDesc) {
      Object.defineProperty(prisma, "$transaction", originalDesc);
    } else {
      delete (prisma as unknown as Record<string, unknown>)["$transaction"];
    }
  });
}
