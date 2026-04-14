import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { json, handleError, validationError } from "@/lib/response";
import { UnauthorizedError } from "@/lib/errors";
import { LoginSchema } from "@/types/schemas";
import { sessionExpiresAt } from "@/lib/auth";

const COOKIE_OPTIONS =
  "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800";

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const result = LoginSchema.safeParse(body);
    if (!result.success) return validationError(result.error);

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        passwordHash: true,
      },
    });

    if (!user) throw new UnauthorizedError("Invalid email or password");

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedError("Invalid email or password");

    // Lazy cleanup: delete expired sessions for this user
    await prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt: sessionExpiresAt() },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _omit, ...safeUser } = user;

    return json(
      { token: session.token, user: safeUser },
      {
        status: 200,
        headers: {
          "Set-Cookie": `session=${session.token}; ${COOKIE_OPTIONS}`,
        },
      },
    );
  } catch (error) {
    return handleError(error);
  }
}
