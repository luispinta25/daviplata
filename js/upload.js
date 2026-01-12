// ============================================
// DAVIPLATA - UPLOAD MODULE
// Compresión de imágenes y subida a Supabase Storage
// ============================================

/**
 * Comprime una imagen manteniendo buena calidad
 * Solo comprime si el resultado es menor que el original
 * @param {File} file - Archivo de imagen original
 * @returns {Promise<Blob>} - Imagen comprimida o original si no vale la pena comprimir
 */
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        // Si no es imagen, devolver el archivo original
        if (!file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        // Si la imagen es muy pequeña (< 100KB), no vale la pena comprimir
        if (file.size < 100 * 1024) {
            console.log(`Imagen pequeña (${formatBytes(file.size)}), no se comprime`);
            resolve(file);
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                // Calcular nuevas dimensiones manteniendo aspect ratio
                let width = img.width;
                let height = img.height;

                const maxWidth = CONFIG.IMAGE_MAX_WIDTH || 1200;
                const maxHeight = CONFIG.IMAGE_MAX_HEIGHT || 1200;

                // Solo redimensionar si es necesario
                const needsResize = width > maxWidth || height > maxHeight;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }

                // Crear canvas y comprimir
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // Siempre usar JPEG para mejor compresión (excepto PNG con transparencia)
                const quality = CONFIG.IMAGE_QUALITY || 0.85;

                canvas.toBlob((blob) => {
                    if (blob) {
                        // Solo usar el blob comprimido si es MENOR que el original
                        if (blob.size < file.size) {
                            const savings = ((1 - blob.size / file.size) * 100).toFixed(1);
                            console.log(`Imagen comprimida: ${formatBytes(file.size)} → ${formatBytes(blob.size)} (-${savings}%)`);
                            resolve(blob);
                        } else {
                            console.log(`Compresión no beneficiosa, usando original (${formatBytes(file.size)})`);
                            resolve(file);
                        }
                    } else {
                        // Si falla la compresión, usar original
                        resolve(file);
                    }
                }, 'image/jpeg', quality);
            };

            img.onerror = () => {
                console.warn('Error cargando imagen, usando original');
                resolve(file);
            };
            img.src = e.target.result;
        };

        reader.onerror = () => {
            console.warn('Error leyendo archivo, usando original');
            resolve(file);
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Formatea bytes a formato legible
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Genera un nombre único para el archivo
 */
function generateUniqueFilename(originalName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = originalName.split('.').pop().toLowerCase() || 'jpg';
    return `comprobante_${timestamp}_${random}.${extension}`;
}

/**
 * Sube un archivo a Supabase Storage
 * @param {File|Blob} file - Archivo a subir
 * @param {string} filename - Nombre del archivo original
 * @returns {Promise<string>} - URL pública del archivo
 */
async function uploadToSupabaseStorage(file, filename) {
    const client = getSupabase();
    if (!client) {
        throw new Error('Supabase no inicializado');
    }

    try {
        // Comprimir si es imagen
        let fileToUpload = file;
        if (file.type && file.type.startsWith('image/')) {
            fileToUpload = await compressImage(file);
        }

        // Generar nombre único
        const uniqueFilename = generateUniqueFilename(filename);
        const filePath = `daviplata/${uniqueFilename}`;

        console.log('Subiendo archivo a Supabase Storage...');

        // Subir a Supabase Storage
        const { data, error } = await client.storage
            .from(CONFIG.STORAGE_BUCKET)
            .upload(filePath, fileToUpload, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'image/jpeg'
            });

        if (error) {
            console.error('Error subiendo a Storage:', error);
            throw error;
        }

        // Obtener URL pública
        const { data: urlData } = client.storage
            .from(CONFIG.STORAGE_BUCKET)
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;
        console.log('Archivo subido:', publicUrl);

        return publicUrl;
    } catch (error) {
        console.error('Error subiendo archivo:', error);
        throw error;
    }
}

/**
 * Función principal de upload - usa Supabase Storage
 * Mantiene compatibilidad con el código existente
 */
async function uploadToWebhook(file, filename) {
    // Usar Supabase Storage en lugar de webhook
    return await uploadToSupabaseStorage(file, filename);
}

/**
 * Notifica un movimiento creado al webhook
 * Usa FormData para enviar los datos como "piezas" individuales (multipart/form-data)
 * Esto es más compatible con herramientas como n8n y evita problemas de CORS en modo simple
 * @param {Object} movement - Datos del movimiento
 */
