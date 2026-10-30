// ============================================================
// Buscuz - Sistema de Roteiros de Viagem
// Versão 2.1 - Cadastro de Viagens Funcional
// ============================================================

// ============================================================
// 1. CONFIGURAÇÕES
// ============================================================
const STORAGE_KEY = 'buscuz_data';
const CONFIG_KEY = 'buscuz_config';
const SYNC_PREF_KEY = 'buscuz_sync_pref';
const DELETES_KEY = 'buscuz_pending_deletes';
const DIRTY_KEY = 'buscuz_dirty';
const CONFIG_DIRTY_KEY = 'buscuz_config_dirty';
const LAST_SYNC_KEY = 'buscuz_last_sync';
const SYNC_INTERVAL_PADRAO = 300000;
const SYNC_INTERVALOS = [0, 60000, 300000, 900000, 1800000, 3600000];

// ============================================================
// 2. ESTADO GLOBAL
// ============================================================
let dados = {
    viagens: [],
    config: {
        consumoMedio: 10,
        precoCombustivel: 5.50
    }
};

let viagemAtual = null;
let trechoEmEdicao = null;
let pontoEmEdicao = null;
let despesaEmEdicao = null;
let filtroAtual = 'todas';
let viagemEmEdicao = null;
let userAtual = null; // Usuário logado
let syncEmAndamento = false;
let syncVersao = 0;
let syncTimer = null;
let syncFalhou = false;

// ============================================================
// 3. FUNÇÕES DE PERSISTÊNCIA
// ============================================================

function carregarDados() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            dados.viagens = parsed.viagens || [];
        }
        const configStored = localStorage.getItem(CONFIG_KEY);
        if (configStored) {
            dados.config = JSON.parse(configStored);
        }
    } catch (e) {
        console.warn('Erro ao carregar dados:', e);
    }
    if (!dados.viagens) dados.viagens = [];
    if (!dados.config) dados.config = { consumoMedio: 10, precoCombustivel: 5.50 };
}

function salvarDados() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ viagens: dados.viagens }));
        localStorage.setItem(CONFIG_KEY, JSON.stringify(dados.config));
    } catch (e) {
        console.warn('Erro ao salvar dados:', e);
    }
}

// ============================================================
// 4. VERIFICAR CONEXÃO
// ============================================================

function isOnline() {
    return navigator.onLine;
}

function lerIntervaloSync() {
    const raw = localStorage.getItem(SYNC_PREF_KEY);
    if (raw === null || raw === '') return SYNC_INTERVAL_PADRAO;
    const n = parseInt(raw, 10);
    return SYNC_INTERVALOS.includes(n) ? n : SYNC_INTERVAL_PADRAO;
}

function salvarIntervaloSync(ms) {
    const valor = SYNC_INTERVALOS.includes(ms) ? ms : SYNC_INTERVAL_PADRAO;
    localStorage.setItem(SYNC_PREF_KEY, String(valor));
}

function lerFilaExclusoes() {
    try {
        const lista = JSON.parse(localStorage.getItem(DELETES_KEY) || '[]');
        return Array.isArray(lista) ? lista : [];
    } catch (e) {
        return [];
    }
}

function temPendencia() {
    return localStorage.getItem(DIRTY_KEY) === '1'
        || localStorage.getItem(CONFIG_DIRTY_KEY) === '1'
        || lerFilaExclusoes().length > 0;
}

function marcarSujo() {
    syncVersao += 1;
    localStorage.setItem(DIRTY_KEY, '1');
    syncFalhou = false;
    atualizarChipSync();
}

function marcarConfigPendente() {
    localStorage.setItem(CONFIG_DIRTY_KEY, '1');
    syncFalhou = false;
    atualizarChipSync();
}

function enfileirarExclusao(tipo, id) {
    const fila = lerFilaExclusoes();
    if (!fila.some(item => item.tipo === tipo && String(item.id) === String(id))) {
        fila.push({ tipo, id });
        localStorage.setItem(DELETES_KEY, JSON.stringify(fila));
    }
    marcarSujo();
}

function formatarHoraSync(iso) {
    try {
        return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

function textoUltimaSync() {
    const last = localStorage.getItem(LAST_SYNC_KEY);
    if (!last) return 'Ainda não sincronizado neste aparelho.';
    return 'Última sincronização às ' + formatarHoraSync(last) + '.';
}

function atualizarChipSync(estado) {
    const el = document.getElementById('syncStatus');
    if (!el) return;

    el.classList.remove('offline', 'pending', 'syncing', 'ok', 'erro');

    if (!navigator.onLine || estado === 'offline') {
        el.textContent = 'Offline';
        el.classList.add('offline');
        return;
    }
    if (estado === 'sincronizando' || syncEmAndamento) {
        el.textContent = 'Sincronizando';
        el.classList.add('syncing');
        return;
    }
    if (syncFalhou || estado === 'erro') {
        el.textContent = 'Falha ao sincronizar';
        el.classList.add('erro');
        return;
    }
    if (temPendencia() || estado === 'pendente') {
        el.textContent = 'Pendente';
        el.classList.add('pending');
        return;
    }

    const last = localStorage.getItem(LAST_SYNC_KEY);
    el.textContent = last ? 'Sync ' + formatarHoraSync(last) : 'Sincronizado';
    el.classList.add('ok');
}

function showSyncStatus(message, isSuccess = true) {
    if (!isOnline()) atualizarChipSync('offline');
    else if (!isSuccess) {
        syncFalhou = true;
        atualizarChipSync('erro');
    } else {
        atualizarChipSync();
    }
    if (message) console.log(message);
}

// ============================================================
// 5. HELPERS
// ============================================================

function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarData(data) {
    if (!data) return '';
    const partes = data.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function calcularCombustivelEstimado(distancia, consumo) {
    if (!consumo || consumo <= 0 || !distancia) return 0;
    return distancia / consumo;
}

function calcularDias(dataInicio, dataFim) {
    if (!dataInicio || !dataFim) return 0;
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    const diff = fim - inicio;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

function getStatusViagem(dataInicio, dataFim) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    
    if (hoje < inicio) return 'planejado';
    if (hoje >= inicio && hoje <= fim) return 'em-andamento';
    return 'finalizado';
}

function getStatusTrecho(dataCheckin, dataCheckout) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicio = new Date(dataCheckin);
    const fim = new Date(dataCheckout);
    
    if (hoje < inicio) return 'planejado';
    if (hoje >= inicio && hoje <= fim) return 'em-andamento';
    return 'finalizado';
}

function calcularDespesasPorTipo(trecho, tipo) {
    if (!trecho.despesas) return 0;
    return trecho.despesas
        .filter(d => d.tipo === tipo)
        .reduce((acc, d) => acc + (d.valor || 0), 0);
}

function calcularCombustivelReal(trecho) {
    return calcularDespesasPorTipo(trecho, 'abastecimento');
}

function calcularCombustivelEstimadoValor(trecho) {
    const consumo = dados.config.consumoMedio || 10;
    const preco = dados.config.precoCombustivel || 0;
    const litros = calcularCombustivelEstimado(trecho.distancia, consumo);
    return litros * preco;
}

function calcularTotalGastos(trecho) {
    let total = 0;
    if (trecho.pontos) {
        trecho.pontos.forEach(p => total += (p.custo || 0));
    }
    if (trecho.despesas) {
        trecho.despesas.forEach(d => total += (d.valor || 0));
    }
    return total;
}

function calcularTotalViagem(viagem) {
    let total = 0;
    if (viagem.trechos) {
        viagem.trechos.forEach(t => {
            total += calcularTotalGastos(t);
        });
    }
    return total;
}

function distanciaViagem(viagem) {
    if (!viagem || !viagem.trechos) return 0;
    return viagem.trechos.reduce((acc, t) => acc + (Number(t.distancia) || 0), 0);
}

function totaisDaViagem(viagem) {
    const gastoReal = calcularTotalViagem(viagem);
    const combustivelReal = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + calcularCombustivelReal(t), 0) : 0;
    const combustivelEstimado = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + calcularCombustivelEstimadoValor(t), 0) : 0;
    const km = distanciaViagem(viagem);
    return {
        gastoReal,
        combustivelReal,
        combustivelEstimado,
        km,
        porKm: km > 0 ? gastoReal / km : 0
    };
}

