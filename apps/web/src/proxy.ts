import { NextResponse, type NextRequest } from "next/server";

/**
 * Send visitors with no session cookie to the sign-in page before the app renders, so there is no flash of an empty
 * workspace. This is only an optimistic check of the cookie's presence. The API still checks every request, and an
 * expired session is handled when a request comes back 401.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.endsWith("better-auth.session_token"));
  if (hasSession) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