async function notifyMovementWebhook(movement) {
    try {
        // Obtener estadísticas actualizadas para enviar el saldo real después del movimiento
        // getStatistics() está definido en movements.js y es accesible globalmente
        let balanceAfter = 0;
        try {
            const stats = await getStatistics();
            balanceAfter = stats.balance;
        } catch (e) {
            console.warn('No se pudo obtener el saldo actualizado para el webhook');
        }

        // Crear FormData para enviar como piezas individuales
        const formData = new FormData();
        formData.append('id', movement.id || '');
        formData.append('tipo', movement.tipo || '');
        formData.append('monto', movement.monto || 0);
        formData.append('saldo_despues', balanceAfter); // Nuevo campo solicitado
        formData.append('motivo', movement.motivo || '');
        formData.append('url', movement.comprobante_url || '');
        formData.append('fecha', movement.fecha || new Date().toISOString());
        
        // Incluir info del usuario (usando AppState o el objeto movement)
        const usuarioNombre = movement.daviplata_usuarios?.nombre || AppState.userProfile?.nombre || '';
        const usuarioEmail = movement.daviplata_usuarios?.email || AppState.userProfile?.email || '';
        
        formData.append('usuario_nombre', usuarioNombre);
        formData.append('usuario_email', usuarioEmail);
        
        // JID previo si existe (útil para edición/notificaciones manuales)
        if (movement.remote_jid) {
            formData.append('remote_jid', movement.remote_jid);
        }

        // Usar mode: 'cors' para n8n si es necesario leer la respuesta
        // Cambiar a mode: 'cors' si el webhook soporta OPTIONS
        const response = await fetch(CONFIG.WEBHOOK_MOVEMENT, {
            method: 'POST',
            body: formData
        });

        // Intentar parsear respuesta si es exitosa
        if (response.ok) {
            const result = await response.json();
            console.log('Respuesta del webhook:', result);

            // Si recibimos un ID de mensaje o remoteJid, actualizar el movimiento en Supabase
            if (result.id || result.remoteJid) {
                await updateMovement(movement.id, { 
                    idmessage: result.id || null,
                    remote_jid: result.remoteJid || null
                });
                console.log('Datos del webhook guardados:', { id: result.id, jid: result.remoteJid });
            }
        }

        console.log('Webhook notificado exitosamente');
    } catch (error) {
        console.warn('Error notificando webhook:', error.message);
    }
}

/**
 * Notifica la verificación de un movimiento al segundo webhook
 * Específicamente solicitado para cuando el admin verifica manualmente
 * @param {Object} movement - Datos del movimiento
 */
async function notifyVerificationWebhook(movement) {
    try {
        if (!movement.idmessage || !movement.remote_jid) {
            console.warn('Movimiento sin idmessage o remote_jid, no se puede notificar verificación');
            return;
        }

        // Formatear número de destinatario
        // Ejemplo: 593962248046@s.whatsapp.net -> +593962248046
        const jid = movement.remote_jid;
        const phone = jid.split('@')[0];
        const formattedPhone = `+${phone}`;

        const formData = new FormData();
        formData.append('idmessage', movement.idmessage);
        formData.append('numero_destinatario', formattedPhone);
        
        // Datos adicionales que podrían ser útiles
        formData.append('id_movimiento', movement.id);
        formData.append('monto', movement.monto);
        formData.append('tipo', movement.tipo);

        console.log('Enviando webhook de verificación:', {
            idmessage: movement.idmessage,
            numero_destinatario: formattedPhone
        });

        const response = await fetch(CONFIG.WEBHOOK_VERIFY, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            console.log('Webhook de verificación enviado con éxito');
        } else {
            console.warn('Fallo al enviar webhook de verificación:', response.statusText);
        }
    } catch (error) {
        console.error('Error enviando webhook de verificación:', error);
    }
}

/**
 * Notifica la "eliminación" de un mensaje anterior al editar un movimiento
 * para que el webhook pueda borrar el mensaje de WhatsApp previo.
 * @param {Object} movement - Datos del movimiento (antes de ser actualizado)
 */
async function notifyDeletionWebhook(movement) {
    try {
        if (!movement.idmessage || !movement.remote_jid) {
            console.warn('Movimiento sin idmessage o remote_jid, no se puede notificar eliminación');
            return;
        }

        // Para el webhook de ELIMINACIÓN, enviamos el remote_jid tal cual (con @s.whatsapp.net)
        const jid = movement.remote_jid;

        const formData = new FormData();
        formData.append('idmessage', movement.idmessage);
        formData.append('numero_destinatario', jid); // Enviamos el JID completo según requerimiento
        formData.append('id_movimiento', movement.id);
        formData.append('monto', movement.monto);
        formData.append('tipo', movement.tipo);

        console.log('Enviando webhook de eliminación (con JID completo):', {
            idmessage: movement.idmessage,
            remote_jid: jid
        });

        const response = await fetch(CONFIG.WEBHOOK_DELETE, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            console.log('Webhook de eliminación enviado con éxito');
        }
    } catch (error) {
        console.error('Error enviando webhook de eliminación:', error);
    }
}

/**
 * Lee un archivo como Data URL para preview
 */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Error al leer archivo'));
        reader.readAsDataURL(file);
    });
}
