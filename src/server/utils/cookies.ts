// The value of the request's cookie with this name, or null.
export function getCookie(req: Request, name: string) {
  const cookies = req.headers.get('Cookie');

  if (!cookies) {
    return null;
  }

  for (const cookie of cookies.split(';')) {
    const [key, ...value] = cookie.trim().split('=');

    if (key === name) {
      return value.join('=') || null;
    }
  }

  return null;
}

// A Set-Cookie value for an HttpOnly cookie on the whole site (Secure in production). `extra` adds attributes,
// e.g. ' Max-Age=0' to delete it.
export function httpOnlyCookie(name: string, value: string, extra = '') {
  const secure = Bun.env.NODE_ENV === 'production' ? 'Secure; ' : '';

  return `${name}=${value}; HttpOnly; ${secure}SameSite=Lax; Path=/;${extra}`;
}
