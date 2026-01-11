-- ============================================
-- DAVIPLATA - SCRIPTS DE MANTENIMIENTO
-- ============================================

-- ============================================
-- 1. LIMPIAR TODOS LOS MOVIMIENTOS (PRUEBAS)
-- ============================================
-- ⚠️ CUIDADO: Esto elimina TODOS los movimientos
DELETE FROM daviplata_movimientos;

-- Si quieres también resetear los IDs (opcional):
-- TRUNCATE daviplata_movimientos RESTART IDENTITY CASCADE;


-- ============================================
-- 2. LIMPIAR ARCHIVOS DEL BUCKET
-- ============================================
-- Los archivos en Storage NO se eliminan automáticamente.
-- Debes limpiarlos desde el panel de Supabase o con este script:

-- Listar archivos en el bucket (para ver qué hay):
-- SELECT * FROM storage.objects WHERE bucket_id = 'luispintapersonal';

-- Eliminar todos los archivos del bucket:
DELETE FROM storage.objects WHERE bucket_id = 'luispintapersonal';


-- ============================================
-- 3. TRIGGER PARA LIMPIAR STORAGE (AVANZADO)
-- ============================================
-- NOTA: Supabase Storage no soporta triggers automáticos
-- para eliminar archivos. La mejor opción es:
--   a) Usar Edge Functions
--   b) Limpiar manualmente desde el panel
--   c) Tarea programada (cron)
--
-- Sin embargo, podemos registrar los archivos a eliminar
-- en una tabla de "pendientes" y procesarla después:

-- Tabla para archivos pendientes de eliminar
CREATE TABLE IF NOT EXISTS daviplata_storage_cleanup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Función que registra archivos a eliminar cuando se borra un movimiento
CREATE OR REPLACE FUNCTION log_storage_cleanup()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el movimiento tenía comprobante, registrar para limpieza
  IF OLD.comprobante_url IS NOT NULL AND OLD.comprobante_url LIKE '%luispintapersonal%' THEN
    -- Extraer el path del archivo de la URL
    -- URL: https://lpsupabase.luispinta.com/storage/v1/object/public/luispintapersonal/daviplata/archivo.jpg
    -- Path: daviplata/archivo.jpg
    INSERT INTO daviplata_storage_cleanup (file_path)
    VALUES (
      regexp_replace(
        OLD.comprobante_url, 
        '^.*/luispintapersonal/', 
        ''
      )
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger que se ejecuta ANTES de eliminar un movimiento
CREATE TRIGGER on_movement_delete_cleanup
  BEFORE DELETE ON daviplata_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION log_storage_cleanup();


-- ============================================
-- 4. LIMPIAR ARCHIVOS REGISTRADOS (MANUAL)
-- ============================================
-- Ejecutar este script para ver archivos pendientes de eliminar:
-- SELECT * FROM daviplata_storage_cleanup;

-- Después de limpiarlos manualmente del bucket, vaciar la tabla:
-- DELETE FROM daviplata_storage_cleanup;


-- ============================================
-- 5. ELIMINAR UN MOVIMIENTO ESPECÍFICO (ADMIN)
-- ============================================
-- Para permitir eliminar movimientos (solo admin):
CREATE POLICY "admin_delete_movimientos" 
  ON daviplata_movimientos FOR DELETE 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daviplata_usuarios 
      WHERE auth_id = auth.uid() AND rol = 'admin'
    )
  );
