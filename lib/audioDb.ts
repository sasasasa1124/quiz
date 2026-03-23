const DB_NAME = "tts-audio";
const STORE = "blobs";
const MAX_ENTRIES = 200;
const CACHE_KEY_PREFIX = "gemini-2.5-flash-preview-tts:Aoede";

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function makeCacheKey(text: string): Promise<string> {
  return `${CACHE_KEY_PREFIX}:${await sha256hex(text)}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("savedAt", "savedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAudioBlob(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function setAudioBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);

    // Check count and evict oldest if at limit
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result >= MAX_ENTRIES) {
        const index = store.index("savedAt");
        const cursorReq = index.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            cursor.delete();
          }
          store.put({ key, blob, savedAt: Date.now() });
        };
      } else {
        store.put({ key, blob, savedAt: Date.now() });
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
