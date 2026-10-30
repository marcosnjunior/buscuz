const CACHE = 'buscuz-shell-v2';

const APP_SHELL = [
    './',
    './index.html',
    './roteiro.html',
    './login.html',
    './signup.html',
    './forgot-password.html',
    './reset-password.html',
    './style.css',
    './tema.js',
    './app.js',
    './auth.js',
    './pwa.js',
    './manifest.json',
    './imagens/icone.png',
    './imagens/logo.jpg',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await Promise.all(APP_SHELL.map(async (url) => {
            try {
                await cache.add(url);
            } catch (error) {
                console.warn('Cache ignorou', url, error);
            }
        }));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch (error) {
        return;
    }

    if (url.hostname.endsWith('supabase.co')) return;

    const cacheavel = url.origin === self.location.origin
        || url.hostname === 'cdn.jsdelivr.net'
        || url.hostname === 'cdnjs.cloudflare.com';
    if (!cacheavel) return;

    event.respondWith(responderDoCache(request, url));
});

async function responderDoCache(request, url) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const atualizacao = fetch(request).then(async (response) => {
        if (response && response.ok) {
            await cache.put(request, response.clone());
        }
        return response;
    }).catch(() => null);

    if (cached) {
        atualizacao.catch(() => {});
        return cached;
    }

    const response = await atualizacao;
    if (response) return response;

    if (request.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) {
        const index = await cache.match('./index.html');
        if (index) return index;
    }

    return new Response('Sem conexão', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}
