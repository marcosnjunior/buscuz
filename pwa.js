(function () {
    var jaControlava = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
    var registro = null;

    function recarregar() {
        if (!jaControlava) return;
        if (sessionStorage.getItem('buscuz_recarregou') === '1') return;
        sessionStorage.setItem('buscuz_recarregou', '1');
        window.location.reload();
    }

    if ('serviceWorker' in navigator) {
        sessionStorage.removeItem('buscuz_recarregou');
        navigator.serviceWorker.addEventListener('controllerchange', recarregar);
        navigator.serviceWorker.addEventListener('message', function (event) {
            if (event.data && event.data.type === 'BUSCUZ_RECARREGAR') recarregar();
        });

        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
                registro = reg;
                return reg.update();
            }).catch(function (err) {
                console.warn('Service worker não registrado:', err);
            });
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible' && registro) registro.update();
        });
    }

    var deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        deferredPrompt = event;
        if (sessionStorage.getItem('buscuz_install_oculto') === '1') return;
        mostrarBannerInstalar();
    });

    function mostrarBannerInstalar() {
        if (document.getElementById('installBanner')) return;

        var banner = document.createElement('div');
        banner.id = 'installBanner';
        banner.className = 'install-banner';
        banner.innerHTML = ''
            + '<img src="imagens/icone.png?v=6" alt="">'
            + '<span>Instalar o Buscuz neste aparelho</span>'
            + '<button type="button" id="btnInstalar">Instalar</button>'
            + '<button type="button" id="btnFecharInstall" aria-label="Fechar aviso de instalação">×</button>';
        document.body.appendChild(banner);

        document.getElementById('btnInstalar').addEventListener('click', function () {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.finally(function () {
                deferredPrompt = null;
                banner.remove();
            });
        });

        document.getElementById('btnFecharInstall').addEventListener('click', function () {
            sessionStorage.setItem('buscuz_install_oculto', '1');
            banner.remove();
        });
    }

    window.addEventListener('appinstalled', function () {
        var banner = document.getElementById('installBanner');
        if (banner) banner.remove();
        deferredPrompt = null;
    });
})();
