// ============================================================
// Supabase Configuration - Versão Simplificada
// ============================================================

// Configurações (substitua pelas suas)
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = 'sua-chave-anon-publica';

// Criar cliente global
if (typeof window._supabase === 'undefined') {
    window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const supabase = window._supabase;

// Exportar funções (tornar globais)
window.loginUser = async function(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        localStorage.setItem('supabase_session', JSON.stringify(data.session));
        
        return { success: true, user: data.user, session: data.session };
    } catch (error) {
        console.error('Erro no login:', error);
        return { success: false, error: error.message };
    }
};

window.signupUser = async function(email, password, name) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { name: name }
            }
        });
        
        if (error) throw error;
        
        if (data.user) {
            await createUserProfile(data.user.id, name, email);
        }
        
        return { success: true, user: data.user };
    } catch (error) {
        console.error('Erro no cadastro:', error);
        return { success: false, error: error.message };
    }
};

window.forgotPassword = async function(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Erro na recuperação:', error);
        return { success: false, error: error.message };
    }
};

window.resetPassword = async function(newPassword) {
    try {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        return { success: false, error: error.message };
    }
};

window.logoutUser = async function() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        localStorage.removeItem('supabase_session');
        localStorage.removeItem('buscuz_data');
        
        return { success: true };
    } catch (error) {
        console.error('Erro no logout:', error);
        return { success: false, error: error.message };
    }
};

window.checkAuth = async function() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
            localStorage.setItem('supabase_session', JSON.stringify(session));
            return { authenticated: true, user: session.user };
        }
        
        const storedSession = localStorage.getItem('supabase_session');
        if (storedSession) {
            const { data: { session: validSession } } = await supabase.auth.getSession();
            if (validSession) {
                return { authenticated: true, user: validSession.user };
            }
        }
        
        return { authenticated: false };
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        return { authenticated: false, error: error.message };
    }
};

async function createUserProfile(userId, name, email) {
    try {
        const { error } = await supabase
            .from('profiles')
            .insert([{ id: userId, name: name, email: email }]);
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Erro ao criar perfil:', error);
        return { success: false, error: error.message };
    }
}

console.log('✅ Supabase inicializado com sucesso!');