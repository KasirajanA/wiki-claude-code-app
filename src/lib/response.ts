import { AppError } from "@/lib/errors";
import type { ZodError } from "zod";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function json(body: JsonValue, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export function handleError(error: unknown): Response {
  if (error instanceof AppError) {
    return json({ error: error.message }, { status: error.statusCode });
  }
  // Prisma unique constraint violation
  if (
    error instanceof Object &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  ) {
    return json({ error: "A record with that value already exists" }, { status: 409 });
  }
  console.error("[API Error]", error);
  return json({ error: "Internal server error" }, { status: 500 });
}

export function validationError(zodError: ZodError): Response {
  const issues = zodError.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  return json({ error: "Validation failed", issues }, { status: 400 });
}
