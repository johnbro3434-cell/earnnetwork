export function getToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem('token', token);
  } catch {
    // ignore local storage disabled
  }
}

export function removeToken(): void {
  try {
    localStorage.removeItem('token');
  } catch {
    // ignore
  }
}

export function getDeviceFingerprint(): string {
  try {
    const cached = localStorage.getItem('device_fingerprint');
    if (cached) return cached;

    const nav = window.navigator;
    const screen = window.screen;
    const raw = `${nav.userAgent}|${nav.language}|${screen.width}x${screen.height}|${screen.colorDepth}|${new Date().getTimezoneOffset()}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const chr = raw.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    const fp = `fp_${Math.abs(hash).toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    localStorage.setItem('device_fingerprint', fp);
    return fp;
  } catch {
    return `fp_fallback_${Date.now()}`;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Set default JSON Content-Type only if body is string or plain object (not FormData)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data && typeof data === 'object' && data.error
      ? data.error
      : data && typeof data === 'object' && data.message
      ? data.message
      : typeof data === 'string' && data
      ? data
      : `Request failed with status ${response.status}`;
    
    const error = new Error(errorMsg) as any;
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}
