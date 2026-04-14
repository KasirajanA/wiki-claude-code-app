import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  username: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(50, "Username must be at most 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username may only contain letters, digits, _ and -"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be at most 100 characters"),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

// Normalise to lowercase before validating — spec says tags are "lowercase-normalized".
const TagNameSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.toLowerCase() : v),
  z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, "Tag must be lowercase alphanumeric, _ or -"),
);

export const CreateArticleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title is too long"),
  content: z.string().min(1, "Content is required"),
  tags: z.array(TagNameSchema).max(10, "At most 10 tags allowed").default([]),
  isPublished: z.boolean().default(true),
  changeNote: z.string().max(500).optional(),
});

export const UpdateArticleSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).optional(),
    tags: z.array(TagNameSchema).max(10).optional(),
    isPublished: z.boolean().optional(),
    changeNote: z.string().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const ArticleListQuerySchema = PaginationSchema.extend({
  tag: z.string().optional(),
  author: z.string().optional(),
});

export type CreateArticleInput = z.infer<typeof CreateArticleSchema>;
export type UpdateArticleInput = z.infer<typeof UpdateArticleSchema>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, "Query is required")
    .max(200, "Query must be 200 characters or fewer"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tag: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const UpdateUserRoleSchema = z.object({
  role: z.enum(["VIEWER", "EDITOR", "ADMIN"]),
});

export const TransferOwnershipSchema = z.object({
  editorId: z.string().min(1, "editorId is required"),
});

export const AdminUserListQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
});

export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;
export type TransferOwnershipInput = z.infer<typeof TransferOwnershipSchema>;
