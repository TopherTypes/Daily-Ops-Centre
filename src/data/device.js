const DEVICE_STORAGE_KEY = 'doc.deviceId';

/**
 * Returns a stable device identifier persisted in localStorage.
 * The identifier is intentionally simple for this first wireframe pass.
 */
export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated = `dev_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  localStorage.setItem(DEVICE_STORAGE_KEY, generated);
  return generated;
}