function renderizarTotaisViagem(viagem) {
    const el = document.getElementById('totaisViagem');
    if (!el || !viagem) return;
    const totais = totaisDaViagem(viagem);
    el.innerHTML = `
        <div class="total-principal">
            <span class="total-label">Gasto</span>
            <strong>${formatarMoeda(totais.gastoReal)}</strong>
        </div>
        <span class="total-mini">${totais.km.toFixed(0)} km</span>
        <span class="total-mini">${totais.km > 0 ? formatarMoeda(totais.porKm) + '/km' : '—'}</span>
        <span class="total-mini">comb. ${formatarMoeda(totais.combustivelReal)}</span>
        <span class="total-mini">est. ${formatarMoeda(totais.combustivelEstimado)}</span>
    `;
}

// ============================================================
// 6. SINCRONIZAÇÃO DE CONFIGURAÇÕES
// ============================================================

async function syncConfigToSupabase() {
    if (!isOnline() || !userAtual || !window.BuscuzAuth || !window.BuscuzAuth.saveConfig) {
        return false;
    }

    try {
        const result = await window.BuscuzAuth.saveConfig(userAtual.id, dados.config);
        return !!(result && result.success);
    } catch (error) {
        console.error('Erro ao sincronizar configurações:', error);
        return false;
    }
}

async function syncConfigFromSupabase() {
    if (!userAtual || !isOnline() || !window.BuscuzAuth || !window.BuscuzAuth.loadConfig) return;
    if (localStorage.getItem(CONFIG_DIRTY_KEY) === '1') return;

    try {
        const result = await window.BuscuzAuth.loadConfig(userAtual.id);

        if (result && result.success && result.config) {
            dados.config.consumoMedio = result.config.consumoMedio;
            dados.config.precoCombustivel = result.config.precoCombustivel;
            salvarDados();

            const consumoInput = document.getElementById('consumoMedio');
            const precoInput = document.getElementById('precoCombustivel');
            if (consumoInput) consumoInput.value = dados.config.consumoMedio;
            if (precoInput) precoInput.value = dados.config.precoCombustivel;
        }
    } catch (error) {
        console.warn('Erro ao carregar configurações do Supabase:', error);
    }
}

async function carregarConfiguracoes() {
    await syncConfigFromSupabase();
}

async function processarFilaExclusoes() {
    if (!window.BuscuzAuth) return false;

    const ordem = { despesa: 0, ponto: 1, trecho: 2, viagem: 3 };
    const fila = lerFilaExclusoes().slice().sort((a, b) => (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9));
    const restantes = [];

    for (const item of fila) {
        let result = { success: false };
        try {
            if (item.tipo === 'viagem') result = await window.BuscuzAuth.deleteViagem(item.id);
            else if (item.tipo === 'trecho') result = await window.BuscuzAuth.deleteTrecho(item.id);
            else if (item.tipo === 'ponto') result = await window.BuscuzAuth.deletePonto(item.id);
            else if (item.tipo === 'despesa') result = await window.BuscuzAuth.deleteDespesa(item.id);
        } catch (error) {
            result = { success: false };
        }
        if (!result || !result.success) restantes.push(item);
    }

    localStorage.setItem(DELETES_KEY, JSON.stringify(restantes));
    return restantes.length === 0;
}

function agendarSync() {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
    const intervalo = lerIntervaloSync();
    if (!intervalo) return;

    syncTimer = setInterval(function() {
        if (userAtual && isOnline() && temPendencia() && !syncEmAndamento) {
            syncDataToSupabase();
        }
    }, intervalo);
}

async function sincronizarAgora() {
    if (!isOnline()) {
        atualizarChipSync('offline');
        return;
    }
    if (temPendencia()) await syncDataToSupabase();
    else await syncDataFromSupabase();
}

// ============================================================
// 7. SINCRONIZAÇÃO DE DADOS
// ============================================================

async function syncDataToSupabase() {
    if (syncEmAndamento) return { success: false, skipped: true };

    if (!isOnline()) {
        atualizarChipSync('offline');
        return { success: false, offline: true };
    }

    if (!userAtual || !window.BuscuzAuth || !window.BuscuzAuth.syncData) {
        atualizarChipSync('pendente');
        return { success: false };
    }

    const versaoInicial = syncVersao;
    syncEmAndamento = true;
    atualizarChipSync('sincronizando');
    let repetir = false;
    let resultado = { success: false };

    try {
        const configOk = await syncConfigToSupabase();
        if (configOk) localStorage.setItem(CONFIG_DIRTY_KEY, '0');
        else localStorage.setItem(CONFIG_DIRTY_KEY, '1');

        const deletesOk = await processarFilaExclusoes();
        const result = await window.BuscuzAuth.syncData(userAtual.id, dados.viagens);
        const dadosOk = !!(result && result.success) && deletesOk;

        if (dadosOk && syncVersao === versaoInicial) {
            localStorage.setItem(DIRTY_KEY, '0');
        }

        if (dadosOk && configOk) {
            localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
        }

        syncFalhou = !dadosOk || !configOk;
        if (dadosOk && syncVersao !== versaoInicial) repetir = true;

        resultado = { success: dadosOk && configOk, error: result && result.error };
    } catch (error) {
        console.error('Erro na sincronização:', error);
        syncFalhou = true;
        resultado = { success: false, error: error.message };
    } finally {
        syncEmAndamento = false;
        atualizarChipSync();
    }

    if (repetir) return syncDataToSupabase();
    return resultado;
}

function aplicarViagensRemotas(viagensDoSupabase) {
    dados.viagens = viagensDoSupabase;
    salvarDados();

    if (viagemAtual && !dados.viagens.some(v => v.id === viagemAtual.id) && document.getElementById('trechosContainer')) {
        localStorage.removeItem('viagemAtualId');
        window.location.href = 'index.html';
        return;
    }

    if (viagemAtual) {
        viagemAtual = dados.viagens.find(v => v.id === viagemAtual.id) || viagemAtual;
    }

    renderizarViagens();
    if (document.getElementById('trechosContainer')) renderizarTrechos();
}

async function syncDataFromSupabase() {
    if (!userAtual || !isOnline() || !window.BuscuzAuth || !window.BuscuzAuth.loadData) {
        atualizarChipSync();
        return;
    }

    if (temPendencia()) {
        await syncDataToSupabase();
        return;
    }

    const versaoAntes = syncVersao;

    try {
        await syncConfigFromSupabase();
        const result = await window.BuscuzAuth.loadData(userAtual.id);

        if (syncVersao !== versaoAntes || temPendencia()) {
            await syncDataToSupabase();
            return;
        }

        if (result && result.success && result.viagens) {
            const viagensDoSupabase = result.viagens.map(v => ({
                id: v.id,
                nome: v.nome,
                destino: v.destino || '',
                dataInicio: v.data_inicio,
                dataFim: v.data_fim,
                descricao: v.descricao || '',
                trechos: (v.trechos || []).map(t => ({
                    id: t.id,
                    cidadeAtual: t.cidade_atual,
                    dataCheckin: t.data_checkin,
                    dataCheckout: t.data_checkout,
                    proximaCidade: t.proxima_cidade,
                    distancia: t.distancia,
                    tempoEstimado: t.tempo_estimado,
                    odometro: t.odometro,
                    pontos: (t.pontos || []).map(p => ({
                        id: p.id,
                        nome: p.nome,
                        localizacao: p.localizacao || '',
                        data: p.data,
                        custo: p.custo || 0,
                        observacoes: p.observacoes || ''
                    })),
                    despesas: (t.despesas || []).map(d => ({
                        id: d.id,
                        descricao: d.descricao,
                        valor: d.valor || 0,
                        data: d.data,
                        tipo: d.tipo || 'outro'
                    }))
                }))
            }));

            if (viagensDoSupabase.length > 0) {
                aplicarViagensRemotas(viagensDoSupabase);
                localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
                syncFalhou = false;
            } else if (dados.viagens.length > 0) {
                marcarSujo();
                await syncDataToSupabase();
                return;
            } else {
                localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
                syncFalhou = false;
            }
        }

        atualizarChipSync();
    } catch (error) {
        console.warn('Erro ao carregar dados do Supabase:', error);
        atualizarChipSync();
    }
}

