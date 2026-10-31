export interface AuthSession {
  email: string;
  role: 'USER' | 'HOSPITAL' | 'ADMIN';
  hospital_id: number | null;
  exp?: number;
}

/**
 * Decodes a base64url-encoded JWT payload.
 * Returns null if the token is malformed or expired.
 */
export function decodeJwt(token: string): AuthSession | null {
  try {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    while (base64.length % 4) {
      base64 += '=';
    }

    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(
          (c) =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        )
        .join('')
    );

    const parsed = JSON.parse(jsonPayload);

    if (!parsed || typeof parsed !== 'object') return null;

    // Check token expiration
    if (
      typeof parsed.exp === 'number' &&
      parsed.exp * 1000 < Date.now()
    ) {
      return null;
    }

    const role = String(parsed.role || '').toUpperCase();

    if (!['USER', 'HOSPITAL', 'ADMIN'].includes(role)) {
      return null;
    }

    return {
      email: parsed.sub || '',
      role: role as AuthSession['role'],
      hospital_id:
        parsed.hospital_id !== undefined &&
        parsed.hospital_id !== null
          ? Number(parsed.hospital_id)
          : null,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Retrieves the current authenticated session.
 * Supports the demo token returned by mock-server.mjs.
 */
export function getAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('emefast_token');

  if (!token) return null;

  // Demo backend returns "demo-token", which is not a JWT.
  if (token === 'demo-token') {
    const role = (
      localStorage.getItem('emefast_role') || ''
    ).toUpperCase();

    if (!['USER', 'HOSPITAL', 'ADMIN'].includes(role)) {
      clearAuthSession();
      return null;
    }

    const rawHospitalId = localStorage.getItem(
      'emefast_hospital_id'
    );

    return {
      email: '',
      role: role as AuthSession['role'],
      hospital_id:
        rawHospitalId && !Number.isNaN(Number(rawHospitalId))
          ? Number(rawHospitalId)
          : null,
    };
  }

  // Normal JWT authentication
  const session = decodeJwt(token);

  if (!session) {
    clearAuthSession();
    return null;
  }

  return session;
}

/**
 * Clears all stored authentication data.
 */
export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('emefast_token');
  localStorage.removeItem('emefast_role');
  localStorage.removeItem('emefast_hospital_id');
  localStorage.removeItem('emefast_user_name');
}

/**
 * Logs out and redirects to the login route.
 */
export function logout(redirectUrl: string = '/login'): void {
  if (typeof window !== 'undefined') {
    clearAuthSession();
    window.location.href = redirectUrl;
  }
}