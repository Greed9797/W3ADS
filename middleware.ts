import { NextResponse, type NextRequest } from "next/server";

import { isAuthDisabled } from "@/lib/auth/mode";

const protectedRoutes = ["/dashboard", "/dashboards", "/connectors", "/workspace", "/profile"];

export function middleware(request: NextRequest) {
  if (isAuthDisabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token");

  if (hasSession) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
