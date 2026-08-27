import { useState, useEffect, useCallback } from 'react';

// Thin wrapper over the browser Geolocation + Permissions APIs. Tracks whether the
// user has granted / been prompted / denied location, and exposes request() that
// resolves with rounded { latitude, longitude } (4 dp ≈ 11 m — plenty for weather)
// or rejects. Components use `permission` to decide what to show when it's blocked.
//
//   permission: 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported'
//   status:     'idle' | 'locating' | 'done' | 'error'
export function useGeolocation() {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [permission, setPermission] = useState(supported ? 'unknown' : 'unsupported');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  // Reflect the live Permissions state when the browser exposes it (Chrome/Edge/FF).
  // Safari lacks Permissions for geolocation → we stay 'unknown' and let request() drive it.
  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return;
    let active = true;
    let handle;
    navigator.permissions.query({ name: 'geolocation' })
      .then((res) => {
        if (!active) return;
        handle = res;
        setPermission(res.state);
        res.onchange = () => setPermission(res.state);
      })
      .catch(() => {});
    return () => { active = false; if (handle) handle.onchange = null; };
  }, [supported]);

  const request = useCallback(() => new Promise((resolve, reject) => {
    if (!supported) { setPermission('unsupported'); reject(new Error('unsupported')); return; }
    setStatus('locating');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus('done');
        setPermission('granted');
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
        });
      },
      (err) => {
        setStatus('error');
        if (err && err.code === 1) setPermission('denied'); // PERMISSION_DENIED
        setError(err?.message || 'Could not get your location');
        reject(err);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
    );
  }), [supported]);

  return { supported, permission, status, error, request };
}
