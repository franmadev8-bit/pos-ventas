-- =====================================================================
-- POS Ventas — esquema inicial de V1
-- Montos en centavos (INTEGER). Cantidades en milésimas (INTEGER).
-- Alícuotas en puntos básicos (2100 = 21,00 %). Fechas ISO 8601 UTC.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Identidad y configuración
-- ---------------------------------------------------------------------

CREATE TABLE comercio (
  id                   TEXT    PRIMARY KEY,
  fila_unica           INTEGER NOT NULL DEFAULT 1 CHECK (fila_unica = 1) UNIQUE,
  razon_social         TEXT    NOT NULL,
  nombre_fantasia      TEXT,
  domicilio            TEXT,
  localidad            TEXT,
  provincia            TEXT,
  telefono             TEXT,
  condicion_iva        TEXT    CHECK (condicion_iva IS NULL OR condicion_iva IN
                                 ('RESPONSABLE_INSCRIPTO','MONOTRIBUTO','EXENTO')),
  cuit                 TEXT,
  ingresos_brutos      TEXT,
  inicio_actividades   TEXT,
  punto_venta_default  INTEGER,
  creado_en            TEXT    NOT NULL,
  actualizado_en       TEXT    NOT NULL
);

CREATE TABLE caja (
  id             TEXT    PRIMARY KEY,
  fila_unica     INTEGER NOT NULL DEFAULT 1 CHECK (fila_unica = 1) UNIQUE,
  nombre         TEXT    NOT NULL,
  creado_en      TEXT    NOT NULL,
  actualizado_en TEXT    NOT NULL
);

CREATE TABLE usuario (
  id             TEXT    PRIMARY KEY,
  nombre         TEXT    NOT NULL,
  rol            TEXT    NOT NULL DEFAULT 'dueno' CHECK (rol IN ('dueno','cajero')),
  pin_hash       TEXT,
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en      TEXT    NOT NULL,
  actualizado_en TEXT    NOT NULL
);