// ============================================================
// 8. CRUD VIAGENS
// ============================================================

function criarViagem(dadosViagem) {
    const nova = {
        id: gerarId(),
        nome: dadosViagem.nome.trim(),
        destino: dadosViagem.destino ? dadosViagem.destino.trim() : '',
        dataInicio: dadosViagem.dataInicio,
        dataFim: dadosViagem.dataFim,
        descricao: dadosViagem.descricao ? dadosViagem.descricao.trim() : '',
        trechos: []
    };
    
    dados.viagens.push(nova);
    salvarDados();
    marcarSujo();
    renderizarViagens();
    syncDataToSupabase();
    
    console.log('✅ Viagem criada localmente:', nova.nome);
    return nova;
}

function atualizarViagem(id, dadosAtualizados) {
    const index = dados.viagens.findIndex(v => v.id === id);
    if (index === -1) {
        console.error('Viagem não encontrada:', id);
        return;
    }

    const viagem = dados.viagens[index];
    viagem.nome = dadosAtualizados.nome.trim();
    viagem.destino = dadosAtualizados.destino ? dadosAtualizados.destino.trim() : '';
    viagem.dataInicio = dadosAtualizados.dataInicio;
    viagem.dataFim = dadosAtualizados.dataFim;
    viagem.descricao = dadosAtualizados.descricao ? dadosAtualizados.descricao.trim() : '';

    salvarDados();
    marcarSujo();
    renderizarViagens();
    syncDataToSupabase();
    
    console.log('✅ Viagem atualizada:', viagem.nome);
}

function excluirViagem(id) {
    if (!confirm('Tem certeza que deseja excluir esta viagem e todos os seus trechos?')) return;
    
    const viagem = dados.viagens.find(v => v.id === id);
    if (!viagem) {
        alert('Viagem não encontrada!');
        return;
    }
    
    dados.viagens = dados.viagens.filter(v => v.id !== id);
    salvarDados();
    enfileirarExclusao('viagem', id);
    renderizarViagens();
    syncDataToSupabase();
    
    console.log('🗑️ Viagem excluída localmente:', viagem.nome);
}

async function deletarViagemDoSupabase(viagemId) {
    if (!isOnline()) {
        console.warn('⚠️ Offline - A viagem será deletada quando online.');
        showSyncStatus('⚠️ Offline - A viagem será deletada quando online', false);
        return;
    }
    
    if (!userAtual) {
        console.warn('⚠️ Usuário não autenticado - Não é possível deletar');
        return;
    }
    
    try {
        console.log('🗑️ Deletando viagem do Supabase...');
        showSyncStatus('🗑️ Deletando viagem...', true);
        
        const result = await window.BuscuzAuth.deleteViagem(viagemId);
        
        if (result.success) {
            console.log('✅ Viagem deletada do Supabase!');
            showSyncStatus('✅ Viagem deletada com sucesso!', true);
        } else {
            console.error('❌ Erro ao deletar viagem:', result.error);
            showSyncStatus('❌ Erro ao deletar: ' + result.error, false);
        }
    } catch (error) {
        console.error('❌ Erro ao deletar viagem:', error);
        showSyncStatus('❌ Erro ao deletar viagem', false);
    }
}

// ============================================================
// 9. CRUD TRECHOS
// ============================================================

function criarTrecho(dadosTrecho) {
    if (!viagemAtual) {
        console.error('Nenhuma viagem selecionada');
        return;
    }

    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const novo = {
        id: gerarId(),
        cidadeAtual: dadosTrecho.cidadeAtual.trim(),
        dataCheckin: dadosTrecho.dataCheckin,
        dataCheckout: dadosTrecho.dataCheckout,
        proximaCidade: dadosTrecho.proximaCidade.trim(),
        distancia: parseFloat(dadosTrecho.distancia) || 0,
        tempoEstimado: parseFloat(dadosTrecho.tempoEstimado) || 0,
        odometro: dadosTrecho.odometro ? parseFloat(dadosTrecho.odometro) : null,
        pontos: [],
        despesas: []
    };
    
    viagem.trechos.push(novo);
    salvarDados();
    marcarSujo();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Trecho criado:', novo.cidadeAtual, '→', novo.proximaCidade);
    return novo;
}

function atualizarTrecho(id, dadosAtualizados) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const index = viagem.trechos.findIndex(t => t.id === id);
    if (index === -1) {
        console.error('Trecho não encontrado:', id);
        return;
    }

    const trecho = viagem.trechos[index];
    trecho.cidadeAtual = dadosAtualizados.cidadeAtual.trim();
    trecho.dataCheckin = dadosAtualizados.dataCheckin;
    trecho.dataCheckout = dadosAtualizados.dataCheckout;
    trecho.proximaCidade = dadosAtualizados.proximaCidade.trim();
    trecho.distancia = parseFloat(dadosAtualizados.distancia) || 0;
    trecho.tempoEstimado = parseFloat(dadosAtualizados.tempoEstimado) || 0;
    trecho.odometro = dadosAtualizados.odometro ? parseFloat(dadosAtualizados.odometro) : null;

    salvarDados();
    marcarSujo();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Trecho atualizado:', trecho.cidadeAtual, '→', trecho.proximaCidade);
}

function excluirTrecho(id) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }
    
    if (!confirm('Tem certeza que deseja excluir este trecho e todos os seus pontos e despesas?')) return;
    
    const trecho = viagem.trechos.find(t => t.id === id);
    viagem.trechos = viagem.trechos.filter(t => t.id !== id);
    salvarDados();
    enfileirarExclusao('trecho', id);
    fecharModal('detalhesModal');
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('🗑️ Trecho excluído:', trecho ? trecho.cidadeAtual : id);
}

async function deletarTrechoDoSupabase(trechoId) {
    if (!isOnline() || !userAtual) return;
    
    try {
        console.log('🗑️ Deletando trecho do Supabase...');
        const result = await window.BuscuzAuth.deleteTrecho(trechoId);
        if (result.success) {
            console.log('✅ Trecho deletado do Supabase!');
        } else {
            console.error('❌ Erro ao deletar trecho:', result.error);
        }
    } catch (error) {
        console.error('❌ Erro ao deletar trecho:', error);
    }
}

// ============================================================
// 10. CRUD PONTOS
// ============================================================

function criarPonto(trechoId, dadosPonto) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }

    const novo = {
        id: gerarId(),
        nome: dadosPonto.nome.trim(),
        localizacao: dadosPonto.localizacao ? dadosPonto.localizacao.trim() : '',
        data: dadosPonto.data || null,
        custo: parseFloat(dadosPonto.custo) || 0,
        observacoes: dadosPonto.observacoes ? dadosPonto.observacoes.trim() : ''
    };
    trecho.pontos.push(novo);
    salvarDados();
    marcarSujo();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Ponto criado:', novo.nome);
    return novo;
}

function atualizarPonto(trechoId, pontoId, dadosPonto) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }

    const ponto = trecho.pontos.find(p => p.id === pontoId);
    if (!ponto) {
        console.error('Ponto não encontrado:', pontoId);
        return;
    }

    ponto.nome = dadosPonto.nome.trim();
    ponto.localizacao = dadosPonto.localizacao ? dadosPonto.localizacao.trim() : '';
    ponto.data = dadosPonto.data || null;
    ponto.custo = parseFloat(dadosPonto.custo) || 0;
    ponto.observacoes = dadosPonto.observacoes ? dadosPonto.observacoes.trim() : '';

    salvarDados();
    marcarSujo();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Ponto atualizado:', ponto.nome);
}

