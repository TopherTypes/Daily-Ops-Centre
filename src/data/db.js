/**
 * Minimal IndexedDB wrapper used as a persistence seam.
 * For wireframe mode this only verifies IndexedDB availability.
 */
export class DbClient {
  constructor(dbName = 'daily-ops-centre') {
    this.dbName = dbName;
    this.db = null;
  }

  async init() {
    if (!('indexedDB' in window)) {
      return false;
    }

    await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('wireframe')) {
          db.createObjectStore('wireframe', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
    });

    return true;
  }

  async put(record) {
    if (!this.db) return false;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('wireframe', 'readwrite');
      tx.objectStore('wireframe').put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(id) {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('wireframe', 'readonly');
      const request = tx.objectStore('wireframe').get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }
}
