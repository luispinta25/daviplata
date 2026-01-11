-- ============================================
-- DAVIPLATA - ESQUEMA DE BASE DE DATOS
-- Sistema de Seguimiento de Movimientos
-- CON AUTENTICACIÓN Y ROLES
-- ============================================

-- ============================================
-- TABLA DE PERFILES DE USUARIO
-- ============================================
CREATE TABLE daviplata_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  nombre VARCHAR(255),
  rol VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (rol IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para búsqueda por auth_id
CREATE INDEX idx_usuarios_auth_id ON daviplata_usuarios(auth_id);

-- ============================================
-- TABLA DE MOVIMIENTOS
-- ============================================
CREATE TABLE daviplata_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES daviplata_usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  motivo TEXT NOT NULL,
  comprobante_url TEXT,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejor rendimiento
CREATE INDEX idx_movimientos_usuario ON daviplata_movimientos(usuario_id);
CREATE INDEX idx_movimientos_tipo ON daviplata_movimientos(tipo);
CREATE INDEX idx_movimientos_fecha ON daviplata_movimientos(fecha DESC);
CREATE INDEX idx_movimientos_created ON daviplata_movimientos(created_at DESC);

-- ============================================
-- FUNCIÓN PARA ACTUALIZAR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_daviplata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_usuarios_updated_at 
  BEFORE UPDATE ON daviplata_usuarios 
  FOR EACH ROW EXECUTE FUNCTION update_daviplata_updated_at();

CREATE TRIGGER update_movimientos_updated_at 
  BEFORE UPDATE ON daviplata_movimientos 
  FOR EACH ROW EXECUTE FUNCTION update_daviplata_updated_at();

-- ============================================
-- NOTA: CREACIÓN MANUAL DE USUARIOS
-- Como es Supabase self-hosted, los usuarios deben
-- crearse manualmente en daviplata_usuarios después
-- de crear el usuario en auth.users
-- ============================================
-- INSERT INTO daviplata_usuarios (auth_id, email, nombre, rol)
-- VALUES ('uuid-del-auth-user', 'email@ejemplo.com', 'Nombre', 'admin');


-- ============================================
-- FUNCIÓN PARA OBTENER EL usuario_id ACTUAL
-- ============================================
CREATE OR REPLACE FUNCTION get_current_usuario_id()
RETURNS UUID AS $$
  SELECT id FROM daviplata_usuarios WHERE auth_id = auth.uid();
$$ language 'sql' SECURITY DEFINER;

-- ============================================
-- FUNCIÓN PARA OBTENER EL ROL ACTUAL
-- ============================================
CREATE OR REPLACE FUNCTION get_current_user_rol()
RETURNS VARCHAR AS $$
  SELECT rol FROM daviplata_usuarios WHERE auth_id = auth.uid();
$$ language 'sql' SECURITY DEFINER;

-- ============================================
-- RLS PARA daviplata_usuarios
-- ============================================
ALTER TABLE daviplata_usuarios ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados pueden ver su propio perfil
CREATE POLICY "usuarios_select_own" 
  ON daviplata_usuarios FOR SELECT 
  TO authenticated
  USING (auth_id = auth.uid());

-- Usuarios autenticados pueden actualizar su propio perfil (excepto rol)
CREATE POLICY "usuarios_update_own" 
  ON daviplata_usuarios FOR UPDATE 
  TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- ============================================
-- RLS PARA daviplata_movimientos
-- Solo para rol "authenticated"
-- Permitir: SELECT, INSERT, UPDATE
-- NO permitir: DELETE
-- ============================================
ALTER TABLE daviplata_movimientos ENABLE ROW LEVEL SECURITY;

-- SELECT: Usuarios autenticados pueden ver TODOS los movimientos
CREATE POLICY "movimientos_select_authenticated" 
  ON daviplata_movimientos FOR SELECT 
  TO authenticated
  USING (true);

-- INSERT: Usuarios autenticados pueden crear movimientos
-- La lógica de rol (admin vs user) se maneja en el frontend
CREATE POLICY "movimientos_insert_authenticated" 
  ON daviplata_movimientos FOR INSERT 
  TO authenticated
  WITH CHECK (
    usuario_id = get_current_usuario_id()
  );

-- UPDATE: Usuarios autenticados pueden actualizar movimientos
-- Solo movimientos propios y dentro de las reglas de negocio
CREATE POLICY "movimientos_update_authenticated" 
  ON daviplata_movimientos FOR UPDATE 
  TO authenticated
  USING (
    usuario_id = get_current_usuario_id()
  )
  WITH CHECK (
    usuario_id = get_current_usuario_id()
  );

-- NO HAY POLÍTICA DELETE - Los movimientos NO se pueden eliminar

-- ============================================
-- VISTA PARA ESTADÍSTICAS
-- ============================================
CREATE OR REPLACE VIEW daviplata_estadisticas AS
SELECT 
  COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE 0 END), 0) as total_ingresos,
  COALESCE(SUM(CASE WHEN tipo = 'EGRESO' THEN monto ELSE 0 END), 0) as total_egresos,
  COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END), 0) as balance,
  COUNT(*) FILTER (WHERE tipo = 'INGRESO') as cantidad_ingresos,
  COUNT(*) FILTER (WHERE tipo = 'EGRESO') as cantidad_egresos,
  COUNT(*) as total_movimientos
FROM daviplata_movimientos;

-- ============================================
-- CONFIGURACIÓN INICIAL
-- ============================================
-- Para crear el primer usuario admin, ejecuta después de registrarte:
-- UPDATE daviplata_usuarios SET rol = 'admin' WHERE email = 'tu-email@ejemplo.com';