function excluirPonto(trechoId, pontoId) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }
    
    if (!confirm('Tem certeza que deseja excluir este ponto?')) return;
    
    const ponto = trecho.pontos.find(p => p.id === pontoId);
    trecho.pontos = trecho.pontos.filter(p => p.id !== pontoId);
    salvarDados();
    enfileirarExclusao('ponto', pontoId);
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('🗑️ Ponto excluído:', ponto ? ponto.nome : pontoId);
}

async function deletarPontoDoSupabase(pontoId) {
    if (!isOnline() || !userAtual) return;
    
    try {
        console.log('🗑️ Deletando ponto do Supabase...');
        
        const client = window.supabaseClient || window.SUPABASE_CLIENT;
        if (!client) {
            throw new Error('Cliente Supabase não disponível');
        }
        
        const { error } = await client
            .from('pontos')
            .delete()
            .eq('id', pontoId);
        
        if (error) throw error;
        
        console.log('✅ Ponto deletado do Supabase!');
    } catch (error) {
        console.error('❌ Erro ao deletar ponto:', error);
    }
}

// ============================================================
// 11. CRUD DESPESAS
// ============================================================

function criarDespesa(trechoId, dadosDespesa) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }

    const novo = {
        id: gerarId(),
        descricao: dadosDespesa.descricao.trim(),
        valor: parseFloat(dadosDespesa.valor) || 0,
        data: dadosDespesa.data || null,
        tipo: dadosDespesa.tipo || 'outro'
    };
    trecho.despesas.push(novo);
    salvarDados();
    marcarSujo();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Despesa criada:', novo.descricao);
    return novo;
}

function atualizarDespesa(trechoId, despesaId, dadosDespesa) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }

    const despesa = trecho.despesas.find(d => d.id === despesaId);
    if (!despesa) {
        console.error('Despesa não encontrada:', despesaId);
        return;
    }

    despesa.descricao = dadosDespesa.descricao.trim();
    despesa.valor = parseFloat(dadosDespesa.valor) || 0;
    despesa.data = dadosDespesa.data || null;
    despesa.tipo = dadosDespesa.tipo || 'outro';

    salvarDados();
    marcarSujo();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Despesa atualizada:', despesa.descricao);
}

function excluirDespesa(trechoId, despesaId) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }
    
    if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;
    
    const despesa = trecho.despesas.find(d => d.id === despesaId);
    trecho.despesas = trecho.despesas.filter(d => d.id !== despesaId);
    salvarDados();
    enfileirarExclusao('despesa', despesaId);
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('🗑️ Despesa excluída:', despesa ? despesa.descricao : despesaId);
}

async function deletarDespesaDoSupabase(despesaId) {
    if (!isOnline() || !userAtual) return;
    
    try {
        console.log('🗑️ Deletando despesa do Supabase...');
        const result = await window.BuscuzAuth.deleteDespesa(despesaId);
        if (result.success) {
            console.log('✅ Despesa deletada do Supabase!');
        } else {
            console.error('❌ Erro ao deletar despesa:', result.error);
        }
    } catch (error) {
        console.error('❌ Erro ao deletar despesa:', error);
    }
}

// ============================================================
// 12. RENDERIZAÇÃO - PÁGINA PRINCIPAL
// ============================================================

