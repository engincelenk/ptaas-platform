import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const DEV_MODE = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)']);

export default clerkMiddleware((auth, request) => {
  if (DEV_MODE) {
    if (request.nextUrl.pathname.startsWith('/sign-in')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (!isPublicRoute(request)) {
    auth.protect();
  }
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
};
