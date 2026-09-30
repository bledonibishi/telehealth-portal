export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('patient_token');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('patient_refresh_token');
}

export function setToken(token: string, refreshToken?: string | null) {
  localStorage.setItem('patient_token', token);
  if (refreshToken) localStorage.setItem('patient_refresh_token', refreshToken);
}

export function clearToken() {
  localStorage.removeItem('patient_token');
  localStorage.removeItem('patient_refresh_token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function parseJwt(token: string): Record<string, any> | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}