function renderizarViagens() {
    const container = document.getElementById('viagensContainer');
    if (!container) return;
    
    let viagensFiltradas = dados.viagens;
    if (filtroAtual !== 'todas') {
        viagensFiltradas = dados.viagens.filter(v => {
            const status = getStatusViagem(v.dataInicio, v.dataFim);
            return status === filtroAtual;
        });
    }

    if (!viagensFiltradas.length) {
        container.innerHTML = `
            <div class="empty-state" style="text-align:center; padding:40px 20px; color:#999;">
                <i class="fas fa-suitcase" style="font-size:2.5rem; display:block; margin-bottom:12px;"></i>
                <p>${dados.viagens.length ? 'Nenhuma viagem com este filtro.' : 'Nenhuma viagem cadastrada ainda.'}</p>
                <p style="font-size:0.9rem;">Clique em "Nova Viagem" para começar.</p>
            </div>
        `;
        return;
    }

    const viagensOrdenadas = [...viagensFiltradas].sort((a, b) => {
        return new Date(a.dataInicio) - new Date(b.dataInicio);
    });

    container.innerHTML = viagensOrdenadas.map(viagem => {
        const status = getStatusViagem(viagem.dataInicio, viagem.dataFim);
        const totalDias = calcularDias(viagem.dataInicio, viagem.dataFim);
        const totalTrechos = viagem.trechos ? viagem.trechos.length : 0;
        const totalGastos = calcularTotalViagem(viagem);
        const kmViagem = distanciaViagem(viagem);
        const statusLabels = {
            'planejado': '📅 Planejada',
            'em-andamento': '🔄 Em andamento',
            'finalizado': '✅ Finalizada'
        };

        return `
            <div class="viagem-card" data-id="${viagem.id}">
                <h3>
                    <i class="fas fa-suitcase"></i> ${viagem.nome}
                    <span class="status-badge ${status}">${statusLabels[status]}</span>
                </h3>
                <div class="viagem-info">
                    <span><i class="fas fa-map-pin"></i> ${viagem.destino || 'Destino não definido'}</span>
                    <span><i class="fas fa-calendar-alt"></i> ${formatarData(viagem.dataInicio)} até ${formatarData(viagem.dataFim)}</span>
                    <span><i class="fas fa-clock"></i> ${totalDias} dias</span>
                </div>
                ${viagem.descricao ? `<div class="viagem-descricao">${viagem.descricao}</div>` : ''}
                <div class="viagem-resumo">
                    <span class="stat"><i class="fas fa-road"></i> ${totalTrechos} trechos</span>
                    <span class="stat"><i class="fas fa-route"></i> ${kmViagem.toFixed(1)} km</span>
                    <span class="stat"><i class="fas fa-coins"></i> ${formatarMoeda(totalGastos)}</span>
                    <span class="stat"><i class="fas fa-tachometer-alt"></i> ${kmViagem > 0 ? formatarMoeda(totalGastos / kmViagem) + '/km' : '—'}</span>
                    <span class="stat"><i class="fas fa-map-marker-alt"></i> ${viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + (t.pontos ? t.pontos.length : 0), 0) : 0} pontos</span>
                </div>
                <div class="card-actions">
                    <button class="secondary-btn editar-viagem" data-id="${viagem.id}" type="button">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="danger-btn excluir-viagem" data-id="${viagem.id}" type="button">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.viagem-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.editar-viagem') || e.target.closest('.excluir-viagem')) {
                return;
            }
            const id = card.dataset.id;
            abrirRoteiro(id);
        });
    });

    document.querySelectorAll('.editar-viagem').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const viagem = dados.viagens.find(v => v.id === id);
            if (viagem) {
                abrirModalViagem(viagem);
            }
        });
    });

    document.querySelectorAll('.excluir-viagem').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            excluirViagem(id);
        });
    });
}

// ============================================================
// 13. NAVEGAÇÃO ENTRE PÁGINAS
// ============================================================

function abrirRoteiro(viagemId) {
    const viagem = dados.viagens.find(v => v.id === viagemId);
    if (!viagem) {
        alert('Viagem não encontrada!');
        return;
    }

    viagemAtual = viagem;
    localStorage.setItem('viagemAtualId', viagemId);
    window.location.href = 'roteiro.html';
}

function voltarParaViagens() {
    window.location.href = 'index.html';
}

// ============================================================
// 14. RENDERIZAÇÃO - ROTEIRO
// ============================================================

function renderizarTrechos() {
    if (!viagemAtual) return;
    
    const container = document.getElementById('trechosContainer');
    if (!container) return;
    
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    document.getElementById('headerTitle').textContent = viagem.nome;
    renderizarTotaisViagem(viagem);

    if (!viagem.trechos || !viagem.trechos.length) {
        container.classList.remove('timeline');
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1; text-align:center; padding:40px 20px; color:#999;">
                <i class="fas fa-road" style="font-size:2.5rem; display:block; margin-bottom:12px;"></i>
                <p>Nenhum trecho cadastrado nesta viagem.</p>
                <p style="font-size:0.9rem;">Use Trecho na barra de baixo para começar.</p>
            </div>
        `;
        return;
    }

    const trechosOrdenados = [...viagem.trechos].sort((a, b) => {
        return new Date(a.dataCheckin) - new Date(b.dataCheckin);
    });
    container.classList.add('timeline');

    container.innerHTML = trechosOrdenados.map(trecho => {
        const totalDespesas = trecho.despesas ? trecho.despesas.length : 0;
        const totalGastos = calcularTotalGastos(trecho);
        const dias = calcularDias(trecho.dataCheckin, trecho.dataCheckout);

        return `
            <div class="card-trecho" data-id="${trecho.id}">
                <h3>${trecho.cidadeAtual} → ${trecho.proximaCidade}</h3>
                <div class="datas">
                    ${formatarData(trecho.dataCheckin)} até ${formatarData(trecho.dataCheckout)}
                    ${dias > 0 ? `<span>(${dias} dias)</span>` : ''}
                </div>
                <div class="resumo">
                    <span>${trecho.distancia} km</span>
                    <span>${trecho.tempoEstimado}h</span>
                    <span>${totalDespesas} desp.</span>
                    <span>${formatarMoeda(totalGastos)}</span>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.card-trecho').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            abrirDetalhes(id);
        });
    });
}

// ============================================================
// 15. DETALHES DO TRECHO
// ============================================================

function abrirDetalhes(id) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === id);
    if (!trecho) {
        alert('Trecho não encontrado!');
        return;
    }

    const modal = document.getElementById('detalhesModal');
    const content = document.getElementById('detalhesContent');

    const combustivelEstimado = calcularCombustivelEstimadoValor(trecho);
    const combustivelReal = calcularCombustivelReal(trecho);
    const litrosEstimados = calcularCombustivelEstimado(trecho.distancia, dados.config.consumoMedio || 10);
    
    const dias = calcularDias(trecho.dataCheckin, trecho.dataCheckout);
    const status = getStatusTrecho(trecho.dataCheckin, trecho.dataCheckout);

    const totalPontos = trecho.pontos ? trecho.pontos.reduce((acc, p) => acc + (p.custo || 0), 0) : 0;
    const totalDespesas = trecho.despesas ? trecho.despesas.reduce((acc, d) => acc + (d.valor || 0), 0) : 0;
    const totalGeral = totalPontos + totalDespesas;

    const statusLabels = {
        'planejado': '📅 Planejado',
        'em-andamento': '🔄 Em andamento',
        'finalizado': '✅ Finalizado'
    };

    let pontosHtml = '';
    if (trecho.pontos && trecho.pontos.length) {
        pontosHtml = `<ul class="item-list">`;
        const pontosOrdenados = [...trecho.pontos].sort((a, b) => {
            if (!a.data) return 1;
            if (!b.data) return -1;
            return new Date(a.data) - new Date(b.data);
        });
        pontosOrdenados.forEach(p => {
            const localizacaoHtml = p.localizacao ? 
                `<a href="${p.localizacao}" target="_blank" class="maps-link" title="Abrir no Google Maps">
                    <i class="fas fa-map-marked-alt"></i> Ver no Maps
                </a>` : 
                `<span class="no-maps"><i class="fas fa-map-pin"></i> Sem localização</span>`;

            pontosHtml += `
                <li>
                    <div class="item-info">
                        <strong>${p.nome}</strong>
                        <div class="ponto-actions">
                            ${localizacaoHtml}
                            ${p.data ? `<span class="data-info"><i class="fas fa-calendar-alt"></i> ${formatarData(p.data)}</span>` : ''}
                            <span class="custo-info"><i class="fas fa-ticket-alt"></i> ${formatarMoeda(p.custo)}</span>
                        </div>
                        ${p.observacoes ? `<div class="obs">📝 ${p.observacoes}</div>` : ''}
                    </div>
                    <div class="item-actions">
                        <button class="edit-btn" data-acao="editarPonto" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" data-acao="excluirPonto" data-id="${p.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </li>
            `;
        });
        pontosHtml += `</ul>`;
    } else {
        pontosHtml = `<p class="empty">Nenhum ponto cadastrado.</p>`;
    }

    let despesasHtml = '';
    if (trecho.despesas && trecho.despesas.length) {
        despesasHtml = `<ul class="item-list">`;
        const despesasOrdenadas = [...trecho.despesas].sort((a, b) => {
            if (!a.data) return 1;
            if (!b.data) return -1;
            return new Date(a.data) - new Date(b.data);
        });
        despesasOrdenadas.forEach(d => {
            const tipoLabel = {
                'pedagio': 'Pedágio',
                'balsa': 'Balsa',
                'abastecimento': 'Abastecimento ⛽',
                'alimentacao': 'Alimentação',
                'entrada': 'Entrada',
                'hospedagem': 'Hospedagem',
                'outro': 'Outro'
            }[d.tipo] || d.tipo;

            despesasHtml += `
                <li>
                    <div class="item-info">
                        <strong>${d.descricao}</strong>
                        ${d.data ? `<span class="data-info"><i class="fas fa-calendar-alt"></i> ${formatarData(d.data)}</span>` : ''}
                        <span style="margin-left:8px; color:#2c3e50;">${formatarMoeda(d.valor)}</span>
                        <span class="obs"> - ${tipoLabel}</span>
                    </div>
                    <div class="item-actions">
                        <button class="edit-btn" data-acao="editarDespesa" data-id="${d.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" data-acao="excluirDespesa" data-id="${d.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </li>
            `;
        });
        despesasHtml += `</ul>`;
    } else {
        despesasHtml = `<p class="empty">Nenhuma despesa cadastrada.</p>`;
    }

    content.innerHTML = `
        <div class="detalhes-header">
            <div>
                <h3 data-id="${trecho.id}"><i class="fas fa-arrow-right"></i> ${trecho.cidadeAtual} → ${trecho.proximaCidade}</h3>
                <div class="info">
                    <span><i class="fas fa-calendar-alt"></i> ${formatarData(trecho.dataCheckin)} até ${formatarData(trecho.dataCheckout)}</span>
                    <span><i class="fas fa-clock"></i> ${dias} dias</span>
                    <span><span class="status-badge ${status}">${statusLabels[status]}</span></span>
                    <span><i class="fas fa-route"></i> ${trecho.distancia} km</span>
                    <span><i class="fas fa-hourglass-half"></i> ${trecho.tempoEstimado}h</span>
                    ${trecho.odometro ? `<span><i class="fas fa-tachometer-alt"></i> ${trecho.odometro} km</span>` : ''}
                </div>
            </div>
            <div>
                <button class="secondary-btn" data-acao="editarTrecho" style="margin-right:6px;">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="danger-btn" data-acao="excluirTrecho">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>

        <div class="resumo-gastos">
            <div class="gasto-item">
                <div class="label">Combustível Estimado</div>
                <div class="value valor-estimado">${formatarMoeda(combustivelEstimado)}</div>
                <div class="gasto-nota">${litrosEstimados.toFixed(1)}L estimados</div>
            </div>
            <div class="gasto-item${combustivelReal > 0 ? ' gasto-real' : ''}">
                <div class="label">Combustível Real</div>
                <div class="value">${formatarMoeda(combustivelReal)}</div>
                <div class="gasto-nota">${combustivelReal > 0 ? 'Abastecimentos' : 'Nenhum abastecimento'}</div>
            </div>
            <div class="gasto-item">
                <div class="label">Pontos</div>
                <div class="value">${formatarMoeda(totalPontos)}</div>
            </div>
            <div class="gasto-item">
                <div class="label">Despesas</div>
                <div class="value">${formatarMoeda(totalDespesas)}</div>
            </div>
            <div class="gasto-item gasto-total">
                <div class="label">Total (sem estimado)</div>
                <div class="value">${formatarMoeda(totalGeral)}</div>
            </div>
        </div>

        <div class="detalhes-section">
            <h4><i class="fas fa-map-marker-alt"></i> Pontos Turísticos
                <button class="btn-inline" data-acao="novoPonto"><i class="fas fa-plus"></i> Adicionar</button>
            </h4>
            ${pontosHtml}
        </div>

        <div class="detalhes-section">
            <h4><i class="fas fa-receipt"></i> Despesas
                <button class="btn-inline" data-acao="novaDespesa"><i class="fas fa-plus"></i> Adicionar</button>
            </h4>
            ${despesasHtml}
        </div>
    `;

    content.querySelectorAll('[data-acao]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const acao = el.dataset.acao;
            const id = el.dataset.id;

            switch (acao) {
                case 'editarTrecho':
                    editarTrecho(trecho.id);
                    break;
                case 'excluirTrecho':
                    if (confirm('Tem certeza que deseja excluir este trecho?')) {
                        excluirTrecho(trecho.id);
                    }
                    break;
                case 'novoPonto':
                    abrirModalPonto(trecho.id);
                    break;
                case 'editarPonto':
                    editarPonto(trecho.id, id);
                    break;
                case 'excluirPonto':
                    excluirPonto(trecho.id, id);
                    abrirDetalhes(trecho.id);
                    break;
                case 'novaDespesa':
                    abrirModalDespesa(trecho.id);
                    break;
                case 'editarDespesa':
                    editarDespesa(trecho.id, id);
                    break;
                case 'excluirDespesa':
                    excluirDespesa(trecho.id, id);
                    abrirDetalhes(trecho.id);
                    break;
            }
        });
    });

    modal.style.display = 'block';
}

// ============================================================
// 16. FUNÇÕES DE MODAL
// ============================================================

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

function abrirModalViagem(viagem = null) {
    const modal = document.getElementById('viagemModal');
    if (!modal) return;
    
    const form = document.getElementById('formViagem');
    const title = document.getElementById('modalViagemTitle');

    form.reset();
    document.getElementById('viagemId').value = '';

    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 7);
    
    const hojeStr = hoje.toISOString().split('T')[0];
    const amanhaStr = amanha.toISOString().split('T')[0];

    if (viagem) {
        title.innerHTML = '<i class="fas fa-edit"></i> Editar Viagem';
        document.getElementById('viagemId').value = viagem.id;
        document.getElementById('viagemNome').value = viagem.nome;
        document.getElementById('viagemDestino').value = viagem.destino || '';
        document.getElementById('viagemDataInicio').value = viagem.dataInicio;
        document.getElementById('viagemDataFim').value = viagem.dataFim;
        document.getElementById('viagemDescricao').value = viagem.descricao || '';
        viagemEmEdicao = viagem.id;
    } else {
        title.innerHTML = '<i class="fas fa-suitcase"></i> Nova Viagem';
        document.getElementById('viagemDataInicio').value = hojeStr;
        document.getElementById('viagemDataFim').value = amanhaStr;
        viagemEmEdicao = null;
    }

    modal.style.display = 'block';
}

function abrirModalTrecho(trecho = null) {
    const modal = document.getElementById('trechoModal');
    if (!modal) return;
    
    const form = document.getElementById('formTrecho');
    const title = document.getElementById('modalTrechoTitle');

    form.reset();
    document.getElementById('trechoId').value = '';

    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    
    const hojeStr = hoje.toISOString().split('T')[0];
    const amanhaStr = amanha.toISOString().split('T')[0];

    if (trecho) {
        title.innerHTML = '<i class="fas fa-edit"></i> Editar Trecho';
        document.getElementById('trechoId').value = trecho.id;
        document.getElementById('cidadeAtual').value = trecho.cidadeAtual;
        document.getElementById('dataCheckin').value = trecho.dataCheckin || hojeStr;
        document.getElementById('dataCheckout').value = trecho.dataCheckout || amanhaStr;
        document.getElementById('proximaCidade').value = trecho.proximaCidade;
        document.getElementById('distancia').value = trecho.distancia;
        document.getElementById('tempoEstimado').value = trecho.tempoEstimado;
        document.getElementById('odometro').value = trecho.odometro || '';
        trechoEmEdicao = trecho.id;
    } else {
        title.innerHTML = '<i class="fas fa-road"></i> Novo Trecho';
        document.getElementById('dataCheckin').value = hojeStr;
        document.getElementById('dataCheckout').value = amanhaStr;
        trechoEmEdicao = null;
    }

    modal.style.display = 'block';
}

function abrirModalPonto(trechoId, ponto = null) {
    const modal = document.getElementById('pontoModal');
    if (!modal) return;
    
    const form = document.getElementById('formPonto');

    form.reset();
    document.getElementById('pontoId').value = '';
    document.getElementById('pontoTrechoId').value = trechoId;

    if (ponto) {
        document.getElementById('pontoId').value = ponto.id;
        document.getElementById('pontoNome').value = ponto.nome;
        document.getElementById('pontoLocalizacao').value = ponto.localizacao || '';
        document.getElementById('pontoData').value = ponto.data || '';
        document.getElementById('pontoCusto').value = ponto.custo;
        document.getElementById('pontoObservacoes').value = ponto.observacoes || '';
        pontoEmEdicao = ponto.id;
    } else {
        pontoEmEdicao = null;
    }

    modal.style.display = 'block';
}

function abrirModalDespesa(trechoId, despesa = null) {
    const modal = document.getElementById('despesaModal');
    if (!modal) return;
    
    const form = document.getElementById('formDespesa');

    form.reset();
    document.getElementById('despesaId').value = '';
    document.getElementById('despesaTrechoId').value = trechoId;

    const hoje = new Date().toISOString().split('T')[0];

    if (despesa) {
        document.getElementById('despesaId').value = despesa.id;
        document.getElementById('despesaDescricao').value = despesa.descricao;
        document.getElementById('despesaValor').value = despesa.valor;
        document.getElementById('despesaData').value = despesa.data || hoje;
        document.getElementById('despesaTipo').value = despesa.tipo || 'outro';
        despesaEmEdicao = despesa.id;
        marcarTipoDespesa(despesa.tipo || 'outro');
    } else {
        document.getElementById('despesaData').value = hoje;
        despesaEmEdicao = null;
        marcarTipoDespesa('pedagio');
    }

    modal.style.display = 'block';
}

function marcarTipoDespesa(tipo) {
    const hidden = document.getElementById('despesaTipo');
    const valor = tipo || 'outro';
    if (hidden) hidden.value = valor;
    document.querySelectorAll('.tipo-chip').forEach(btn => {
        const ativo = btn.dataset.tipo === valor;
        btn.classList.toggle('active', ativo);
        btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
}

function atualizarDetalhesSeAberto() {
    const modal = document.getElementById('detalhesModal');
    if (!modal || modal.style.display !== 'block') return;
    const trechoAtualId = document.querySelector('#detalhesModal .detalhes-header h3')?.dataset?.id;
    if (trechoAtualId) abrirDetalhes(trechoAtualId);
}

function ligarSeletorTema() {
    const select = document.getElementById('temaApp');
    if (!select || select.dataset.ligado === '1') return;
    select.dataset.ligado = '1';
    select.addEventListener('change', () => {
        if (window.BuscuzTema) window.BuscuzTema.definir(select.value);
    });
}

function abrirModalConfig() {
    const modal = document.getElementById('configModal');
    if (!modal) return;

    document.getElementById('consumoMedio').value = dados.config.consumoMedio || '';
    document.getElementById('precoCombustivel').value = dados.config.precoCombustivel || '';
    const select = document.getElementById('syncInterval');
    if (select) select.value = String(lerIntervaloSync());
    const status = document.getElementById('syncPreferenciaStatus');
    if (status) status.textContent = textoUltimaSync();
    const tema = document.getElementById('temaApp');
    if (tema && window.BuscuzTema) tema.value = window.BuscuzTema.ler();
    ligarSeletorTema();
    modal.style.display = 'block';
}

async function salvarConfiguracoesDoFormulario() {
    const consumo = parseFloat(document.getElementById('consumoMedio').value);
    const preco = parseFloat(document.getElementById('precoCombustivel').value);

    if (!(consumo > 0) || !(preco > 0)) {
        alert('Por favor, insira valores válidos (maiores que zero).');
        return;
    }

    dados.config.consumoMedio = consumo;
    dados.config.precoCombustivel = preco;
    salvarDados();
    marcarConfigPendente();

    const select = document.getElementById('syncInterval');
    if (select) {
        const intervalo = parseInt(select.value, 10);
        salvarIntervaloSync(Number.isFinite(intervalo) ? intervalo : SYNC_INTERVAL_PADRAO);
        agendarSync();
    }

    fecharModal('configModal');
    if (document.getElementById('viagensContainer')) renderizarViagens();
    if (document.getElementById('trechosContainer')) renderizarTrechos();

    const ok = await syncConfigToSupabase();
    if (ok) localStorage.setItem(CONFIG_DIRTY_KEY, '0');
    atualizarChipSync();
}

function abrirResumoViagem() {
    if (!viagemAtual) return;
    
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) return;

    const modal = document.getElementById('resumoModal');
    if (!modal) return;
    
    const content = document.getElementById('resumoContent');

    const totalTrechos = viagem.trechos ? viagem.trechos.length : 0;
    const totalPontos = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + (t.pontos ? t.pontos.length : 0), 0) : 0;
    const totalDespesas = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + (t.despesas ? t.despesas.length : 0), 0) : 0;
    const totalGastos = calcularTotalViagem(viagem);
    const totais = totaisDaViagem(viagem);
    const totalPontosValor = viagem.trechos
        ? viagem.trechos.reduce((acc, t) => acc + (t.pontos ? t.pontos.reduce((s, p) => s + (p.custo || 0), 0) : 0), 0)
        : 0;

    const tipos = [
        ['pedagio', 'Pedágio'],
        ['balsa', 'Balsa'],
        ['abastecimento', 'Abastecimento'],
        ['alimentacao', 'Alimentação'],
        ['entrada', 'Entrada'],
        ['hospedagem', 'Hospedagem'],
        ['outro', 'Outro']
    ];
    const porTipo = {};
    if (viagem.trechos) {
        viagem.trechos.forEach(t => {
            (t.despesas || []).forEach(d => {
                const tipo = d.tipo || 'outro';
                porTipo[tipo] = (porTipo[tipo] || 0) + (d.valor || 0);
            });
        });
    }
    const barras = tipos.map(([tipo, label]) => ({ label, valor: porTipo[tipo] || 0 }));
    barras.push({ label: 'Pontos turísticos', valor: totalPontosValor });
    const maior = Math.max(...barras.map(b => b.valor), 1);
    const barrasHtml = barras.map(b => `
        <div class="barra-linha">
            <div class="barra-meta">
                <span>${b.label}</span>
                <strong>${formatarMoeda(b.valor)}</strong>
            </div>
            <div class="barra-trilho">
                <div class="barra-preenchimento" style="width:${Math.round((b.valor / maior) * 100)}%"></div>
            </div>
        </div>
    `).join('');

    content.innerHTML = `
        <div class="resumo-viagem-stats">
            <div class="stat-item">
                <div class="stat-value">${totalTrechos}</div>
                <div class="stat-label">Trechos</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${totalPontos}</div>
                <div class="stat-label">Pontos Turísticos</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${totalDespesas}</div>
                <div class="stat-label">Despesas</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${totais.km.toFixed(1)} km</div>
                <div class="stat-label">Distância Total</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${totais.km > 0 ? formatarMoeda(totais.porKm) : '—'}</div>
                <div class="stat-label">Custo por km</div>
            </div>
        </div>
        <div class="resumo-viagem-stats">
            <div class="stat-item stat-estimado">
                <div class="stat-value">${formatarMoeda(totais.combustivelEstimado)}</div>
                <div class="stat-label">Combustível Estimado</div>
            </div>
            <div class="stat-item stat-real">
                <div class="stat-value">${formatarMoeda(totais.combustivelReal)}</div>
                <div class="stat-label">Combustível Real</div>
            </div>
            <div class="stat-item stat-total">
                <div class="stat-value">${formatarMoeda(totalGastos)}</div>
                <div class="stat-label">Total de Gastos</div>
            </div>
        </div>
        <div class="barras-gastos">
            <h3>Por tipo</h3>
            ${barrasHtml}
        </div>
        <div class="resumo-nota">
            <i class="fas fa-info-circle"></i>
            ${totais.combustivelReal > 0 ? 'Combustível real baseado em abastecimentos registrados. O estimado não entra no total.' : 'Nenhum abastecimento registrado ainda. O combustível estimado não entra no total.'}
        </div>
    `;

    modal.style.display = 'block';
}

function editarTrecho(id) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) return;
    const trecho = viagem.trechos.find(t => t.id === id);
    if (trecho) {
        abrirModalTrecho(trecho);
    }
}

function editarPonto(trechoId, pontoId) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) return;
    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) return;
    const ponto = trecho.pontos.find(p => p.id === pontoId);
    if (ponto) {
        abrirModalPonto(trechoId, ponto);
    }
}

function editarDespesa(trechoId, despesaId) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) return;
    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) return;
    const despesa = trecho.despesas.find(d => d.id === despesaId);
    if (despesa) {
        abrirModalDespesa(trechoId, despesa);
    }
}

// ============================================================
// 17. INICIALIZAÇÃO DAS PÁGINAS
// ============================================================

function initPaginaViagens() {
    renderizarViagens();

    const btnConfig = document.getElementById('btnConfig');
    if (btnConfig) {
        btnConfig.addEventListener('click', abrirModalConfig);
    }

    const btnSalvarConfig = document.getElementById('btnSalvarConfig');
    if (btnSalvarConfig) {
        btnSalvarConfig.addEventListener('click', salvarConfiguracoesDoFormulario);
    }

    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        btnSync.addEventListener('click', async function() {
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
            try {
                await sincronizarAgora();
            } finally {
                this.disabled = false;
                this.innerHTML = '<i class="fas fa-sync"></i> Sincronizar';
            }
        });
    }

    const btnNovaViagem = document.getElementById('btnNovaViagem');
    if (btnNovaViagem) {
        btnNovaViagem.addEventListener('click', () => {
            abrirModalViagem(null);
        });
    }

    const formViagem = document.getElementById('formViagem');
    if (formViagem) {
        formViagem.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('viagemId').value;
            const dataInicio = document.getElementById('viagemDataInicio').value;
            const dataFim = document.getElementById('viagemDataFim').value;

            if (new Date(dataFim) < new Date(dataInicio)) {
                alert('A data de fim não pode ser anterior à data de início.');
                return;
            }

            const dadosForm = {
                nome: document.getElementById('viagemNome').value.trim(),
                destino: document.getElementById('viagemDestino').value.trim(),
                dataInicio: dataInicio,
                dataFim: dataFim,
                descricao: document.getElementById('viagemDescricao').value.trim()
            };

            if (!dadosForm.nome) {
                alert('O nome da viagem é obrigatório.');
                return;
            }

            if (id) {
                atualizarViagem(id, dadosForm);
            } else {
                criarViagem(dadosForm);
            }
            fecharModal('viagemModal');
        });
    }

    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroAtual = btn.dataset.filtro;
            renderizarViagens();
        });
    });

    document.querySelectorAll('.modal .close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    console.log('🚐 Buscuz - Página de Viagens');
    console.log(`📊 ${dados.viagens.length} viagens carregadas`);
}

function initPaginaRoteiro() {
    const viagemId = localStorage.getItem('viagemAtualId');
    if (!viagemId) {
        alert('Nenhuma viagem selecionada!');
        window.location.href = 'index.html';
        return;
    }

    viagemAtual = dados.viagens.find(v => v.id === viagemId);
    
    if (!viagemAtual) {
        alert('Viagem não encontrada!');
        window.location.href = 'index.html';
        return;
    }

    renderizarTrechos();

    document.querySelectorAll('.tipo-chip').forEach(btn => {
        btn.addEventListener('click', () => marcarTipoDespesa(btn.dataset.tipo));
    });

    const btnVoltar = document.getElementById('btnVoltar');
    if (btnVoltar) {
        btnVoltar.addEventListener('click', voltarParaViagens);
    }

    const btnConfigRoteiro = document.getElementById('btnConfigRoteiro');
    if (btnConfigRoteiro) {
        btnConfigRoteiro.addEventListener('click', abrirModalConfig);
    }

    const btnSalvarConfig = document.getElementById('btnSalvarConfig');
    if (btnSalvarConfig) {
        btnSalvarConfig.addEventListener('click', salvarConfiguracoesDoFormulario);
    }

    const btnSyncRoteiro = document.getElementById('btnSyncRoteiro');
    if (btnSyncRoteiro) {
        btnSyncRoteiro.addEventListener('click', async function() {
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            try {
                await sincronizarAgora();
            } finally {
                this.disabled = false;
                this.innerHTML = '<i class="fas fa-sync"></i>';
            }
        });
    }

    const btnNovoTrecho = document.getElementById('btnNovoTrecho');
    if (btnNovoTrecho) {
        btnNovoTrecho.addEventListener('click', () => {
            abrirModalTrecho(null);
        });
    }

    const btnResumoViagem = document.getElementById('btnResumoViagem');
    if (btnResumoViagem) {
        btnResumoViagem.addEventListener('click', abrirResumoViagem);
    }

    const formTrecho = document.getElementById('formTrecho');
    if (formTrecho) {
        formTrecho.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('trechoId').value;
            const dataCheckin = document.getElementById('dataCheckin').value;
            const dataCheckout = document.getElementById('dataCheckout').value;

            if (new Date(dataCheckout) < new Date(dataCheckin)) {
                alert('A data de check-out não pode ser anterior à data de check-in.');
                return;
            }

            const dadosForm = {
                cidadeAtual: document.getElementById('cidadeAtual').value.trim(),
                dataCheckin: dataCheckin,
                dataCheckout: dataCheckout,
                proximaCidade: document.getElementById('proximaCidade').value.trim(),
                distancia: document.getElementById('distancia').value,
                tempoEstimado: document.getElementById('tempoEstimado').value,
                odometro: document.getElementById('odometro').value
            };

            if (!dadosForm.cidadeAtual || !dadosForm.proximaCidade) {
                alert('Preencha todos os campos obrigatórios.');
                return;
            }

            if (id) {
                atualizarTrecho(id, dadosForm);
            } else {
                criarTrecho(dadosForm);
            }
            fecharModal('trechoModal');
            atualizarDetalhesSeAberto();
        });
    }

    const formPonto = document.getElementById('formPonto');
    if (formPonto) {
        formPonto.addEventListener('submit', (e) => {
            e.preventDefault();
            const trechoId = document.getElementById('pontoTrechoId').value;
            const pontoId = document.getElementById('pontoId').value;
            const nome = document.getElementById('pontoNome').value.trim();
            const localizacao = document.getElementById('pontoLocalizacao').value.trim();
            
            if (!nome) {
                alert('O nome do ponto é obrigatório.');
                return;
            }

            if (localizacao && !localizacao.match(/^https?:\/\/.+/)) {
                alert('Por favor, insira uma URL válida para o Google Maps (começando com http:// ou https://).');
                return;
            }

            const dadosForm = {
                nome: nome,
                localizacao: localizacao,
                data: document.getElementById('pontoData').value,
                custo: document.getElementById('pontoCusto').value,
                observacoes: document.getElementById('pontoObservacoes').value.trim()
            };

            if (pontoId) {
                atualizarPonto(trechoId, pontoId, dadosForm);
            } else {
                criarPonto(trechoId, dadosForm);
            }
            fecharModal('pontoModal');
            atualizarDetalhesSeAberto();
        });
    }

    const formDespesa = document.getElementById('formDespesa');
    if (formDespesa) {
        formDespesa.addEventListener('submit', (e) => {
            e.preventDefault();
            const trechoId = document.getElementById('despesaTrechoId').value;
            const despesaId = document.getElementById('despesaId').value;
            const dadosForm = {
                descricao: document.getElementById('despesaDescricao').value.trim(),
                valor: document.getElementById('despesaValor').value,
                data: document.getElementById('despesaData').value,
                tipo: document.getElementById('despesaTipo').value
            };

            if (!dadosForm.descricao || !dadosForm.valor) {
                alert('Preencha todos os campos obrigatórios.');
                return;
            }

            if (despesaId) {
                atualizarDespesa(trechoId, despesaId, dadosForm);
            } else {
                criarDespesa(trechoId, dadosForm);
            }
            fecharModal('despesaModal');
            atualizarDetalhesSeAberto();
        });
    }

    document.querySelectorAll('.modal .close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    console.log('🚐 Buscuz - Página de Roteiro');
    console.log(`📅 Viagem: ${viagemAtual.nome}`);
    console.log(`📍 ${viagemAtual.trechos ? viagemAtual.trechos.length : 0} trechos carregados`);
}

// ============================================================
// 18. INICIALIZAÇÃO PRINCIPAL
// ============================================================

async function initApp() {
    console.log('🚀 Inicializando Buscuz...');

    const authResult = await window.checkAuthAndRedirect();

    if (!authResult || !authResult.authenticated) {
        console.log('⛔ Usuário não autenticado. Redirecionando...');
        return;
    }

    userAtual = authResult.user;
    console.log('✅ Usuário autenticado:', userAtual.email);

    carregarDados();

    let paginaIniciada = false;
    if (document.getElementById('viagensContainer')) {
        initPaginaViagens();
        paginaIniciada = true;
    } else if (document.getElementById('trechosContainer')) {
        const viagemId = localStorage.getItem('viagemAtualId');
        if (dados.viagens.some(v => v.id === viagemId)) {
            initPaginaRoteiro();
            paginaIniciada = true;
        }
    }

    atualizarInfoUsuario(authResult.user);
    ligarSeletorTema();
    atualizarChipSync();
    agendarSync();

    await carregarConfiguracoes();
    await syncDataFromSupabase();

    if (!paginaIniciada && document.getElementById('trechosContainer')) {
        initPaginaRoteiro();
    } else if (document.getElementById('viagensContainer')) {
        renderizarViagens();
    } else if (document.getElementById('trechosContainer') && viagemAtual) {
        viagemAtual = dados.viagens.find(v => v.id === viagemAtual.id) || viagemAtual;
        renderizarTrechos();
    }

    atualizarChipSync();
}

function atualizarInfoUsuario(user) {
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        const name = user.user_metadata?.name || user.email || 'Sair';
        const titulo = String(name).replace(/"/g, '');
        userInfo.innerHTML = `
            <button class="icon-btn" type="button" onclick="handleLogout()" aria-label="Sair" title="${titulo}">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        `;
    }
}

// ============================================================
// 19. EVENTOS DE CONEXÃO
// ============================================================

window.addEventListener('online', function() {
    atualizarChipSync();
    if (userAtual && temPendencia()) {
        syncDataToSupabase();
    }
});

window.addEventListener('offline', function() {
    atualizarChipSync();
});

// ============================================================
// 20. INICIAR APLICAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', initApp);

console.log('📦 Buscuz - App carregado!');
console.log('Versão 2.1 - Com autenticação e sincronização');