const DB_NAME = "music-player-file-handles";
const DB_VERSION = 2;
const TRACK_STORE_NAME = "handles";
const FOLDER_STORE_NAME = "folders";
const IDB_OPEN_TIMEOUT_MS = 4000;

const hasIndexedDb = () => typeof window !== "undefined" && "indexedDB" in window;

export const supportsFileSystemAccess = () =>
  typeof window !== "undefined" &&
  ("showOpenFilePicker" in window || "showDirectoryPicker" in window) &&
  hasIndexedDb();

const openDatabase = () =>
  new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    let isSettled = false;
    const timeoutId = window.setTimeout(() => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      reject(
        new Error(
          "Local storage access timed out. Close duplicate tabs or reconnect the folder."
        )
      );
    }, IDB_OPEN_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TRACK_STORE_NAME)) {
        database.createObjectStore(TRACK_STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(FOLDER_STORE_NAME)) {
        database.createObjectStore(FOLDER_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      if (isSettled) {
        request.result.close();
        return;
      }
      isSettled = true;
      window.clearTimeout(timeoutId);
      resolve(request.result);
    };

    request.onerror = () => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      window.clearTimeout(timeoutId);
      reject(request.error || new Error("Failed to open local track database."));
    };

    request.onblocked = () => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      window.clearTimeout(timeoutId);
      reject(
        new Error(
          "Local storage is blocked by another tab. Close other tabs and try again."
        )
      );
    };
  });

const withStore = async (storeName, mode, callback) => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("IndexedDB transaction failed."));
    };

    callback(store, resolve, reject);
  });
};

export const saveTrackHandle = async (id, handle) => {
  await withStore(TRACK_STORE_NAME, "readwrite", (store) => {
    store.put({ id, handle });
  });
};

export const loadTrackHandle = async (id) => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRACK_STORE_NAME, "readonly");
    const store = transaction.objectStore(TRACK_STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      database.close();
      resolve(request.result?.handle || null);
    };

    request.onerror = () => {
      database.close();
      reject(request.error || new Error("Failed to load local track handle."));
    };
  });
};

export const removeTrackHandle = async (id) => {
  await withStore(TRACK_STORE_NAME, "readwrite", (store) => {
    store.delete(id);
  });
};

export const saveFolderHandle = async (id, handle) => {
  await withStore(FOLDER_STORE_NAME, "readwrite", (store) => {
    store.put({ id, handle });
  });
};

export const loadFolderHandle = async (id) => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FOLDER_STORE_NAME, "readonly");
    const store = transaction.objectStore(FOLDER_STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      database.close();
      resolve(request.result?.handle || null);
    };

    request.onerror = () => {
      database.close();
      reject(request.error || new Error("Failed to load local folder handle."));
    };
  });
};

export const removeFolderHandle = async (id) => {
  await withStore(FOLDER_STORE_NAME, "readwrite", (store) => {
    store.delete(id);
  });
};