CREATE TABLE configuracion (
  clave          TEXT PRIMARY KEY,
  valor          TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE secuencia (
  nombre TEXT    PRIMARY KEY,
  valor  INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------

CREATE TABLE categoria (
  id             TEXT    PRIMARY KEY,
  nombre         TEXT    NOT NULL,
  nombre_norm    TEXT    NOT NULL,
  orden          INTEGER NOT NULL DEFAULT 0,
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en      TEXT    NOT NULL,
  actualizado_en TEXT    NOT NULL
);
CREATE UNIQUE INDEX ux_categoria_nombre ON categoria(nombre_norm) WHERE activo = 1;

CREATE TABLE producto (
  id                        TEXT    PRIMARY KEY,
  categoria_id              TEXT    REFERENCES categoria(id) ON DELETE SET NULL,
  descripcion               TEXT    NOT NULL,
  descripcion_norm          TEXT    NOT NULL,
  unidad                    TEXT    NOT NULL DEFAULT 'unidad' CHECK (unidad IN ('unidad','kg','paquete')),
  costo_centavos            INTEGER CHECK (costo_centavos IS NULL OR costo_centavos >= 0),
  precio_venta_centavos     INTEGER NOT NULL CHECK (precio_venta_centavos >= 0),
  precio_mayorista_centavos INTEGER CHECK (precio_mayorista_centavos IS NULL
                                           OR precio_mayorista_centavos >= 0),
  alicuota_iva_bp           INTEGER NOT NULL DEFAULT 2100
                              CHECK (alicuota_iva_bp IN (0, 250, 500, 1050, 2100, 2700)),
  controla_stock            INTEGER NOT NULL DEFAULT 0 CHECK (controla_stock IN (0,1)),
  activo                    INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en                 TEXT    NOT NULL,
  actualizado_en            TEXT    NOT NULL
);
CREATE INDEX ix_producto_descripcion_norm ON producto(descripcion_norm);
CREATE INDEX ix_producto_categoria        ON producto(categoria_id);
CREATE INDEX ix_producto_activo           ON producto(activo, descripcion_norm);

CREATE TABLE producto_codigo (
  id          TEXT    PRIMARY KEY,
  producto_id TEXT    NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  codigo      TEXT    NOT NULL,
  tipo        TEXT    NOT NULL DEFAULT 'ean' CHECK (tipo IN ('ean','interno','balanza')),
  activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en   TEXT    NOT NULL
);
CREATE UNIQUE INDEX ux_producto_codigo   ON producto_codigo(codigo) WHERE activo = 1;
CREATE INDEX ix_producto_codigo_producto ON producto_codigo(producto_id);

-- Stock por movimientos (regla 4): el saldo NUNCA es un campo de producto,
-- es la suma de esta tabla. En V1 solo se escriben 'inicial' y 'ajuste', desde
-- el formulario de producto. Las ventas empiezan a descontar mas adelante.
CREATE TABLE stock_movimiento (
  id                      TEXT    PRIMARY KEY,
  producto_id             TEXT    NOT NULL REFERENCES producto(id),
  tipo                    TEXT    NOT NULL CHECK (tipo IN
                            ('inicial','ajuste','venta','anulacion','compra','merma','recuento')),
  cantidad_milesimas      INTEGER NOT NULL CHECK (cantidad_milesimas <> 0),
  costo_unitario_centavos INTEGER,
  origen_tipo             TEXT,
  origen_id               TEXT,
  motivo                  TEXT,
  usuario_id              TEXT    NOT NULL REFERENCES usuario(id),
  creado_en               TEXT    NOT NULL
);
CREATE INDEX ix_stock_movimiento_producto ON stock_movimiento(producto_id);
CREATE INDEX ix_stock_movimiento_fecha    ON stock_movimiento(creado_en);

CREATE TRIGGER trg_stock_movimiento_no_update BEFORE UPDATE ON stock_movimiento
BEGIN SELECT RAISE(ABORT, 'Los movimientos de stock son inmutables.'); END;
CREATE TRIGGER trg_stock_movimiento_no_delete BEFORE DELETE ON stock_movimiento
BEGIN SELECT RAISE(ABORT, 'Los movimientos de stock son inmutables.'); END;

CREATE VIEW v_stock_saldo AS
SELECT producto_id, SUM(cantidad_milesimas) AS saldo_milesimas
  FROM stock_movimiento
 GROUP BY producto_id;

CREATE TABLE medio_pago (
  id             TEXT    PRIMARY KEY,
  nombre         TEXT    NOT NULL,
  -- 'tarjeta' es el medio unico que se usa en el mostrador: al comerciante le
  -- importa que entro por posnet, no si fue debito o credito. 'debito' y
  -- 'credito' quedan admitidos para el que quiera separarlos: es una fila mas
  -- en esta tabla, sin tocar codigo. 'cuenta_corriente' es el fiado de V3.
  tipo           TEXT    NOT NULL CHECK (tipo IN
                    ('efectivo','tarjeta','debito','credito','transferencia',
                     'qr','cuenta_corriente','otro')),
  afecta_arqueo  INTEGER NOT NULL DEFAULT 0 CHECK (afecta_arqueo IN (0,1)),
  permite_vuelto INTEGER NOT NULL DEFAULT 0 CHECK (permite_vuelto IN (0,1)),
  orden          INTEGER NOT NULL DEFAULT 0,
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en      TEXT    NOT NULL,
  actualizado_en TEXT    NOT NULL
);

-- ---------------------------------------------------------------------
-- Turno de caja
-- ---------------------------------------------------------------------

CREATE TABLE caja_sesion (
  id                       TEXT    PRIMARY KEY,
  caja_id                  TEXT    NOT NULL REFERENCES caja(id),
  estado                   TEXT    NOT NULL CHECK (estado IN ('abierta','cerrada')),
  usuario_apertura_id      TEXT    NOT NULL REFERENCES usuario(id),
  abierta_en               TEXT    NOT NULL,
  fondo_inicial_centavos   INTEGER NOT NULL CHECK (fondo_inicial_centavos >= 0),

  usuario_cierre_id        TEXT    REFERENCES usuario(id),
  cerrada_en               TEXT,
  ventas_efectivo_centavos INTEGER,
  ingresos_centavos        INTEGER,
  egresos_centavos         INTEGER,
  esperado_centavos        INTEGER,
  contado_centavos         INTEGER,
  diferencia_centavos      INTEGER,
  total_vendido_centavos   INTEGER,
  cantidad_tickets         INTEGER,
  observaciones_cierre     TEXT,

  CHECK (
    (estado = 'abierta' AND cerrada_en IS NULL AND esperado_centavos IS NULL)
    OR
    (estado = 'cerrada' AND cerrada_en IS NOT NULL
                        AND ventas_efectivo_centavos IS NOT NULL
                        AND ingresos_centavos        IS NOT NULL
                        AND egresos_centavos         IS NOT NULL
                        AND esperado_centavos        IS NOT NULL
                        AND contado_centavos         IS NOT NULL
                        AND diferencia_centavos = contado_centavos - esperado_centavos
                        AND esperado_centavos = fondo_inicial_centavos
                                              + ventas_efectivo_centavos
                                              + ingresos_centavos
                                              - egresos_centavos
                        AND (diferencia_centavos = 0
                             OR (observaciones_cierre IS NOT NULL
                                 AND length(trim(observaciones_cierre)) > 0)))
  )
);
CREATE UNIQUE INDEX ux_caja_sesion_abierta ON caja_sesion(caja_id) WHERE estado = 'abierta';
CREATE INDEX        ix_caja_sesion_fecha   ON caja_sesion(abierta_en);

CREATE TABLE caja_sesion_cierre_medio (
  id                TEXT    PRIMARY KEY,
  caja_sesion_id    TEXT    NOT NULL REFERENCES caja_sesion(id) ON DELETE CASCADE,
  medio_pago_id     TEXT    NOT NULL REFERENCES medio_pago(id),
  medio_pago_nombre TEXT    NOT NULL,
  total_centavos    INTEGER NOT NULL,
  cantidad_pagos    INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_cierre_medio ON caja_sesion_cierre_medio(caja_sesion_id, medio_pago_id);

CREATE TABLE movimiento_caja (
  id             TEXT    PRIMARY KEY,
  caja_sesion_id TEXT    NOT NULL REFERENCES caja_sesion(id),
  tipo           TEXT    NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  concepto       TEXT    NOT NULL,
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
  usuario_id     TEXT    NOT NULL REFERENCES usuario(id),
  creado_en      TEXT    NOT NULL
);
CREATE INDEX ix_movimiento_caja_sesion ON movimiento_caja(caja_sesion_id);

-- ---------------------------------------------------------------------
-- Venta — inmutable
-- ---------------------------------------------------------------------

CREATE TABLE venta (
  id                     TEXT    PRIMARY KEY,
  caja_id                TEXT    NOT NULL REFERENCES caja(id),
  caja_sesion_id         TEXT    NOT NULL REFERENCES caja_sesion(id),
  usuario_id             TEXT    NOT NULL REFERENCES usuario(id),
  tipo                   TEXT    NOT NULL CHECK (tipo IN ('venta','anulacion')),
  venta_anulada_id       TEXT    REFERENCES venta(id),
  motivo                 TEXT,

  ticket_numero          INTEGER NOT NULL,
  fecha                  TEXT    NOT NULL,

  subtotal_centavos      INTEGER NOT NULL,
  descuento_centavos     INTEGER NOT NULL DEFAULT 0,
  total_centavos         INTEGER NOT NULL,

  -- Fiscal: lo asigna ARCA en V3. Nunca se mezcla con ticket_numero.
  comprobante_tipo       TEXT,
  punto_venta            INTEGER,
  comprobante_numero     INTEGER,
  cae                    TEXT,
  cae_vencimiento        TEXT,
  condicion_iva_comercio TEXT,
  condicion_iva_cliente  TEXT,
  cliente_doc_tipo       TEXT CHECK (cliente_doc_tipo IS NULL
                                     OR cliente_doc_tipo IN ('CUIT','CUIL','DNI','SD')),
  cliente_doc_numero     TEXT,
  cliente_razon_social   TEXT,

  CHECK (total_centavos = subtotal_centavos - descuento_centavos),
  CHECK (tipo = 'anulacion' OR venta_anulada_id IS NULL),
  CHECK (tipo = 'venta'     OR venta_anulada_id IS NOT NULL),
  CHECK (tipo = 'venta'     OR total_centavos <= 0),
  CHECK (tipo = 'anulacion' OR total_centavos >= 0),
  CHECK (tipo = 'venta'     OR (motivo IS NOT NULL AND length(trim(motivo)) > 0))
);
CREATE UNIQUE INDEX ux_venta_ticket  ON venta(caja_id, ticket_numero);
CREATE UNIQUE INDEX ux_venta_anulada ON venta(venta_anulada_id) WHERE venta_anulada_id IS NOT NULL;
CREATE UNIQUE INDEX ux_venta_fiscal  ON venta(punto_venta, comprobante_tipo, comprobante_numero)
  WHERE comprobante_numero IS NOT NULL;
CREATE INDEX ix_venta_fecha  ON venta(fecha);
CREATE INDEX ix_venta_sesion ON venta(caja_sesion_id);

CREATE TABLE venta_linea (
  id                       TEXT    PRIMARY KEY,
  venta_id                 TEXT    NOT NULL REFERENCES venta(id),
  orden                    INTEGER NOT NULL,
  tipo_linea               TEXT    NOT NULL DEFAULT 'producto'
                             CHECK (tipo_linea IN ('producto','generica','ajuste_redondeo','recargo')),
  producto_id              TEXT    REFERENCES producto(id),

  -- Copia al momento de la venta. Jamás se resuelve por la FK al producto.
  descripcion              TEXT    NOT NULL,
  unidad                   TEXT    NOT NULL CHECK (unidad IN ('unidad','kg','paquete')),
  cantidad_milesimas       INTEGER NOT NULL CHECK (cantidad_milesimas <> 0),
  origen_precio            TEXT    CHECK (origen_precio IS NULL
                                          OR origen_precio IN ('menor','mayor','manual')),
  precio_unitario_centavos INTEGER NOT NULL,
  precio_lista_centavos    INTEGER,
  costo_unitario_centavos  INTEGER,
  alicuota_iva_bp          INTEGER NOT NULL,
  importe_centavos         INTEGER NOT NULL,

  CHECK ((tipo_linea = 'producto') = (producto_id    IS NOT NULL)),
  CHECK ((tipo_linea = 'producto') = (origen_precio  IS NOT NULL)),
  CHECK ((tipo_linea = 'producto') = (precio_lista_centavos IS NOT NULL))
);
CREATE UNIQUE INDEX ux_venta_linea_orden ON venta_linea(venta_id, orden);
CREATE INDEX        ix_venta_linea_venta ON venta_linea(venta_id);
CREATE INDEX        ix_venta_linea_prod  ON venta_linea(producto_id);

CREATE TABLE venta_pago (
  id                TEXT    PRIMARY KEY,
  venta_id          TEXT    NOT NULL REFERENCES venta(id),
  orden             INTEGER NOT NULL,
  medio_pago_id     TEXT    NOT NULL REFERENCES medio_pago(id),
  medio_pago_nombre TEXT    NOT NULL,
  medio_pago_tipo   TEXT    NOT NULL,
  afecta_arqueo     INTEGER NOT NULL CHECK (afecta_arqueo IN (0,1)),
  monto_centavos    INTEGER NOT NULL CHECK (monto_centavos <> 0),
  -- Sólo en pagos en efectivo. El vuelto es del pago, no de la venta.
  recibido_centavos INTEGER,
  vuelto_centavos   INTEGER,

  -- Número de autorización o cupón que devuelve el POSNET. Sirve para conciliar
  -- contra la liquidación de la tarjeta y para reclamar un contracargo. Es un
  -- dato que el cajero copia a mano: siempre opcional, nunca bloquea el cobro.
  referencia        TEXT,

  CHECK ((recibido_centavos IS NULL) = (vuelto_centavos IS NULL)),
  CHECK (recibido_centavos IS NULL
         OR vuelto_centavos = recibido_centavos - monto_centavos)
);
CREATE UNIQUE INDEX ux_venta_pago_orden ON venta_pago(venta_id, orden);
CREATE INDEX        ix_venta_pago_venta ON venta_pago(venta_id);

-- ---------------------------------------------------------------------
-- Inmutabilidad, forzada por el motor
-- ---------------------------------------------------------------------

CREATE TRIGGER trg_venta_no_delete
BEFORE DELETE ON venta
BEGIN SELECT RAISE(ABORT, 'Las ventas no se borran. Registra una anulacion.'); END;

CREATE TRIGGER trg_venta_campos_inmutables
BEFORE UPDATE ON venta
FOR EACH ROW
WHEN NEW.caja_id            IS NOT OLD.caja_id
  OR NEW.caja_sesion_id     IS NOT OLD.caja_sesion_id
  OR NEW.usuario_id         IS NOT OLD.usuario_id
  OR NEW.tipo               IS NOT OLD.tipo
  OR NEW.venta_anulada_id   IS NOT OLD.venta_anulada_id
  OR NEW.motivo             IS NOT OLD.motivo
  OR NEW.ticket_numero      IS NOT OLD.ticket_numero
  OR NEW.fecha              IS NOT OLD.fecha
  OR NEW.subtotal_centavos  IS NOT OLD.subtotal_centavos
  OR NEW.descuento_centavos IS NOT OLD.descuento_centavos
  OR NEW.total_centavos     IS NOT OLD.total_centavos
  OR (OLD.cae                IS NOT NULL AND NEW.cae                IS NOT OLD.cae)
  OR (OLD.cae_vencimiento    IS NOT NULL AND NEW.cae_vencimiento    IS NOT OLD.cae_vencimiento)
  OR (OLD.comprobante_tipo   IS NOT NULL AND NEW.comprobante_tipo   IS NOT OLD.comprobante_tipo)
  OR (OLD.punto_venta        IS NOT NULL AND NEW.punto_venta        IS NOT OLD.punto_venta)
  OR (OLD.comprobante_numero IS NOT NULL AND NEW.comprobante_numero IS NOT OLD.comprobante_numero)
BEGIN SELECT RAISE(ABORT, 'venta: campo inmutable'); END;

CREATE TRIGGER trg_venta_linea_no_update BEFORE UPDATE ON venta_linea
BEGIN SELECT RAISE(ABORT, 'venta_linea es inmutable'); END;
CREATE TRIGGER trg_venta_linea_no_delete BEFORE DELETE ON venta_linea
BEGIN SELECT RAISE(ABORT, 'venta_linea es inmutable'); END;
CREATE TRIGGER trg_venta_pago_no_update  BEFORE UPDATE ON venta_pago
BEGIN SELECT RAISE(ABORT, 'venta_pago es inmutable'); END;
CREATE TRIGGER trg_venta_pago_no_delete  BEFORE DELETE ON venta_pago
BEGIN SELECT RAISE(ABORT, 'venta_pago es inmutable'); END;

CREATE TRIGGER trg_caja_sesion_cerrada
BEFORE UPDATE ON caja_sesion
FOR EACH ROW WHEN OLD.estado = 'cerrada'
BEGIN SELECT RAISE(ABORT, 'El turno ya esta cerrado.'); END;

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------

CREATE VIEW v_venta_vigente AS
SELECT v.id, v.caja_id, v.caja_sesion_id, v.usuario_id, v.tipo,
       v.ticket_numero, v.fecha, v.subtotal_centavos,
       v.descuento_centavos, v.total_centavos
FROM venta v
WHERE v.tipo = 'venta'
  AND NOT EXISTS (SELECT 1 FROM venta a WHERE a.venta_anulada_id = v.id);

CREATE VIEW v_turno_efectivo AS
SELECT s.id AS caja_sesion_id,
       s.fondo_inicial_centavos,
       COALESCE((SELECT SUM(p.monto_centavos)
                 FROM venta_pago p JOIN venta v ON v.id = p.venta_id
                 WHERE v.caja_sesion_id = s.id AND p.afecta_arqueo = 1), 0)
         AS ventas_efectivo_centavos,
       COALESCE((SELECT SUM(m.monto_centavos) FROM movimiento_caja m
                 WHERE m.caja_sesion_id = s.id AND m.tipo = 'ingreso'), 0)
         AS ingresos_centavos,
       COALESCE((SELECT SUM(m.monto_centavos) FROM movimiento_caja m
                 WHERE m.caja_sesion_id = s.id AND m.tipo = 'egreso'), 0)
         AS egresos_centavos
FROM caja_sesion s;

-- ---------------------------------------------------------------------
-- Semilla
-- ---------------------------------------------------------------------

INSERT INTO comercio (id, razon_social, creado_en, actualizado_en) VALUES
  ('00000000-0000-4000-8000-000000000001', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO caja (id, nombre, creado_en, actualizado_en) VALUES
  ('00000000-0000-4000-8000-000000000002', 'Caja 1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO usuario (id, nombre, rol, creado_en, actualizado_en) VALUES
  ('00000000-0000-4000-8000-000000000003', 'Dueno', 'dueno', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO secuencia (nombre, valor) VALUES
  ('ticket:00000000-0000-4000-8000-000000000002', 0);

INSERT INTO medio_pago (id, nombre, tipo, afecta_arqueo, permite_vuelto, orden, creado_en, actualizado_en) VALUES
  ('00000000-0000-4000-8000-000000000010', 'Efectivo',      'efectivo',      1, 1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000011', 'Tarjeta',       'tarjeta',       0, 0, 2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000013', 'Transferencia', 'transferencia', 0, 0, 3, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000014', 'QR',            'qr',            0, 0, 4, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO configuracion (clave, valor, actualizado_en) VALUES
  ('caja_actual_id',      '00000000-0000-4000-8000-000000000002', '2026-01-01T00:00:00.000Z'),
  ('usuario_actual_id',   '00000000-0000-4000-8000-000000000003', '2026-01-01T00:00:00.000Z'),
  ('alicuota_iva_default','2100',                                 '2026-01-01T00:00:00.000Z');
