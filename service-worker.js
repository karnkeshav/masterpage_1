const CACHE_NAME = 'r4e-cache-v1';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Intercept html, css, js, images for full PWA offline support
    if (url.pathname.match(/\.(html|css|js|png|jpg|jpeg|gif|svg|woff2?|ttf|eot)$/i) || url.pathname.includes('/app/') || url.pathname.includes('/css/') || url.pathname.includes('/js/') || url.pathname.includes('/images/')) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                // Fetch the new version in the background (stale-while-revalidate)
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(err => {
                    console.warn('Network fetch failed, serving from cache if available:', err);
                });

                // Return the cached response immediately, or wait for the network response if not cached
                return cachedResponse || fetchPromise;
            })
        );
    }
});
