const CACHE_NAME = 'r4e-cache-v2';
const STATIC_ASSET_PATTERN = /\.(html|css|js|png|jpg|jpeg|gif|svg|woff2?|ttf|eot)$/i;

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames
                .filter(cacheName => cacheName.startsWith('r4e-cache-') && cacheName !== CACHE_NAME)
                .map(cacheName => caches.delete(cacheName))
        )).then(() => clients.claim())
    );
});

function shouldHandle(requestUrl) {
    return STATIC_ASSET_PATTERN.test(requestUrl.pathname) ||
        requestUrl.pathname.includes('/app/') ||
        requestUrl.pathname.includes('/css/') ||
        requestUrl.pathname.includes('/js/') ||
        requestUrl.pathname.includes('/images/');
}

function isCodeAsset(requestUrl) {
    return requestUrl.pathname.endsWith('.js') || requestUrl.pathname.endsWith('.html');
}

async function cacheResponse(request, networkResponse) {
    if (networkResponse && networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, responseToCache);
    }
    return networkResponse;
}

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Intercept html, css, js, images for full PWA offline support.
    if (!shouldHandle(url)) return;

    event.respondWith((async () => {
        const cachedResponse = await caches.match(event.request);

        // Code assets must be network-first. Serving a stale cached module can
        // keep an old truncated build alive and surface misleading syntax
        // errors after a deploy. Fall back to cache only when offline.
        if (isCodeAsset(url)) {
            try {
                return await cacheResponse(event.request, await fetch(event.request));
            } catch (err) {
                console.warn('Network fetch failed, serving code asset from cache if available:', err);
                if (cachedResponse) return cachedResponse;
                throw err;
            }
        }

        // Non-code assets stay stale-while-revalidate for faster repeat loads.
        const fetchPromise = fetch(event.request).then(networkResponse => cacheResponse(event.request, networkResponse)).catch(err => {
            console.warn('Network fetch failed, serving from cache if available:', err);
        });

        return cachedResponse || fetchPromise;
    })());
});
