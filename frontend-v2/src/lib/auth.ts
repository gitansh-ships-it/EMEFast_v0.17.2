export interface AuthSession {
  email: string;
  role: 'USER' | 'HOSPITAL' | 'ADMIN';
  hospital_id: number | null;
  exp?: number;
}

/**
 * Decodes a base64url-encoded JWT payload without external dependencies.
 * Returns null if the token is malformed or expired.
 */
export function decodeJwt(token: string): AuthSession | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const parsed = JSON.parse(jsonPayload);
    if (!parsed || typeof parsed !== 'object') return null;

    // Check expiration timestamp (exp is in seconds)
    if (typeof parsed.exp === 'number' && parsed.exp * 1000 < Date.now()) {
      return null;
    }

    const role = (parsed.role || '').toUpperCase();
    if (role !== 'USER' && role !== 'HOSPITAL' && role !== 'ADMIN') {
      return null;
    }

    return {
      email: parsed.sub || '',
      role: role as 'USER' | 'HOSPITAL' | 'ADMIN',
      hospital_id: parsed.hospital_id !== undefined && parsed.hospital_id !== null ? Number(parsed.hospital_id) : null,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Retrieves the current authenticated session from localStorage.
 * Automatically clears stale/corrupt credentials if decoding fails.
 */
export function getAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('emefast_token');
  if (!token) return null;

  const session = decodeJwt(token);
  if (!session) {
    // Clear expired or invalid token
    localStorage.removeItem('emefast_token');
    localStorage.removeItem('emefast_role');
    localStorage.removeItem('emefast_hospital_id');
    localStorage.removeItem('emefast_user_name');
    return null;
  }

  return session;
}

/**
 * Purges session tokens and navigates to the login route.
 */
export function logout(redirectUrl: string = '/login') {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('emefast_token');
    localStorage.removeItem('emefast_role');
    localStorage.removeItem('emefast_hospital_id');
    localStorage.removeItem('emefast_user_name');
    window.location.href = redirectUrl;
  }
}
