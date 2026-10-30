(function () {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function (err) {
                console.warn('Service worker não registrado:', err);
            });
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
            + '<img src="imagens/icone.png" alt="">'
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
