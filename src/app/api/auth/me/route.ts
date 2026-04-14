import { json, handleError } from "@/lib/response";
import { requireSession } from "@/lib/auth";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireSession(request);
    return json({ id: user.id, email: user.email, username: user.username, role: user.role });
  } catch (error) {
    return handleError(error);
  }
}
