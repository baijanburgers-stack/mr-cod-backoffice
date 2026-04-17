import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|icon).*)',
  ],
};

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  if (url.pathname === '/manifest.webmanifest' || url.pathname === '/manifest.json') {
    return NextResponse.rewrite(new URL('/api/manifest', req.url));
  }

  return NextResponse.next();
}