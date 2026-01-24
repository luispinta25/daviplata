// ============================================
// DAVIPLATA - CONFIGURACIÓN
// ============================================

const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://lpsupabase.luispintasolutions.com',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.LJEZ3yyGRxLBmCKM9z3EW-Yla1SszwbmvQMngMe3IWA',

    // Supabase Storage - Bucket para comprobantes
    STORAGE_BUCKET: 'luispintapersonal',

    // Webhooks (solo para notificaciones)
    WEBHOOK_MOVEMENT: 'https://lpwebhook.luispinta.com/webhook/daviplataevo',
    WEBHOOK_VERIFY: 'https://lpwebhook.luispinta.com/webhook/daviplataverificacion',
    WEBHOOK_DELETE: 'https://lpwebhook.luispinta.com/webhook/daviplataeliminacion',

    // Image Compression Settings
    IMAGE_MAX_WIDTH: 1200,
    IMAGE_MAX_HEIGHT: 1200,
    IMAGE_QUALITY: 0.85,

    // Date Format - Español
    DATE_LOCALE: 'es-ES',

    // Currency - USD con 2 decimales
    CURRENCY: 'USD',
    CURRENCY_SYMBOL: '$',
    DECIMAL_PLACES: 2
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

/**
 * Formatea un nombre completo a "PRIMER_NOMBRE P." en MAYÚSCULAS
 * Ejemplo: Pedro Sanches -> PEDRO S.
 * @param {string} fullName - Nombre completo 
 * @returns {string} - Nombre formateado
 */
function formatDisplayName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().toUpperCase().split(/\s+/);
    if (parts.length < 2) return parts[0];
    return `${parts[0]} ${parts[1].charAt(0)}.`;
}
