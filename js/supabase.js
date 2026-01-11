// ============================================
// DAVIPLATA - SUPABASE CLIENT
// Con autenticación
// ============================================

let supabaseClient = null;

/**
 * Inicializa el cliente de Supabase
 */
function initSupabase() {
    if (supabaseClient) return supabaseClient;

    if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL === 'TU_SUPABASE_URL_AQUI') {
        console.error('⚠️ Supabase URL no configurada. Edita js/config.js');
        showToast('Error: Configura Supabase en config.js', 'error');
        return null;
    }

    if (!CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY === 'TU_SUPABASE_ANON_KEY_AQUI') {
        console.error('⚠️ Supabase Anon Key no configurada. Edita js/config.js');
        showToast('Error: Configura Supabase en config.js', 'error');
        return null;
    }

    try {
        supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        console.log('✅ Supabase inicializado correctamente');
        return supabaseClient;
    } catch (error) {
        console.error('❌ Error inicializando Supabase:', error);
        showToast('Error conectando a Supabase', 'error');
        return null;
    }
}

/**
 * Obtiene el cliente de Supabase
 */
function getSupabase() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

/**
 * Verifica la conexión a Supabase
 */
async function checkSupabaseConnection() {
    const client = getSupabase();
    if (!client) return false;

    try {
        const { data, error } = await client
            .from('daviplata_movimientos')
            .select('count', { count: 'exact', head: true });

        if (error) {
            console.error('❌ Error de conexión:', error);
            return false;
        }

        console.log('✅ Conexión a Supabase verificada');
        return true;
    } catch (error) {
        console.error('❌ Error verificando conexión:', error);
        return false;
    }
}

// ============================================
// AUTENTICACIÓN
// ============================================

/**
 * Inicia sesión con email y contraseña
 */
async function signIn(email, password) {
    const client = getSupabase();
    if (!client) return { error: 'Supabase no inicializado' };

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('❌ Error de login:', error);
            return { error: error.message };
        }

        console.log('✅ Login exitoso');
        return { data };
    } catch (error) {
        console.error('❌ Error:', error);
        return { error: error.message };
    }
}

/**
 * Registra un nuevo usuario
 */
async function signUp(email, password, nombre = null) {
    const client = getSupabase();
    if (!client) return { error: 'Supabase no inicializado' };

    try {
        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    nombre: nombre || email.split('@')[0],
                    rol: 'user' // Por defecto todos son 'user', admin se asigna manualmente
                }
            }
        });

        if (error) {
            console.error('❌ Error de registro:', error);
            return { error: error.message };
        }

        console.log('✅ Registro exitoso');
        return { data };
    } catch (error) {
        console.error('❌ Error:', error);
        return { error: error.message };
    }
}

/**
 * Cierra sesión
 */
async function signOut() {
    const client = getSupabase();
    if (!client) return;

    try {
        const { error } = await client.auth.signOut();
        if (error) {
            console.error('❌ Error cerrando sesión:', error);
        } else {
            console.log('✅ Sesión cerrada');
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

/**
 * Obtiene la sesión actual
 */
async function getSession() {
    const client = getSupabase();
    if (!client) return null;

    try {
        const { data: { session }, error } = await client.auth.getSession();
        if (error) {
            console.error('❌ Error obteniendo sesión:', error);
            return null;
        }
        return session;
    } catch (error) {
        console.error('❌ Error:', error);
        return null;
    }
}

/**
 * Obtiene el usuario actual
 */
async function getCurrentUser() {
    const client = getSupabase();
    if (!client) return null;

    try {
        const { data: { user }, error } = await client.auth.getUser();
        if (error) {
            console.error('❌ Error obteniendo usuario:', error);
            return null;
        }
        return user;
    } catch (error) {
        console.error('❌ Error:', error);
        return null;
    }
}

/**
 * Obtiene el perfil del usuario actual con su rol
 */
async function getCurrentUserProfile() {
    const client = getSupabase();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from('daviplata_usuarios')
            .select('*')
            .single();

        if (error) {
            console.error('❌ Error obteniendo perfil:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        return null;
    }
}

/**
 * Suscribe a cambios de autenticación
 */
function onAuthStateChange(callback) {
    const client = getSupabase();
    if (!client) return null;

    return client.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}
