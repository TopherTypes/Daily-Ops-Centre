/**
 * Minimal IndexedDB wrapper used as a persistence seam.
 * For wireframe mode this validates IndexedDB availability and retries transient transaction failures.
 */
export class DbClient {
  constructor(dbName = 'daily-ops-centre') {
    this.dbName = dbName;
    this.db = null;
    this.defaultRetryDelayMs = 120;
    this.maxAttempts = 3;
  }

  /**
   * Returns true when an IndexedDB error is transient and may succeed on retry.
   */
  isTransientTransactionError(error) {
    const transientNames = new Set(['AbortError', 'InvalidStateError', 'TransactionInactiveError', 'QuotaExceededError', 'UnknownError']);
    const errorName = error?.name || '';
    return transientNames.has(errorName);
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async withRetry(operationName, runner, options = {}) {
    const maxAttempts = options.maxAttempts || this.maxAttempts;
    const retryDelayMs = options.retryDelayMs || this.defaultRetryDelayMs;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await runner();
      } catch (error) {
        lastError = error;
        const shouldRetry = attempt < maxAttempts && this.isTransientTransactionError(error);
        if (!shouldRetry) {
          throw error;
        }

        console.warn(`[DbClient:${operationName}] transient IndexedDB failure on attempt ${attempt}/${maxAttempts}; retrying.`, {
          errorName: error?.name || 'unknown',
          errorMessage: error?.message || 'unknown'
        });
        await this.delay(retryDelayMs * attempt);
      }
    }

    throw lastError;
  }

  async init() {
    if (!('indexedDB' in window)) {
      return false;
    }

    await this.withRetry('init', async () => new Promise((resolve, reject) => {
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
    }), { maxAttempts: 2 });

    return true;
  }

  async put(record) {
    if (!this.db) return false;

    return this.withRetry('put', async () => new Promise((resolve, reject) => {
      const tx = this.db.transaction('wireframe', 'readwrite');
      tx.objectStore('wireframe').put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted.', 'AbortError'));
    }));
  }

  async get(id) {
    if (!this.db) return null;

    return this.withRetry('get', async () => new Promise((resolve, reject) => {
      const tx = this.db.transaction('wireframe', 'readonly');
      const request = tx.objectStore('wireframe').get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted.', 'AbortError'));
    }));
  }
}
