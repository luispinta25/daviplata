// ============================================
// DAVIPLATA - MOVEMENTS MODULE
// CRUD operations for movements
// Con soporte para roles y edición limitada
// ============================================

/**
 * Obtiene todos los movimientos
 * @param {Object} options - Opciones de filtrado
 * @returns {Promise<Array>}
 */
async function getMovements(options = {}) {
    const client = getSupabase();
    if (!client) return [];

    try {
        let query = client
            .from('daviplata_movimientos')
            .select('*, daviplata_usuarios(nombre, email)')
            .order('created_at', { ascending: false });

        // Filtrar por tipo
        if (options.tipo && options.tipo !== 'TODOS') {
            query = query.eq('tipo', options.tipo);
        }

        // Limitar resultados
        if (options.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error('❌ Error obteniendo movimientos:', error);
            showToast('Error al cargar movimientos', 'error');
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('❌ Error:', error);
        return [];
    }
}

/**
 * Obtiene un movimiento por ID
 * @param {string} id - ID del movimiento
 * @returns {Promise<Object|null>}
 */
async function getMovementById(id) {
    const client = getSupabase();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from('daviplata_movimientos')
            .select('*, daviplata_usuarios(nombre, email)')
            .eq('id', id)
            .single();

        if (error) {
            console.error('❌ Error obteniendo movimiento:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        return null;
    }
}

/**
 * Verifica si un movimiento puede ser editado
 * Reglas:
 * 1. Debe ser el último movimiento (no hay movimientos más nuevos)
 * 2. Debe tener menos de 30 minutos desde su creación
 * @param {Object} movement - El movimiento a verificar
 * @param {Array} allMovements - Todos los movimientos para comparar
 * @returns {Object} { canEdit: boolean, reason: string }
 */
function canEditMovement(movement, allMovements) {
    if (!movement || !allMovements || allMovements.length === 0) {
        return { canEdit: false, reason: 'Movimiento no encontrado' };
    }

    // Ordenar por fecha de creación (más reciente primero)
    const sorted = [...allMovements].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
    );

    const latestMovement = sorted[0];

    // Verificar si es el último movimiento
    if (movement.id !== latestMovement.id) {
        return {
            canEdit: false,
            reason: 'Solo se puede editar el último movimiento registrado'
        };
    }

    // Verificar si han pasado menos de 30 minutos
    const createdAt = new Date(movement.created_at);
    const now = new Date();
    const diffMinutes = (now - createdAt) / (1000 * 60);

    if (diffMinutes > 30) {
        return {
            canEdit: false,
            reason: 'Han pasado más de 30 minutos desde la creación'
        };
    }

    const remainingMinutes = Math.ceil(30 - diffMinutes);
    return {
        canEdit: true,
        reason: `Puedes editar por ${remainingMinutes} minuto${remainingMinutes !== 1 ? 's' : ''} más`
    };
}

/**
 * Crea un nuevo movimiento
 * @param {Object} movement - Datos del movimiento
 * @param {string} usuarioId - ID del usuario que crea el movimiento
 * @returns {Promise<Object|null>}
 */
async function createMovement(movement, usuarioId) {
    const client = getSupabase();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from('daviplata_movimientos')
            .insert([{
                usuario_id: usuarioId,
                tipo: movement.tipo,
                monto: movement.monto,
                motivo: movement.motivo,
                comprobante_url: movement.comprobante_url || null,
                fecha: movement.fecha || new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            console.error('❌ Error creando movimiento:', error);
            showToast('Error al crear movimiento', 'error');
            return null;
        }

        console.log('✅ Movimiento creado:', data);

        // Notificar al webhook
        await notifyMovementWebhook(data);

        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        return null;
    }
}

/**
 * Actualiza un movimiento existente
 * NOTA: Solo se puede actualizar el último movimiento y dentro de 30 minutos
 * @param {string} id - ID del movimiento
 * @param {Object} updates - Campos a actualizar
 * @returns {Promise<Object|null>}
 */
async function updateMovement(id, updates) {
    const client = getSupabase();
    if (!client) return null;

    try {
        // Solo permitir actualizar ciertos campos
        const allowedUpdates = {};
        if (updates.monto !== undefined) allowedUpdates.monto = updates.monto;
        if (updates.motivo !== undefined) allowedUpdates.motivo = updates.motivo;
        if (updates.comprobante_url !== undefined) allowedUpdates.comprobante_url = updates.comprobante_url;

        const { data, error } = await client
            .from('daviplata_movimientos')
            .update(allowedUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('❌ Error actualizando movimiento:', error);
            showToast('Error al actualizar movimiento', 'error');
            return null;
        }

        console.log('✅ Movimiento actualizado:', data);
        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        return null;
    }
}

/**
 * Obtiene estadísticas de movimientos
 * @returns {Promise<Object>}
 */
async function getStatistics() {
    const client = getSupabase();
    if (!client) {
        return {
            total_ingresos: 0,
            total_egresos: 0,
            balance: 0,
            cantidad_ingresos: 0,
            cantidad_egresos: 0,
            total_movimientos: 0
        };
    }

    try {
        // Intentar usar la vista
        const { data: viewData, error: viewError } = await client
            .from('daviplata_estadisticas')
            .select('*')
            .single();

        if (!viewError && viewData) {
            return viewData;
        }

        // Si la vista no existe, calcular manualmente
        const { data: movements, error } = await client
            .from('daviplata_movimientos')
            .select('tipo, monto');

        if (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return {
                total_ingresos: 0,
                total_egresos: 0,
                balance: 0,
                cantidad_ingresos: 0,
                cantidad_egresos: 0,
                total_movimientos: 0
            };
        }

        const stats = movements.reduce((acc, mov) => {
            if (mov.tipo === 'INGRESO') {
                acc.total_ingresos += parseFloat(mov.monto);
                acc.cantidad_ingresos++;
            } else {
                acc.total_egresos += parseFloat(mov.monto);
                acc.cantidad_egresos++;
            }
            return acc;
        }, {
            total_ingresos: 0,
            total_egresos: 0,
            cantidad_ingresos: 0,
            cantidad_egresos: 0
        });

        stats.balance = stats.total_ingresos - stats.total_egresos;
        stats.total_movimientos = movements.length;

        return stats;
    } catch (error) {
        console.error('❌ Error:', error);
        return {
            total_ingresos: 0,
            total_egresos: 0,
            balance: 0,
            cantidad_ingresos: 0,
            cantidad_egresos: 0,
            total_movimientos: 0
        };
    }
}
