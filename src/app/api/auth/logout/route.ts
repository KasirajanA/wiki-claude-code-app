import { prisma } from "@/lib/prisma";
import { json, handleError } from "@/lib/response";
import { requireSession } from "@/lib/auth";

const CLEAR_COOKIE =
  "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSession(request);

    // Extract the token to delete the specific session row
    const auth = request.headers.get("Authorization");
    let token: string | null = null;

    if (auth?.startsWith("Bearer ")) {
      token = auth.slice(7).trim();
    } else {
      const cookieHeader = request.headers.get("cookie") ?? "";
      const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
      token = match ? decodeURIComponent(match[1]) : null;
    }

    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }

    return json(
      { message: "Logged out" },
      {
        status: 200,
        headers: { "Set-Cookie": CLEAR_COOKIE },
      },
    );
  } catch (error) {
    return handleError(error);
  }
}
