import { NextRequest, NextResponse } from "next/server";

// The separate showcase deployment may be shared for visual review before an
// approved hosted database exists. In that mode, only the browser-local
// showcase and its assets are reachable; application API routes fail closed.
export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SHOWCASE_REVIEW_MODE !== "true") return NextResponse.next();

  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    return new NextResponse("The connected forum is unavailable in this review preview.", { status: 503 });
  }
  if (path === "/showcase" || path.startsWith("/_next/") || /\.[^/]+$/.test(path)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/showcase", request.url));
}

export const config = { matcher: ["/:path*"] };
