const CACHE = 'buscuz-shell-v6';
const ESPERA_REDE_MS = 4000;

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
    './manifest.json?v=6',
    './imagens/icone.png',
    './imagens/icone.png?v=6',
    './imagens/logo.jpg',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await Promise.all(APP_SHELL.map(async (url) => {
            try {
                const response = await fetch(url, { cache: 'reload' });
                if (response && (response.ok || response.type === 'opaque')) {
                    await cache.put(url, response);
                }
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

function respostaUtil(response) {
    return !!(response && (response.ok || response.type === 'opaque'));
}

async function guardar(cache, request, response) {
    if (!respostaUtil(response)) return;
    try {
        await cache.put(request, response.clone());
    } catch (error) {
        // Respostas redirecionadas não podem ir para o cache.
    }
}

async function responderDoCache(request, url) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);

    const rede = fetch(request).then(async (response) => {
        await guardar(cache, request, response);
        return response;
    }).catch(() => null);

    if (cached) {
        const fresca = await Promise.race([
            rede,
            new Promise((resolve) => setTimeout(() => resolve(null), ESPERA_REDE_MS))
        ]);
        if (respostaUtil(fresca)) return fresca;
        return cached;
    }

    const resposta = await rede;
    if (respostaUtil(resposta)) return resposta;

    if (request.mode === 'navigate') {
        const index = await cache.match('./index.html');
        if (index) return index;
    }

    return new Response('Sem conexão', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}
