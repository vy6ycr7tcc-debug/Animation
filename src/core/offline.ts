declare const __BUILD__: string;
export const OFFLINE_CACHE_NAME = `inward-journey-assets-${__BUILD__.replace(/\s+/g, '-').replace(/:/g, '-')}`;

export interface DownloadProgress {
  total: number;
  downloaded: number;
  percentage: number;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist();
    return isPersisted;
  }
  return false;
}

export async function getMissingAssets(assets: string[]): Promise<string[]> {
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const missing: string[] = [];
    for (const asset of assets) {
      const match = await cache.match(asset, { ignoreSearch: true });
      if (!match) {
        missing.push(asset);
      }
    }
    return missing;
  } catch (err) {
    console.error("Error checking cache:", err);
    return assets;
  }
}

export async function checkAssetUpdates(): Promise<void> {
  // Check if we have an older cache and prompt the user to update it
  const cacheKeys = await caches.keys();
  const hasOldCache = cacheKeys.some(key => key.startsWith('inward-journey-assets-') && key !== OFFLINE_CACHE_NAME);

  // Also check if the current cache exists but is incomplete?
  // We can just rely on the user clicking download again for incompleteness,
  // but for version updates, we should prompt.
  if (hasOldCache) {
    if (confirm("A newer version of the game assets is available. Would you like to update your offline download?")) {
      // Trigger the download logic.
      // We can just open the menu or click the button programmatically.
      const btn = document.querySelector("#offline-btn") as HTMLButtonElement;
      if (btn) {
        document.querySelector("#menu")?.removeAttribute("hidden");
        btn.click();
      }
    }
  }
}

export async function downloadAssets(assets: string[], onProgress: (progress: DownloadProgress) => void): Promise<void> {
  const cache = await caches.open(OFFLINE_CACHE_NAME);

  // Clean up old caches with different version prefix if necessary
  const cacheKeys = await caches.keys();
  for (const key of cacheKeys) {
    if (key.startsWith('inward-journey-assets-') && key !== OFFLINE_CACHE_NAME) {
      await caches.delete(key);
    }
  }

  const missing = await getMissingAssets(assets);
  const total = assets.length;
  let downloaded = total - missing.length;

  if (missing.length === 0) {
    onProgress({ total, downloaded, percentage: 100 });
    return;
  }

  onProgress({ total, downloaded, percentage: Math.floor((downloaded / total) * 100) });

  // Download sequentially or with a small concurrency to avoid overwhelming the browser/network
  const concurrency = 4;
  let active = 0;
  let index = 0;

  return new Promise((resolve, reject) => {
    let hasError = false;

    const next = async () => {
      if (hasError) return;
      if (index >= missing.length && active === 0) {
        resolve();
        return;
      }
      if (index >= missing.length) return;

      const assetPath = missing[index++];
      active++;

      try {
        const response = await fetch(`./${assetPath}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${assetPath}: ${response.statusText}`);
        }
        await cache.put(`./${assetPath}`, response);
        downloaded++;
        onProgress({ total, downloaded, percentage: Math.floor((downloaded / total) * 100) });
      } catch (err) {
        console.error(err);
        hasError = true;
        reject(err);
      } finally {
        active--;
        next();
      }
    };

    for (let i = 0; i < concurrency; i++) {
      next();
    }
  });
}
