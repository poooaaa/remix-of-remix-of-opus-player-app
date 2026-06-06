/**
 * Automated image preloading utility
 * Prevents flickering and ensures instant visual response for audio covers, artists, and icons.
 */

const preloadedUrls = new Set<string>();

/**
 * Preloads a single image URL in the background
 */
export const preloadImage = (url: string | null | undefined): Promise<void> => {
  if (!url || preloadedUrls.has(url)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = () => {
      preloadedUrls.add(url);
      resolve();
    };
    img.onerror = () => {
      // Resolve anyway to prevent blocking
      resolve();
    };
  });
};

/**
 * Preloads an array of image URLs in parallel and in batches
 */
export const preloadImages = (urls: (string | null | undefined)[]): void => {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean))) as string[];
  
  // Preload in tiny non-blocking idle chunks or immediately in background
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as any).requestIdleCallback(() => {
      uniqueUrls.forEach((url) => {
        preloadImage(url);
      });
    });
  } else {
    setTimeout(() => {
      uniqueUrls.forEach((url) => {
        preloadImage(url);
      });
    }, 50);
  }
};
