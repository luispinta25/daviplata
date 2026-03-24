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
    return new Promise((resolve) => {
        // Solo comprimir imágenes
        if (!file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                // Dimensiones máximas agresivas — suficiente para un comprobante legible
                const MAX = 900;
                let { width, height } = img;

                if (width > height) {
                    if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
                } else {
                    if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
                }

                const canvas = document.createElement('canvas');
                canvas.width  = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // Intentar WebP primero (mejor ratio); caer en JPEG
                const tryWebP = typeof ImageData !== 'undefined';
                const quality = 0.72;

                const finish = (blob, mime) => {
                    if (!blob) { resolve(file); return; }
                    const savings = ((1 - blob.size / file.size) * 100).toFixed(1);
                    console.log(`Comprimido [${mime}]: ${formatBytes(file.size)} → ${formatBytes(blob.size)} (-${savings}%)`);
                    // Usar comprimido siempre que no sea mayor que el original
                    resolve(blob.size < file.size ? blob : file);
                };

                if (tryWebP) {
                    canvas.toBlob((webpBlob) => {
                        if (webpBlob && webpBlob.size < file.size) {
                            finish(webpBlob, 'image/webp');
                        } else {
                            // WebP no mejor — usar JPEG
                            canvas.toBlob((jpegBlob) => finish(jpegBlob, 'image/jpeg'), 'image/jpeg', quality);
                        }
                    }, 'image/webp', quality);
                } else {
                    canvas.toBlob((jpegBlob) => finish(jpegBlob, 'image/jpeg'), 'image/jpeg', quality);
                }
            };

            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };

        reader.onerror = () => resolve(file);
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
        // Comprimir solo imágenes; los PDFs se suben sin modificar
        // (el endpoint daviplataevopdf los envía como documento en WhatsApp)
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
 * Notifica un movimiento creado al webhook
 * Usa FormData para enviar los datos como "piezas" individuales (multipart/form-data)
 * Esto es más compatible con herramientas como n8n y evita problemas de CORS en modo simple
 * @param {Object} movement - Datos del movimiento
 * @param {boolean} isCorrection - Si el movimiento es una edición/corrección
 */
async function notifyMovementWebhook(movement, isCorrection = false, isPdf = false) {
    try {
        // Obtener estadísticas actualizadas para enviar el saldo real después del movimiento
        // getStatistics() está definido en movements.js y es accesible globalmente
        let stats = null;
        try {
            stats = await getStatistics();
        } catch (e) {
            console.warn('No se pudo obtener el saldo actualizado para el webhook');
        }

        const montoNum = parseFloat(movement.monto) || 0;
        const isIngreso = movement.tipo === 'INGRESO';
        const isVerified = movement.verified === 'VERIFICADO';

        // Lógica de Saldos Corregida basándose en el estado de verificación en Supabase
        // Supabase getStatistics() devuelve el balance sumando solo los VERIFICADOS
        let balanceBefore = 0;
        let balanceAfter = 0;
        const currentBalance = stats ? stats.balance : 0;

        if (isVerified) {
            // Si ya está Verificado, currentBalance YA LO INCLUYE
            balanceAfter = currentBalance;
            balanceBefore = isIngreso ? (balanceAfter - montoNum) : (balanceAfter + montoNum);
        } else {
            // Si está Pendiente, currentBalance NO LO INCLUYE
            balanceBefore = currentBalance;
            balanceAfter = isIngreso ? (balanceBefore + montoNum) : (balanceBefore - montoNum);
        }

        // Crear FormData para enviar como piezas individuales
        const formData = new FormData();
        formData.append('id', movement.id || '');
        formData.append('tipo', movement.tipo || '');
        formData.append('monto', movement.monto || 0);
        formData.append('saldo_despues', balanceAfter);
        formData.append('motivo', movement.motivo || '');
        formData.append('url', movement.comprobante_url || '');
        formData.append('fecha', movement.fecha || new Date().toISOString());
        
        // Incluir info del usuario (usando AppState o el objeto movement)
        const usuarioNombre = movement.daviplata_usuarios?.nombre || AppState.userProfile?.nombre || '';
        const usuarioEmail = movement.daviplata_usuarios?.email || AppState.userProfile?.email || '';
        
        formData.append('usuario_nombre', usuarioNombre);
        formData.append('usuario_email', usuarioEmail);
        formData.append('is_correction', isCorrection);
        
        // Construir CAPTION para WhatsApp
        let header;
        if (isCorrection) {
            if (isIngreso) {
                header = isVerified ? '*CORRECCIÓN DE INGRESO!!* 🔄 🟢' : '*CORRECCIÓN DE INGRESO PENDIENTE!!* 🔄 🟡';
            } else {
                header = '*CORRECCIÓN DE EGRESO!!* 🔄 🔴';
            }
        } else {
            if (isIngreso) {
                header = isVerified ? '*INGRESO REGISTRADO!!* 🟢 ⬆️' : '*INGRESO PENDIENTE DE VERIFICACIÓN!!* 🟡 ⏳';
            } else {
                header = '*EGRESO REGISTRADO!!* 🔴 ⬇️';
            }
        }

        const formattedBefore = typeof formatCurrency === 'function' ? formatCurrency(balanceBefore) : `$${balanceBefore}`;
        const formattedNext = typeof formatCurrency === 'function' ? formatCurrency(balanceAfter) : `$${balanceAfter}`;
        const formattedDate = typeof formatDate === 'function' ? formatDate(movement.fecha) : new Date(movement.fecha).toLocaleString();

        const correctionNote = isCorrection ? '\n*Nota:* Se ha corregido un error en el registro previo.\n' : '';

        let caption;
        if (isIngreso && !isVerified) {
            caption = 
`${header}
${correctionNote}

*Saldo actual:* ${formattedBefore}

Se ha registrado un nuevo ingreso que requiere validación. Los detalles son:
- *Monto:* ${typeof formatCurrency === 'function' ? formatCurrency(montoNum) : `$${montoNum}`}
- *Motivo:* ${movement.motivo}
- *Usuario:* ${usuarioNombre}
- *Fecha:* ${formattedDate}

*Saldo tentativo si se verifica:* ${formattedNext}`;
        } else {
            caption = 
`${header}
${correctionNote}
*Saldo antes del movimiento:* ${formattedBefore}

*Detalles del movimiento:*
- *Monto:* ${typeof formatCurrency === 'function' ? formatCurrency(montoNum) : `$${montoNum}`}
- *Motivo:* ${movement.motivo}
- *Usuario:* ${usuarioNombre}
- *Fecha:* ${formattedDate}

*Saldo después del movimiento:* ${formattedNext}`;
        }

        formData.append('caption', caption);
        // Asegurar que el saldo enviado sea el calculado
        formData.set('saldo_despues', balanceAfter);
        
        // JID previo si existe (útil para edición/notificaciones manuales)
        if (movement.remote_jid) {
            formData.append('remote_jid', movement.remote_jid);
        }

        const response = await fetch(isPdf ? CONFIG.WEBHOOK_MOVEMENT_PDF : CONFIG.WEBHOOK_MOVEMENT, {
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

        // Enviamos el remote_jid tal cual (con @s.whatsapp.net o @g.us) según requerimiento
        const jid = movement.remote_jid;

        const formData = new FormData();
        formData.append('idmessage', movement.idmessage);
        formData.append('numero_destinatario', jid);
        
        // Datos adicionales que podrían ser útiles
        formData.append('id_movimiento', movement.id);
        formData.append('monto', movement.monto);
        formData.append('tipo', movement.tipo);

        // Obtener saldo actualizado para ratificación
        let balanceNow = 0;
        try {
            const stats = await getStatistics();
            balanceNow = stats.balance;
        } catch (e) {
            console.warn('No se pudo obtener el saldo actualizado para verificación');
        }

        // Caption para verificación
        const formattedAmount = typeof formatCurrency === 'function' ? formatCurrency(movement.monto) : `$${movement.monto}`;
        const formattedBalance = typeof formatCurrency === 'function' ? formatCurrency(balanceNow) : `$${balanceNow}`;
        
        const caption = 
`*MOVIMIENTO VERIFICADO* ✅
---------------------------------------
Su registro ha sido validado satisfactoriamente por el Administrador.

*Detalles del Movimiento:*
- *ID:* _#${movement.id.toString().substring(0, 8)}..._
- *Tipo:* _${movement.tipo}_
- *Monto:* _${formattedAmount}_
- *Motivo:* ${movement.motivo || ''}

*Saldo Ratificado:* ${formattedBalance}

*Estado Actual:* El movimiento ya ha sido procesado y el balance actualizado.

*_DaviPlata - Control de Movimientos_*`;

        formData.append('caption', caption);

        console.log('Enviando webhook de verificación (sin imagen):', {
            idmessage: movement.idmessage,
            numero_destinatario: jid
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
