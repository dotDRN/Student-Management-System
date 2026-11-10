import { z } from "zod";

export function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const registerInstanceSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be at most 100 characters"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Workspace URL slug must contain only lowercase letters, numbers, and hyphens",
    )
    .min(2, "Workspace URL slug must be at least 2 characters")
    .max(60, "Workspace URL slug must be at most 60 characters")
    .optional(),
  adminName: z
    .string()
    .trim()
    .min(2, "Admin full name must be at least 2 characters")
    .max(100, "Admin full name must be at most 100 characters"),
  email: z.string().trim().toLowerCase().email("Valid email address is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  phone: z.string().trim().optional(),
  defaultCenterName: z.string().trim().optional(),
  defaultCenterLocation: z.string().trim().optional(),
});

export const loginSchema = z
  .object({
    email: z.string().trim().min(1, "Email is required"),
    password: z.string().min(1, "Password is required"),
    slug: z.string().trim().toLowerCase().optional(),
    tenantId: z.string().uuid().optional(),
  })
  .refine((data) => !!data.slug || !!data.tenantId, {
    message: "Workspace slug is required (e.g. 'default' or your instance slug)",
    path: ["slug"],
  });

export type RegisterInstanceInput = z.infer<typeof registerInstanceSchema>;
export type LoginSchemaInput = z.infer<typeof loginSchema>;
