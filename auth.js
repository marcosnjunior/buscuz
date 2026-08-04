// ============================================================
// Buscuz - Autenticação e Configuração Supabase
// Versão Unificada - Sem conflitos
// ============================================================

// Verificar se já foi carregado
if (typeof window.BuscuzAuth === 'undefined') {

    // ===== CONFIGURAÇÃO =====
    // Substitua pelos seus dados
    const SUPABASE_URL = 'https://isatgbkemaahqaoaruwz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_KX9DHtRNFOXcNhBV5qfLsw_No1BYeTq';

    // ===== INICIALIZAR SUPABASE =====
    // Verificar se o SDK está disponível
    if (typeof supabase === 'undefined' && typeof window.supabase === 'undefined') {
        console.error('❌ SDK do Supabase não carregado!');
        throw new Error('SDK do Supabase não disponível');
    }

    // Usar o cliente existente ou criar novo
    const _supabase = window.supabase || supabase;
    const supabaseClient = _supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ===== EXPOR VARIÁVEIS GLOBAIS =====
    window.SUPABASE_CLIENT = supabaseClient;
    window.supabaseClient = supabaseClient; // ← ADICIONADO PARA ACESSO GLOBAL
    window.BuscuzAuth = {};

    // ===== FUNÇÕES DE AUTENTICAÇÃO =====

    /**
     * Login com email e senha
     */
    window.BuscuzAuth.login = async function(email, password) {
        try {
            console.log('🔐 Tentando login...');
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            if (error) throw error;
            
            // Salvar sessão
            localStorage.setItem('supabase_session', JSON.stringify(data.session));
            console.log('✅ Login realizado com sucesso!');
            
            return { success: true, user: data.user, session: data.session };
        } catch (error) {
            console.error('❌ Erro no login:', error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * Logout
     */
    window.handleLogout = async function() {
        if (!confirm('Tem certeza que deseja sair?')) return;
        
        const result = await window.BuscuzAuth.logout();
        
        if (result.success) {
            window.location.href = 'login.html';
        } else {
            alert('Erro ao sair: ' + result.error);
        }
    };

    // ===== FUNÇÕES DE RECUPERAÇÃO DE SENHA (GLOBAIS) =====

    /**
     * Página de Recuperação de Senha
     */
    window.handleForgotPassword = async function(event) {
        // Prevenir comportamento padrão do form
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const email = document.getElementById('email').value;
        const errorElement = document.getElementById('forgotError');
        const successElement = document.getElementById('forgotSuccess');
        const loadingElement = document.getElementById('forgotLoading');
        const button = document.getElementById('forgotButton');
        
        // Limpar mensagens anteriores
        errorElement.style.display = 'none';
        successElement.style.display = 'none';
        
        if (!email || !email.includes('@')) {
            errorElement.textContent = 'Por favor, informe um e-mail válido.';
            errorElement.style.display = 'block';
            return;
        }
        
        // Mostrar loading
        button.disabled = true;
        loadingElement.style.display = 'inline';
        
        const result = await window.BuscuzAuth.forgotPassword(email);
        
        // Esconder loading
        button.disabled = false;
        loadingElement.style.display = 'none';
        
        if (result.success) {
            successElement.style.display = 'block';
            document.getElementById('email').value = '';
        } else {
            errorElement.textContent = result.error || 'Erro ao enviar e-mail. Tente novamente.';
            errorElement.style.display = 'block';
        }
    };

    /**
     * Página de Redefinição de Senha
     */
    window.handleResetPassword = async function(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorElement = document.getElementById('resetError');
        const successElement = document.getElementById('resetSuccess');
        const loadingElement = document.getElementById('resetLoading');
        const button = document.getElementById('resetButton');
        
        // Limpar mensagens anteriores
        errorElement.style.display = 'none';
        successElement.style.display = 'none';
        errorElement.textContent = '';
        
        // Validar senhas
        if (newPassword !== confirmPassword) {
            errorElement.textContent = '❌ As senhas não coincidem.';
            errorElement.style.display = 'block';
            return;
        }
        
        if (newPassword.length < 6) {
            errorElement.textContent = '❌ A senha deve ter pelo menos 6 caracteres.';
            errorElement.style.display = 'block';
            return;
        }
        
        // Mostrar loading
        button.disabled = true;
        loadingElement.style.display = 'inline';
        
        const result = await window.BuscuzAuth.resetPassword(newPassword);
        
        // Esconder loading
        button.disabled = false;
        loadingElement.style.display = 'none';
        
        if (result.success) {
            successElement.style.display = 'block';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            
            // Limpar URL dos parâmetros
            if (window.history && window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 3000);
        } else {
            errorElement.textContent = '❌ ' + (result.error || 'Erro ao redefinir senha. Tente novamente.');
            errorElement.style.display = 'block';
        }
    };

    /**
     * Cadastro de novo usuário
     */
    window.BuscuzAuth.signup = async function(email, password, name) {
        try {
            console.log('📝 Tentando cadastrar...');
            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        name: name
                    }
                }
            });
            
            if (error) throw error;
            
            // Criar perfil
            if (data.user) {
                await window.BuscuzAuth.createProfile(data.user.id, name, email);
            }
            
            console.log('✅ Cadastro realizado com sucesso!');
            return { success: true, user: data.user };
        } catch (error) {
            console.error('❌ Erro no cadastro:', error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * Recuperação de senha
     */
    window.BuscuzAuth.forgotPassword = async function(email) {
        try {
            console.log('📧 Enviando link de recuperação...');
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });
            
            if (error) throw error;
            console.log('✅ Email enviado!');
            return { success: true };
        } catch (error) {
            console.error('❌ Erro na recuperação:', error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * Redefinir senha
     */
    window.BuscuzAuth.resetPassword = async function(newPassword) {
        try {
            console.log('🔑 Redefinindo senha...');
            
            // Verificar se há uma sessão ativa
            const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
            
            if (sessionError) {
                console.error('❌ Erro ao verificar sessão:', sessionError);
                return { success: false, error: 'Sessão não encontrada. O link de recuperação pode ter expirado.' };
            }
            
            if (!session) {
                console.warn('⚠️ Nenhuma sessão ativa encontrada.');
                
                // Tentar recuperar da URL (token hash)
                const urlParams = new URLSearchParams(window.location.search);
                const tokenHash = urlParams.get('token_hash');
                const type = urlParams.get('type');
                
                if (tokenHash && type === 'recovery') {
                    console.log('🔑 Token de recuperação encontrado na URL.');
                    
                    // Verificar o token
                    const { data: verifyData, error: verifyError } = await supabaseClient.auth.verifyOtp({
                        token_hash: tokenHash,
                        type: 'recovery'
                    });
                    
                    if (verifyError) {
                        console.error('❌ Erro ao verificar token:', verifyError);
                        return { success: false, error: 'Link de recuperação inválido ou expirado.' };
                    }
                    
                    console.log('✅ Token verificado com sucesso!');
                    
                    // Agora atualizar a senha
                    const { error: updateError } = await supabaseClient.auth.updateUser({
                        password: newPassword
                    });
                    
                    if (updateError) throw updateError;
                    
                    console.log('✅ Senha redefinida com sucesso!');
                    return { success: true };
                } else {
                    return { success: false, error: 'Link de recuperação inválido. Solicite um novo link.' };
                }
            }
            
            // Se tem sessão, atualizar diretamente
            const { error: updateError } = await supabaseClient.auth.updateUser({
                password: newPassword
            });
            
            if (updateError) throw updateError;
            
            console.log('✅ Senha redefinida com sucesso!');
            return { success: true };
        } catch (error) {
            console.error('❌ Erro ao redefinir senha:', error.message);
            
            // Mensagens amigáveis
            let errorMsg = error.message;
            if (errorMsg.includes('session')) {
                errorMsg = 'Sessão expirada. Solicite um novo link de recuperação.';
            } else if (errorMsg.includes('token')) {
                errorMsg = 'Link de recuperação inválido ou expirado. Solicite um novo.';
            }
            
            return { success: false, error: errorMsg };
        }
    };

    /**
     * Logout
     */
    window.BuscuzAuth.logout = async function() {
        try {
            console.log('🚪 Fazendo logout...');
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
            
            localStorage.removeItem('supabase_session');
            localStorage.removeItem('buscuz_data');
            
            console.log('✅ Logout realizado!');
            return { success: true };
        } catch (error) {
            console.error('❌ Erro no logout:', error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * Verificar autenticação
     */
    window.BuscuzAuth.checkAuth = async function() {
        try {
            // Tentar obter sessão atual
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            
            if (error) throw error;
            
            if (session) {
                localStorage.setItem('supabase_session', JSON.stringify(session));
                return { authenticated: true, user: session.user };
            }
            
            // Tentar recuperar do localStorage
            const storedSession = localStorage.getItem('supabase_session');
            if (storedSession) {
                try {
                    const parsed = JSON.parse(storedSession);
                    if (parsed && parsed.access_token) {
                        // Verificar se o token ainda é válido
                        const { data: { session: validSession } } = await supabaseClient.auth.getSession();
                        if (validSession) {
                            return { authenticated: true, user: validSession.user };
                        }
                    }
                } catch (e) {
                    console.warn('Sessão armazenada inválida');
                    localStorage.removeItem('supabase_session');
                }
            }
            
            return { authenticated: false };
        } catch (error) {
            console.error('❌ Erro ao verificar autenticação:', error.message);
            return { authenticated: false, error: error.message };
        }
    };

    /**
     * Criar perfil do usuário
     */
    window.BuscuzAuth.createProfile = async function(userId, name, email) {
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .insert([
                    {
                        id: userId,
                        name: name,
                        email: email,
                        created_at: new Date().toISOString()
                    }
                ]);
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('❌ Erro ao criar perfil:', error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * Obter perfil do usuário
     */
    window.BuscuzAuth.getProfile = async function(userId) {
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (error) throw error;
            return { success: true, profile: data };
        } catch (error) {
            console.error('❌ Erro ao buscar perfil:', error.message);
            return { success: false, error: error.message };
        }
    };

    // ===== FUNÇÕES DE CONFIGURAÇÃO =====

/**
 * Salvar configurações do usuário no Supabase
 */
window.BuscuzAuth.saveConfig = async function(userId, configData) {
    try {
        console.log('💾 Salvando configurações...');
        
        const config = {
            user_id: userId,
            consumo_medio: configData.consumoMedio || 10,
            preco_combustivel: configData.precoCombustivel || 5.50,
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabaseClient
            .from('config')
            .upsert(config, { onConflict: 'user_id' });
        
        if (error) throw error;
        
        console.log('✅ Configurações salvas com sucesso!');
        return { success: true };
    } catch (error) {
        console.error('❌ Erro ao salvar configurações:', error.message);
        return { success: false, error: error.message };
    }
};

    /**
     * Carregar configurações do usuário do Supabase
     */
    window.BuscuzAuth.loadConfig = async function(userId) {
        try {
            console.log('📥 Carregando configurações...');
            
            const { data, error } = await supabaseClient
                .from('config')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();  // ← USAR maybeSingle() em vez de single()
            
            // Verificar se não há dados (configuração não existe)
            if (!data && error && error.code === 'PGRST116') {
                console.log('📭 Nenhuma configuração encontrada, usando padrão');
                return { 
                    success: true, 
                    config: { consumoMedio: 10, precoCombustivel: 5.50 } 
                };
            }
            
            if (error) throw error;
            
            console.log('✅ Configurações carregadas!');
            return { 
                success: true, 
                config: {
                    consumoMedio: data?.consumo_medio || 10,
                    precoCombustivel: data?.preco_combustivel || 5.50
                }
            };
        } catch (error) {
            console.error('❌ Erro ao carregar configurações:', error.message);
            return { 
                success: false, 
                error: error.message,
                config: { consumoMedio: 10, precoCombustivel: 5.50 }
            };
        }
    };

    // ===== FUNÇÕES DE SINCRONIZAÇÃO =====

    window.BuscuzAuth.syncData = async function(userId, viagens) {
        try {
            console.log('🔄 Sincronizando dados...');
            
            // Sincronizar viagens
            for (const viagem of viagens) {
                const viagemData = {
                    id: viagem.id,
                    user_id: userId,
                    nome: viagem.nome,
                    destino: viagem.destino || '',
                    data_inicio: viagem.dataInicio,
                    data_fim: viagem.dataFim,
                    descricao: viagem.descricao || '',
                    updated_at: new Date().toISOString()
                };
                
                const { error } = await supabaseClient
                    .from('viagens')
                    .upsert(viagemData, { onConflict: 'id' });
                
                if (error) throw error;
                
                // Sincronizar trechos
                if (viagem.trechos) {
                    for (const trecho of viagem.trechos) {
                        const trechoData = {
                            id: trecho.id,
                            viagem_id: viagem.id,
                            cidade_atual: trecho.cidadeAtual,
                            data_checkin: trecho.dataCheckin,
                            data_checkout: trecho.dataCheckout,
                            proxima_cidade: trecho.proximaCidade,
                            distancia: trecho.distancia,
                            tempo_estimado: trecho.tempoEstimado,
                            odometro: trecho.odometro || null,
                            updated_at: new Date().toISOString()
                        };
                        
                        const { error: tError } = await supabaseClient
                            .from('trechos')
                            .upsert(trechoData, { onConflict: 'id' });
                        
                        if (tError) throw tError;
                        
                        // Sincronizar pontos
                        if (trecho.pontos) {
                            for (const ponto of trecho.pontos) {
                                const pontoData = {
                                    id: ponto.id,
                                    trecho_id: trecho.id,
                                    nome: ponto.nome,
                                    localizacao: ponto.localizacao || '',
                                    data: ponto.data || null,
                                    custo: ponto.custo || 0,
                                    observacoes: ponto.observacoes || '',
                                    updated_at: new Date().toISOString()
                                };
                                
                                const { error: pError } = await supabaseClient
                                    .from('pontos')
                                    .upsert(pontoData, { onConflict: 'id' });
                                
                                if (pError) throw pError;
                            }
                        }
                        
                        // Sincronizar despesas
                        if (trecho.despesas) {
                            for (const despesa of trecho.despesas) {
                                const despesaData = {
                                    id: despesa.id,
                                    trecho_id: trecho.id,
                                    descricao: despesa.descricao,
                                    valor: despesa.valor || 0,
                                    data: despesa.data || null,
                                    tipo: despesa.tipo || 'outro',
                                    updated_at: new Date().toISOString()
                                };
                                
                                const { error: dError } = await supabaseClient
                                    .from('despesas')
                                    .upsert(despesaData, { onConflict: 'id' });
                                
                                if (dError) throw dError;
                            }
                        }
                    }
                }
            }
            
            console.log('✅ Dados sincronizados com sucesso!');
            return { success: true };
        } catch (error) {
            console.error('❌ Erro ao sincronizar:', error.message);
            return { success: false, error: error.message };
        }
    };

    window.BuscuzAuth.loadData = async function(userId) {
        try {
            console.log('📥 Carregando dados...');
            
            const { data: viagens, error } = await supabaseClient
                .from('viagens')
                .select('*')
                .eq('user_id', userId);
            
            if (error) throw error;
            
            // Carregar trechos
            for (const viagem of viagens) {
                const { data: trechos, error: tError } = await supabaseClient
                    .from('trechos')
                    .select('*')
                    .eq('viagem_id', viagem.id);
                
                if (tError) throw tError;
                
                viagem.trechos = trechos || [];
                
                // Carregar pontos e despesas
                for (const trecho of viagem.trechos) {
                    const [pontos, despesas] = await Promise.all([
                        supabaseClient.from('pontos').select('*').eq('trecho_id', trecho.id),
                        supabaseClient.from('despesas').select('*').eq('trecho_id', trecho.id)
                    ]);
                    
                    trecho.pontos = pontos.data || [];
                    trecho.despesas = despesas.data || [];
                }
            }
            
            console.log('✅ Dados carregados!');
            return { success: true, viagens: viagens };
        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error.message);
            return { success: false, error: error.message };
        }
    };

    // ===== FUNÇÕES DE DELETE =====

    /**
     * Deletar viagem do Supabase (com todas as dependências)
     */
    window.BuscuzAuth.deleteViagem = async function(viagemId) {
        try {
            console.log('🗑️ Deletando viagem do Supabase:', viagemId);
            
            const client = window.supabaseClient || window.SUPABASE_CLIENT;
            if (!client) {
                throw new Error('Cliente Supabase não disponível');
            }
            
            // 1. Buscar todos os trechos da viagem
            const { data: trechos, error: fetchError } = await client
                .from('trechos')
                .select('id')
                .eq('viagem_id', viagemId);
            
            if (fetchError) throw fetchError;
            
            // 2. Deletar pontos e despesas de cada trecho
            if (trechos && trechos.length > 0) {
                for (const trecho of trechos) {
                    // Deletar pontos do trecho
                    const { error: pError } = await client
                        .from('pontos')
                        .delete()
                        .eq('trecho_id', trecho.id);
                    
                    if (pError) throw pError;
                    
                    // Deletar despesas do trecho
                    const { error: dError } = await client
                        .from('despesas')
                        .delete()
                        .eq('trecho_id', trecho.id);
                    
                    if (dError) throw dError;
                }
                
                // 3. Deletar todos os trechos da viagem
                const { error: tError } = await client
                    .from('trechos')
                    .delete()
                    .eq('viagem_id', viagemId);
                
                if (tError) throw tError;
            }
            
            // 4. Finalmente deletar a viagem
            const { error } = await client
                .from('viagens')
                .delete()
                .eq('id', viagemId);
            
            if (error) throw error;
            
            console.log('✅ Viagem deletada do Supabase!');
            return { success: true };
        } catch (error) {
            console.error('❌ Erro ao deletar viagem:', error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * Deletar trecho do Supabase (com pontos e despesas)
     */
    window.BuscuzAuth.deleteTrecho = async function(trechoId) {
        try {
            console.log('🗑️ Deletando trecho do Supabase:', trechoId);
            
            const client = window.supabaseClient || window.SUPABASE_CLIENT;
            if (!client) {
                throw new Error('Cliente Supabase não disponível');
            }
            
            // Deletar pontos do trecho
            const { error: pError } = await client
                .from('pontos')
                .delete()
                .eq('trecho_id', trechoId);
            
            if (pError) throw pError;
            
            // Deletar despesas do trecho
            const { error: dError } = await client
                .from('despesas')
                .delete()
                .eq('trecho_id', trechoId);
            
            if (dError) throw dError;
            
            // Deletar o trecho
            const { error } = await client
                .from('trechos')
                .delete()
                .eq('id', trechoId);
            
            if (error) throw error;
            
            console.log('✅ Trecho deletado do Supabase!');
            return { success: true };
        } catch (error) {
            console.error('❌ Erro ao deletar trecho:', error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * Deletar ponto do Supabase
     */
    window.BuscuzAuth.deletePonto = async function(pontoId) {
        try {
            console.log('🗑️ Deletando ponto do Supabase:', pontoId);
            
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
            return { success: true };
        } catch (error) {
            console.error('❌ Erro ao deletar ponto:', error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * Deletar despesa do Supabase
     */
    window.BuscuzAuth.deleteDespesa = async function(despesaId) {
        try {
            console.log('🗑️ Deletando despesa do Supabase:', despesaId);
            
            const client = window.supabaseClient || window.SUPABASE_CLIENT;
            if (!client) {
                throw new Error('Cliente Supabase não disponível');
            }
            
            const { error } = await client
                .from('despesas')
                .delete()
                .eq('id', despesaId);
            
            if (error) throw error;
            
            console.log('✅ Despesa deletada do Supabase!');
            return { success: true };
        } catch (error) {
            console.error('❌ Erro ao deletar despesa:', error.message);
            return { success: false, error: error.message };
        }
    };

    // ============================================================
    // FUNÇÃO DE VERIFICAÇÃO E REDIRECIONAMENTO
    // ============================================================

    /**
     * Verificar autenticação e proteger páginas
     */
    window.checkAuthAndRedirect = async function() {
        try {
            const result = await window.BuscuzAuth.checkAuth();
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            
            console.log('🔍 Verificando autenticação...');
            console.log('📄 Página atual:', currentPage);
            console.log('🔐 Autenticado:', result.authenticated);
            
            // Páginas públicas (não precisam de autenticação)
            const publicPages = ['login.html', 'signup.html', 'forgot-password.html', 'reset-password.html', ''];
            
            // Se não estiver autenticado e estiver em uma página protegida
            if (!result.authenticated && !publicPages.includes(currentPage)) {
                console.log('⛔ Usuário não autenticado. Redirecionando para login...');
                window.location.href = 'login.html';
                return false;
            }
            
            // Se estiver autenticado e estiver em uma página pública
            if (result.authenticated && publicPages.includes(currentPage)) {
                console.log('✅ Usuário já autenticado. Redirecionando para index...');
                window.location.href = 'index.html';
                return false;
            }
            
            // Se estiver autenticado e em página protegida
            if (result.authenticated && !publicPages.includes(currentPage)) {
                console.log('✅ Usuário autenticado. Acesso permitido.');
                return result;
            }
            
            // Caso não esteja autenticado e esteja em página pública
            if (!result.authenticated && publicPages.includes(currentPage)) {
                console.log('📝 Página pública. Acesso permitido.');
                return result;
            }
            
            return result;
        } catch (error) {
            console.error('❌ Erro ao verificar autenticação:', error);
            window.location.href = 'login.html';
            return false;
        }
    };

    console.log('✅ BuscuzAuth inicializado com sucesso!');
}