(function () {
    var CHAVE = 'buscuz_theme';

    function preferido() {
        var salvo = localStorage.getItem(CHAVE) || 'sistema';
        if (salvo !== 'sistema' && salvo !== 'claro' && salvo !== 'escuro') return 'sistema';
        return salvo;
    }

    function escuroAtivo(salvo) {
        if (salvo === 'escuro') return true;
        if (salvo === 'claro') return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function aplicar(salvo) {
        var escuro = escuroAtivo(salvo);
        document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', escuro ? '#071018' : '#1C9FFF');
    }

    aplicar(preferido());

    window.BuscuzTema = {
        ler: preferido,
        definir: function (valor) {
            var tema = valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
            localStorage.setItem(CHAVE, tema);
            aplicar(tema);
        }
    };

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (preferido() === 'sistema') aplicar('sistema');
    });
})();
