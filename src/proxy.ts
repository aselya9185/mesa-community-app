import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the session cookie on every request and keeps visitors out of member pages.
// This is a convenience: the real protection is row level security in the database.
const PUBLIC = ['/apply', '/login', '/j/', '/api/push', '/robots.txt', '/manifest.webmanifest', '/sw.js', '/icon', '/apple-icon', '/pwa-icon', '/offline'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/'));

  if (!data.user && !isPublic && path !== '/') {
    const next = path + request.nextUrl.search;
    return redirectWithCookies(request, response, `/login?next=${encodeURIComponent(next)}`);
  }
  if (data.user && (path === '/' || path === '/login' || path === '/apply')) {
    return redirectWithCookies(request, response, '/plans');
  }
  if (!data.user && path === '/') return redirectWithCookies(request, response, '/apply');
  return response;
}

function redirectWithCookies(request: NextRequest, from: NextResponse, to: string) {
  const res = NextResponse.redirect(new URL(to, request.url));
  for (const c of from.cookies.getAll()) res.cookies.set(c);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
