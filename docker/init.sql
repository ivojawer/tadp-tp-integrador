-- DDL para el esquema logístico

-- Eliminar y re-crear el esquema public para asegurar que se borren todos los datos y objetos existentes
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
COMMENT ON SCHEMA public IS 'standard public schema';

CREATE TABLE IF NOT EXISTS usuarios (
  legajo VARCHAR(50) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS vehiculos (
  id SERIAL PRIMARY KEY,
  modelo VARCHAR(255) NOT NULL,
  capacidad_volumen DOUBLE PRECISION NOT NULL,
  capacidad_peso DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS productos (
  sku VARCHAR(100) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  marca VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS ordenes (
  id SERIAL PRIMARY KEY,
  cliente_nombre VARCHAR(255) NOT NULL,
  cliente_direccion VARCHAR(255) NOT NULL,
  estado VARCHAR(50) NOT NULL DEFAULT 'Pedida',
  fecha_completada TIMESTAMPTZ NULL,
  repartidor_legajo VARCHAR(50) NULL REFERENCES usuarios(legajo) ON DELETE SET NULL,
  vehiculo_id INTEGER NULL REFERENCES vehiculos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS items_pedidos (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  producto_sku VARCHAR(100) NOT NULL REFERENCES productos(sku) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  producto_sku VARCHAR(100) NOT NULL REFERENCES productos(sku) ON DELETE RESTRICT,
  estado_fisico VARCHAR(50) NOT NULL,
  orden_id INTEGER NULL REFERENCES ordenes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS geo_logs (
  id SERIAL PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
  latitud DOUBLE PRECISION NOT NULL,
  longitud DOUBLE PRECISION NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes(estado);
CREATE INDEX IF NOT EXISTS idx_items_pedidos_orden ON items_pedidos(orden_id);
CREATE INDEX IF NOT EXISTS idx_items_orden ON items(orden_id);
CREATE INDEX IF NOT EXISTS idx_geo_logs_vehiculo ON geo_logs(vehiculo_id);

-- Datos iniciales (Seeds)
INSERT INTO usuarios (legajo, nombre, email, password)
VALUES 
  ('REP-101', 'Juan Pérez', 'juan.perez@logistica.local', 'password123'),
  ('REP-102', 'María López', 'maria.lopez@logistica.local', 'password123')
ON CONFLICT (legajo) DO NOTHING;

INSERT INTO vehiculos (id, modelo, capacidad_volumen, capacidad_peso)
OVERRIDING SYSTEM VALUE
VALUES 
  (1, 'Renault Kangoo', 3.0, 650.0),
  (2, 'Mercedes Benz Sprinter', 10.5, 1500.0)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('vehiculos', 'id'), COALESCE(MAX(id), 1)) FROM vehiculos;

INSERT INTO productos (sku, nombre, descripcion, marca)
VALUES 
  ('PROD-001', 'Caja de Herramientas 50 piezas', 'Set completo de llaves y destornilladores', 'Stanley'),
  ('PROD-002', 'Taladro Percutor Inalámbrico', 'Taladro 18V con dos baterías', 'Bosch'),
  ('PROD-003', 'Amoladora Angular 820W', 'Amoladora para corte y desbaste', 'DeWalt')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO items (producto_sku, estado_fisico, orden_id)
VALUES 
  ('PROD-001', 'Disponible', NULL),
  ('PROD-001', 'Disponible', NULL),
  ('PROD-001', 'Disponible', NULL),
  ('PROD-001', 'Disponible', NULL),
  ('PROD-001', 'Disponible', NULL),
  ('PROD-002', 'Disponible', NULL),
  ('PROD-002', 'Disponible', NULL),
  ('PROD-002', 'Disponible', NULL),
  ('PROD-002', 'Disponible', NULL),
  ('PROD-002', 'Disponible', NULL),
  ('PROD-003', 'Disponible', NULL),
  ('PROD-003', 'Disponible', NULL),
  ('PROD-003', 'Disponible', NULL);
