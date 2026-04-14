import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { json, handleError, validationError } from "@/lib/response";
import { ConflictError } from "@/lib/errors";
import { RegisterSchema } from "@/types/schemas";
import { sessionExpiresAt } from "@/lib/auth";

const COOKIE_OPTIONS =
  "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800";

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const result = RegisterSchema.safeParse(body);
    if (!result.success) return validationError(result.error);

    const { email, username, password } = result.data;

    // Check uniqueness before hashing (cheaper than bcrypt on conflict)
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });

    if (existing) {
      if (existing.email === email) {
        throw new ConflictError("Email is already registered");
      }
      throw new ConflictError("Username is already taken");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, username, passwordHash, role: "VIEWER" },
      select: { id: true, email: true, username: true, role: true },
    });

    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt: sessionExpiresAt() },
    });

    return json(
      { token: session.token, user },
      {
        status: 201,
        headers: {
          "Set-Cookie": `session=${session.token}; ${COOKIE_OPTIONS}`,
        },
      },
    );
  } catch (error) {
    return handleError(error);
  }
}
