# PLAN — V1 POS (escritorio, 100% local)

Estado: propuesta de planificación. **No hay código escrito todavía.** Requiere
aprobación del product owner antes de pasar a implementación.

Base sobre la que se planifica (leída del repo al 2026-09-01):

- `pos-ventas` es el template limpio de Tauri 2 + React 19 + TypeScript 5.8 + Vite 7.
- `src/` tiene solo `main.tsx`, `App.tsx` (el demo de `greet`), `App.css` y assets.
- `src-tauri/` tiene el `lib.rs` de ejemplo con el comando `greet`, el plugin
  `opener`, y una capability `default` con `core:default` + `opener:default`.
- `tsconfig.json` ya está en `strict: true` con `noUnusedLocals` y
  `noUnusedParameters`. Se mantiene y se le agrega `noUncheckedIndexedAccess`.
- No hay router, ni store, ni acceso a base, ni tests.

Todo lo del template (`greet`, logos, `App.css`) se elimina en el corte 0.

---

## 0. Punto de partida: cómo se accede a SQLite

La decisión por defecto es `tauri-plugin-sql`. Se toma, con una excepción
acotada y cerrada.

### Lo que resuelve bien el plugin

Lecturas y escrituras de una sola sentencia: catálogo, configuración, listados,
consultas de resumen. Trae el binding de parámetros, el pool y el motor de
migraciones (sqlx) sin escribir Rust.

Las opciones de conexión que necesitamos vienen por default en `SqliteConnectOptions`
de sqlx, que es lo que el plugin usa al parsear el connection string:
`journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout = 5s`.
Eso cubre "los datos sobreviven a un corte de luz" sin trabajo extra. **Hay que
verificarlo empíricamente en el corte 0** con `PRAGMA journal_mode; PRAGMA synchronous;
PRAGMA foreign_keys;` y dejar el resultado registrado, porque son defaults de una
dependencia transitiva, no un contrato.

### El motivo fuerte para bajar a Rust en un caso puntual

`tauri-plugin-sql` expone solo `execute` y `select`. **No expone transacciones.**
Y no se pueden emular mandando `BEGIN` / `COMMIT` como llamadas sueltas: el plugin
trabaja sobre un `SqlitePool`, así que dos `execute` consecutivos pueden caer en
conexiones distintas. El `BEGIN` quedaría abierto en una conexión y el `INSERT`
se escribiría fuera de transacción en otra.

Eso choca de frente con dos cosas no negociables:

- Criterio de correctitud: "todo lo que toca varias tablas va en transacción".
- Regla 12 (V3): la operación de negocio y su fila en `outbox` van en la misma
  transacción. Si el mecanismo transaccional no existe en V1, en V3 hay que
  reescribir toda la capa de escritura.

Una venta escribe en `venta` + N `venta_linea` + M `venta_pago` + `secuencia`.
Sin transacción, un corte de luz a mitad deja un ticket con la mitad de las
líneas. Es inaceptable en un sistema que toca plata.

### Decisión

Modelo híbrido, con una lista cerrada de comandos Rust:

| Operación | Vía |
|---|---|
| Todas las lecturas | plugin (`select`) |
| Escrituras de una sola tabla y una sola fila (ABM de producto, categoría, config, movimiento de caja) | plugin (`execute`) |
| `registrar_venta` (venta + líneas + pagos + secuencia de ticket) | comando Rust, transacción real |
| `registrar_anulacion` (venta espejo negativa + líneas + pagos, validando que la original no esté anulada) | comando Rust, transacción real |
| `cerrar_turno` (congelar totales en `caja_sesion` + `caja_sesion_cierre_medio`) | comando Rust, transacción real |
| `importar_productos` (miles de filas; por IPC de a una es inviable) | comando Rust, transacción real |
| `backup` / `restaurar` (necesita `VACUUM INTO` y reemplazo de archivo con la app cerrada sobre la base) | comando Rust |

Son 6 comandos. El resto de la app usa el plugin.

Ambos caminos quedan detrás de la **misma interfaz de repositorio**, así que los
servicios y los componentes no saben cuál se usó. Si mañana el plugin agrega
transacciones, se cambia la implementación del repositorio y nada más.

**Alternativa que descarto y por qué:** escribir *todo* en Rust y exponerlo por
`invoke`. Duplica el modelo de datos en dos lenguajes, obliga a tocar Rust para
agregar una columna, y no compra nada en las operaciones de una sola sentencia.

### Otro detalle del arranque

`crypto.randomUUID()` solo existe en secure context. En Windows, Tauri 2 sirve el
front desde `http://tauri.localhost`, que **no** siempre califica como tal según
la versión de WebView2. Para no depender de eso, los UUID se generan con la
dependencia `uuid` (v4) desde TypeScript, detrás de `lib/id.ts`. Se verifica en
el corte 0 y, si `crypto.randomUUID` está disponible, se usa como fast path
dentro de esa misma función.

### Dependencias a agregar

Frontend: `@tauri-apps/plugin-sql`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`,
`uuid`, y en dev `vitest`.

Rust: `tauri-plugin-sql` (feature `sqlite`), `tauri-plugin-dialog`,
`tauri-plugin-fs`, `sqlx`, `argon2` (hash del PIN), `uuid`, `chrono`.

Capabilities a sumar en `src-tauri/capabilities/default.json`: `sql:default`,
`dialog:default`, `fs:default` (acotado a los directorios de backup).

---

## 1. Estructura de carpetas

### 1.1 Frontend — `src/`

```
src/
  app/
    App.tsx                    shell: layout, teclas globales, error boundary
    Router.tsx                 máquina de pantallas (no react-router, ver §5)
    providers/
      SesionProvider.tsx       usuario logueado + turno de caja abierto
      RepositoriosProvider.tsx inyección de las implementaciones de repositorio
      ToastProvider.tsx        avisos no bloqueantes
    ErrorBoundary.tsx

  domain/                      TypeScript puro. Cero I/O, cero React.
    dinero.ts                  centavos: multiplicar, repartir, redondear
    cantidad.ts                milésimas: parseo, formato, validación
    venta.ts                   armado y validación de una venta en curso
    arqueo.ts                  cálculo de esperado / diferencia
    iva.ts                     neto y IVA a partir del precio con IVA (V3, ya definido)
    tipos.ts                   Centavos, Milesimas, Bp, Uuid, IsoUtc
    errores.ts                 ErrorDeNegocio con código y mensaje accionable

  db/
    cliente.ts                 wrapper sobre Database.load(), singleton
    migraciones.ts             lista y verificación de versión aplicada
    ejecutor.ts                interfaz Ejecutor (select/execute) + impl plugin
    comandos.ts                tipado de los 6 comandos Rust (invoke)
    mapeo.ts                   fila SQL -> entidad (y validación de enteros)

  repositories/
    contratos/                 SOLO interfaces y tipos de entrada/salida
      ...
    sqlite/                    implementaciones
      ...

  services/
    VentaService.ts
    CajaService.ts
    CatalogoService.ts
    ImportacionService.ts
    ResumenService.ts
    AuthService.ts
    ConfiguracionService.ts
    BackupService.ts

  hooks/                       adaptadores React sobre services. Nada de SQL acá.
    useVentaEnCurso.ts
    useTurnoActual.ts
    useBusquedaProducto.ts
    useLectorCodigoBarras.ts
    useAtajos.ts
    useAsync.ts

  features/                    una carpeta por pantalla
    acceso/
    venta/
      PantallaVenta.tsx
      componentes/
        LineasVenta.tsx
        TotalVenta.tsx
        BarraBusqueda.tsx
        ModalCobro.tsx
        ModalCantidad.tsx
        ModalVentaGenerica.tsx
    caja/
      PantallaAperturaTurno.tsx
      PantallaMovimientos.tsx
      PantallaCierreTurno.tsx
    tickets/
      PantallaTickets.tsx
      componentes/DetalleTicket.tsx
    catalogo/
      PantallaProductos.tsx
      PantallaProductoForm.tsx
      PantallaCategorias.tsx
      PantallaImportacion.tsx
    resumen/
      PantallaResumenDia.tsx
    configuracion/
      PantallaComercio.tsx
      PantallaBackup.tsx

  components/                  UI compartida, sin lógica de negocio
    Boton.tsx  Campo.tsx  CampoMoneda.tsx  CampoCantidad.tsx
    Modal.tsx  Tabla.tsx  Teclado.tsx  Badge.tsx  BarraEstado.tsx

  ui/
    tokens.css                 variables CSS (colores, espaciado, tipografía)
    base.css                   reset + tipografía + foco visible
    densidad.css               alturas de fila, inputs, tablas

  lib/
    id.ts                      uuid v4
    fecha.ts                   ahoraUtc(), aLocal(), inicioDelDiaUtc()
    formato.ts                 centavos -> "$ 1.234,50"; milésimas -> "1,250 kg"
    texto.ts                   normalizar() para búsqueda (mayúsculas, sin acentos)
    csv.ts                     parseo del archivo de importación

  test/
    setup.ts
    fixtures/

  main.tsx
  vite-env.d.ts
```

### 1.2 Backend de escritorio — `src-tauri/`

En V1 esto no es un backend de negocio: es la cáscara nativa y el dueño del
archivo SQLite.

```
src-tauri/
  Cargo.toml
  build.rs
  tauri.conf.json
  capabilities/
    default.json
  migrations/
    0001_v1_inicial.sql        embebida con include_str!
  src/
    main.rs
    lib.rs                     Builder, plugins, invoke_handler
    db/
      mod.rs
      pool.rs                  pool propio para los comandos transaccionales
      migraciones.rs           lista de Migration para tauri-plugin-sql
    comandos/
      mod.rs
      venta.rs                 registrar_venta, registrar_anulacion
      caja.rs                  cerrar_turno
      catalogo.rs              importar_productos
      backup.rs                backup, restaurar
      seguridad.rs             hash_pin, verificar_pin (argon2)
    dto/
      mod.rs                   structs serde espejo de los payloads
    error.rs                   error tipado que serializa a { codigo, mensaje }
```

### 1.3 Lo que NO se crea en V1

- No hay solución .NET. Cuando exista (V3) va en un repositorio aparte,
  `pos-api`, con `src/Pos.Api`, `Pos.Application`, `Pos.Domain`,
  `Pos.Infrastructure`. No se arma nada de eso ahora.
- No hay carpeta `sync/`, ni cliente HTTP, ni configuración de Supabase.
- No hay `public/` con assets del template (se limpia).

---

## 2. Esquema de base de datos

Archivo: `src-tauri/migrations/0001_v1_inicial.sql`. Migraciones versionadas,
numeradas, y **jamás se modifica una ya aplicada**. Un cambio es siempre un
archivo nuevo.

### 2.1 Convenciones que aplica todo el esquema

| Concepto | Decisión |
|---|---|
| ID | `TEXT` con UUID v4 generado en el cliente. Nunca autoincremental. |
| Plata | `INTEGER`, en centavos. Sufijo `_centavos`. Nunca `REAL`. |
| Cantidad | `INTEGER`, en milésimas. Sufijo `_milesimas`. `1000` = 1 unidad o 1 kg. |
| Alícuota IVA | `INTEGER` en puntos básicos. Sufijo `_bp`. `2100` = 21,00 %. |
| Fecha | `TEXT`, ISO 8601 UTC con `Z` (`2026-09-01T22:41:03.512Z`). |
| Booleano | `INTEGER` 0/1 con `CHECK`. |
| Soft delete | `activo INTEGER NOT NULL DEFAULT 1`. Nunca `DELETE` en entidades sincronizables. |
| Auditoría | `creado_en` y `actualizado_en` en toda entidad de catálogo/config. |
| Enums | `TEXT` con `CHECK (col IN (...))`. Legible en un dump, validado por el motor. |

**Regla de signo para anulaciones:** una anulación es una venta espejo con
**todos los montos en negativo** (total, subtotal, importes de línea y pagos).
Consecuencia: cualquier `SUM()` sobre `venta` da el neto sin casos especiales, y
el arqueo cierra a mano. No hay columna "anulada" en la venta original — sería
mutable y rompe la regla 5; el estado se deriva.

**Regla de redondeo (única en todo el sistema):** el importe de línea es
`redondear(precio_unitario_centavos × cantidad_milesimas / 1000)` con
redondeo de mitad hacia arriba en valor absoluto (half-up away from zero). Es el
**único** punto donde se redondea. El total es la suma exacta de los importes ya
redondeados. Ver §7, decisión abierta D1.

### 2.2 Tablas de V1

#### Configuración e identidad

```sql
CREATE TABLE comercio (
  id                   TEXT    PRIMARY KEY,
  fila_unica           INTEGER NOT NULL DEFAULT 1 CHECK (fila_unica = 1) UNIQUE,
  razon_social         TEXT    NOT NULL,
  nombre_fantasia      TEXT,
  domicilio            TEXT,
  localidad            TEXT,
  provincia            TEXT,
  telefono             TEXT,
  -- estructura fiscal: modelada desde V1, sin uso hasta V3
  condicion_iva        TEXT    CHECK (condicion_iva IS NULL OR condicion_iva IN
                                 ('RESPONSABLE_INSCRIPTO','MONOTRIBUTO','EXENTO','CONSUMIDOR_FINAL')),
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

-- Numeración interna del ticket. Se incrementa dentro de la misma transacción
-- que inserta la venta, con UPDATE ... RETURNING.
CREATE TABLE secuencia (
  nombre TEXT    PRIMARY KEY,
  valor  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE configuracion (
  clave          TEXT PRIMARY KEY,
  valor          TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE usuario (
  id             TEXT    PRIMARY KEY,
  nombre         TEXT    NOT NULL,
  rol            TEXT    NOT NULL DEFAULT 'dueno' CHECK (rol IN ('dueno','cajero')),
  pin_hash       TEXT,                     -- PHC string de argon2, salt incluido.
                                           -- NULL = todavía no se configuró: la
                                           -- pantalla de acceso no aparece.
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en      TEXT    NOT NULL,
  actualizado_en TEXT    NOT NULL
);
```

La migración `0001` siembra las tres filas: `comercio` con razón social vacía,
`caja` llamada "Caja 1" y `usuario` "Dueño" con `pin_hash` en NULL. De esa forma
las FK `NOT NULL` de `venta` y `caja_sesion` tienen a qué apuntar desde el primer
corte, y el wizard de primer uso completa filas existentes en lugar de crearlas.

`fila_unica` fuerza a nivel de motor que `comercio` y `caja` tengan exactamente
una fila. `usuario` admite varias filas desde el esquema aunque V1 use una sola:
la tabla ya está lista para los roles de V2 y no requiere migración.

#### Catálogo

```sql
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
  id                    TEXT    PRIMARY KEY,
  categoria_id          TEXT    REFERENCES categoria(id) ON DELETE SET NULL,
  descripcion           TEXT    NOT NULL,
  descripcion_norm      TEXT    NOT NULL,   -- mayúsculas sin acentos, para búsqueda
  unidad                TEXT    NOT NULL DEFAULT 'unidad' CHECK (unidad IN ('unidad','kg')),
  precio_venta_centavos INTEGER NOT NULL CHECK (precio_venta_centavos >= 0),  -- CON IVA
  costo_centavos        INTEGER CHECK (costo_centavos IS NULL OR costo_centavos >= 0),
  alicuota_iva_bp       INTEGER NOT NULL DEFAULT 2100
                          CHECK (alicuota_iva_bp IN (0, 250, 500, 1050, 2100, 2700)),
  controla_stock        INTEGER NOT NULL DEFAULT 0 CHECK (controla_stock IN (0,1)),  -- V2
  activo                INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en             TEXT    NOT NULL,
  actualizado_en        TEXT    NOT NULL
);
CREATE INDEX ix_producto_descripcion_norm ON producto(descripcion_norm);
CREATE INDEX ix_producto_categoria       ON producto(categoria_id);
CREATE INDEX ix_producto_activo          ON producto(activo, descripcion_norm);

CREATE TABLE producto_codigo (
  id          TEXT PRIMARY KEY,
  producto_id TEXT NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'ean' CHECK (tipo IN ('ean','interno','balanza')),
  activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en   TEXT NOT NULL
);
-- Único PARCIAL. Al desactivar un producto sus códigos pasan a activo = 0, y el
-- código queda libre para reasignarse. Pasa seguido: cambia el proveedor y el
-- mismo EAN vuelve con otro artículo. Un único global dejaría ese código
-- bloqueado para siempre y el kiosquero no tendría forma de destrabarlo.
CREATE UNIQUE INDEX ux_producto_codigo          ON producto_codigo(codigo) WHERE activo = 1;
CREATE INDEX        ix_producto_codigo_producto ON producto_codigo(producto_id);
```

`precio_venta_centavos` es el precio de góndola, **con IVA incluido** (regla 9).
El neto se calcula al facturar, en V3, con `domain/iva.ts`.

`descripcion_norm` se calcula en TypeScript (`lib/texto.ts`) y se persiste. La
búsqueda de V1 es `LIKE '%TERMINO%'` sobre esa columna: para un catálogo de
kiosco (menos de 10.000 productos) el scan es instantáneo. Si un comercio grande
lo hace lento, la salida es una tabla FTS5 con triggers de sincronización, en una
migración posterior. No se hace ahora.

#### Medios de pago

```sql
CREATE TABLE medio_pago (
  id             TEXT    PRIMARY KEY,
  nombre         TEXT    NOT NULL,
  tipo           TEXT    NOT NULL CHECK (tipo IN
                    ('efectivo','debito','credito','transferencia','qr','otro')),
  afecta_arqueo  INTEGER NOT NULL DEFAULT 0 CHECK (afecta_arqueo IN (0,1)),
  permite_vuelto INTEGER NOT NULL DEFAULT 0 CHECK (permite_vuelto IN (0,1)),
  orden          INTEGER NOT NULL DEFAULT 0,
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en      TEXT    NOT NULL,
  actualizado_en TEXT    NOT NULL
);
```

Seed en la migración: Efectivo (`afecta_arqueo=1`, `permite_vuelto=1`), Débito,
Crédito, Transferencia, QR / billetera virtual. Solo Efectivo entra al arqueo.

#### Turno de caja

```sql
CREATE TABLE caja_sesion (
  id                       TEXT    PRIMARY KEY,
  caja_id                  TEXT    NOT NULL REFERENCES caja(id),
  estado                   TEXT    NOT NULL CHECK (estado IN ('abierta','cerrada')),
  usuario_apertura_id      TEXT    NOT NULL REFERENCES usuario(id),
  abierta_en               TEXT    NOT NULL,
  fondo_inicial_centavos   INTEGER NOT NULL CHECK (fondo_inicial_centavos >= 0),

  -- Todo lo que sigue se escribe UNA vez, en el cierre, y queda congelado.
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
    (estado = 'abierta'  AND cerrada_en IS NULL AND esperado_centavos IS NULL)
    OR
    (estado = 'cerrada'  AND cerrada_en IS NOT NULL
                         -- Sin estos tres IS NOT NULL el CHECK no sirve: en SQLite
                         -- una condición que evalúa a NULL PASA. Si el servicio
                         -- olvidara alguno de los tres totales, la fórmula del
                         -- arqueo daría NULL y la base aceptaría el cierre.
                         AND ventas_efectivo_centavos IS NOT NULL
                         AND ingresos_centavos        IS NOT NULL
                         AND egresos_centavos         IS NOT NULL
                         AND esperado_centavos IS NOT NULL
                         AND contado_centavos  IS NOT NULL
                         AND diferencia_centavos = contado_centavos - esperado_centavos
                         AND esperado_centavos = fondo_inicial_centavos
                                               + ventas_efectivo_centavos
                                               + ingresos_centavos
                                               - egresos_centavos)
  )
);

-- Un solo turno abierto por caja. Lo garantiza el motor, no el código.
CREATE UNIQUE INDEX ux_caja_sesion_abierta ON caja_sesion(caja_id) WHERE estado = 'abierta';
CREATE INDEX        ix_caja_sesion_fecha   ON caja_sesion(abierta_en);

CREATE TABLE caja_sesion_cierre_medio (
  id                TEXT    PRIMARY KEY,
  caja_sesion_id    TEXT    NOT NULL REFERENCES caja_sesion(id) ON DELETE CASCADE,
  medio_pago_id     TEXT    NOT NULL REFERENCES medio_pago(id),
  medio_pago_nombre TEXT    NOT NULL,   -- snapshot
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
```

El `CHECK` compuesto de `caja_sesion` es la fórmula del arqueo escrita en el
esquema: *fondo inicial + ventas en efectivo + ingresos − egresos = esperado*.
Si el servicio calcula mal, la base rechaza el `INSERT`. El monto de
`movimiento_caja` siempre es positivo; el signo lo da `tipo`.

#### Venta

```sql
CREATE TABLE venta (
  id                     TEXT    PRIMARY KEY,
  caja_id                TEXT    NOT NULL REFERENCES caja(id),
  caja_sesion_id         TEXT    NOT NULL REFERENCES caja_sesion(id),
  usuario_id             TEXT    NOT NULL REFERENCES usuario(id),
  tipo                   TEXT    NOT NULL CHECK (tipo IN ('venta','anulacion')),
  venta_anulada_id       TEXT    REFERENCES venta(id),

  -- NUMERACIÓN INTERNA: siempre presente, secuencial por instalación.
  ticket_numero          INTEGER NOT NULL,

  fecha                  TEXT    NOT NULL,
  subtotal_centavos      INTEGER NOT NULL,
  descuento_centavos     INTEGER NOT NULL DEFAULT 0,   -- siempre 0 en V1
  total_centavos         INTEGER NOT NULL,
  recibido_centavos      INTEGER NOT NULL,
  vuelto_centavos        INTEGER NOT NULL DEFAULT 0,

  -- NUMERACIÓN FISCAL: la asigna ARCA en V3. Nunca se mezcla con ticket_numero.
  comprobante_tipo       TEXT,      -- '001' A, '006' B, '011' C, '083' tique
  punto_venta            INTEGER,
  comprobante_numero     INTEGER,
  cae                    TEXT,
  cae_vencimiento        TEXT,

  -- Snapshot fiscal al momento de la venta. Nullable en V1.
  condicion_iva_comercio TEXT,
  condicion_iva_cliente  TEXT,
  cliente_doc_tipo       TEXT CHECK (cliente_doc_tipo IS NULL OR cliente_doc_tipo IN ('CUIT','CUIL','DNI','SD')),
  cliente_doc_numero     TEXT,
  cliente_razon_social   TEXT,
  neto_gravado_centavos  INTEGER,
  iva_centavos           INTEGER,
  no_gravado_centavos    INTEGER,

  CHECK (total_centavos = subtotal_centavos - descuento_centavos),
  CHECK (recibido_centavos >= total_centavos),
  CHECK (vuelto_centavos = recibido_centavos - total_centavos),
  CHECK (tipo = 'anulacion' OR venta_anulada_id IS NULL),
  CHECK (tipo = 'venta'     OR venta_anulada_id IS NOT NULL),
  CHECK (tipo = 'venta'     OR total_centavos <= 0),
  CHECK (tipo = 'anulacion' OR total_centavos >= 0)
);

CREATE UNIQUE INDEX ux_venta_ticket ON venta(caja_id, ticket_numero);
-- Una venta se anula UNA sola vez. Lo garantiza el índice, no el código.
CREATE UNIQUE INDEX ux_venta_anulada ON venta(venta_anulada_id) WHERE venta_anulada_id IS NOT NULL;
-- V3: unicidad del comprobante fiscal.
CREATE UNIQUE INDEX ux_venta_fiscal ON venta(punto_venta, comprobante_tipo, comprobante_numero)
  WHERE comprobante_numero IS NOT NULL;
CREATE INDEX ix_venta_fecha  ON venta(fecha);
CREATE INDEX ix_venta_sesion ON venta(caja_sesion_id);

CREATE TABLE venta_linea (
  id                       TEXT    PRIMARY KEY,
  venta_id                 TEXT    NOT NULL REFERENCES venta(id),
  orden                    INTEGER NOT NULL,
  producto_id              TEXT    REFERENCES producto(id),
  es_generica              INTEGER NOT NULL DEFAULT 0 CHECK (es_generica IN (0,1)),

  -- SNAPSHOT: se copian al insertar. Jamás se resuelven por la FK al producto.
  descripcion              TEXT    NOT NULL,
  unidad                   TEXT    NOT NULL CHECK (unidad IN ('unidad','kg')),
  cantidad_milesimas       INTEGER NOT NULL CHECK (cantidad_milesimas <> 0),
  precio_unitario_centavos INTEGER NOT NULL,
  costo_unitario_centavos  INTEGER,
  alicuota_iva_bp          INTEGER NOT NULL,
  importe_centavos         INTEGER NOT NULL,

  CHECK (es_generica = 0 OR producto_id IS NULL),
  CHECK (es_generica = 1 OR producto_id IS NOT NULL)
);
CREATE UNIQUE INDEX ux_venta_linea_orden ON venta_linea(venta_id, orden);
CREATE INDEX        ix_venta_linea_venta ON venta_linea(venta_id);
CREATE INDEX        ix_venta_linea_prod  ON venta_linea(producto_id);

CREATE TABLE venta_pago (
  id                TEXT    PRIMARY KEY,
  venta_id          TEXT    NOT NULL REFERENCES venta(id),
  orden             INTEGER NOT NULL,
  medio_pago_id     TEXT    NOT NULL REFERENCES medio_pago(id),
  medio_pago_nombre TEXT    NOT NULL,   -- snapshot
  medio_pago_tipo   TEXT    NOT NULL,   -- snapshot
  afecta_arqueo     INTEGER NOT NULL,   -- snapshot
  monto_centavos    INTEGER NOT NULL CHECK (monto_centavos <> 0)
);
CREATE UNIQUE INDEX ux_venta_pago_orden ON venta_pago(venta_id, orden);
CREATE INDEX        ix_venta_pago_venta ON venta_pago(venta_id);
```

`afecta_arqueo` se snapshotea en el pago: si mañana el dueño cambia la
configuración de un medio de pago, los turnos ya cerrados no cambian de valor.

#### Inmutabilidad, forzada por el motor

```sql
CREATE TRIGGER trg_venta_no_delete
BEFORE DELETE ON venta
BEGIN SELECT RAISE(ABORT, 'Las ventas no se borran. Registrá una anulación.'); END;

-- Solo se permite escribir, una vez, los campos que asigna ARCA en V3.
CREATE TRIGGER trg_venta_campos_inmutables
BEFORE UPDATE ON venta
FOR EACH ROW
WHEN NEW.caja_id            IS NOT OLD.caja_id
  OR NEW.caja_sesion_id     IS NOT OLD.caja_sesion_id
  OR NEW.usuario_id         IS NOT OLD.usuario_id
  OR NEW.tipo               IS NOT OLD.tipo
  OR NEW.venta_anulada_id   IS NOT OLD.venta_anulada_id
  OR NEW.ticket_numero      IS NOT OLD.ticket_numero
  OR NEW.fecha              IS NOT OLD.fecha
  OR NEW.subtotal_centavos  IS NOT OLD.subtotal_centavos
  OR NEW.descuento_centavos IS NOT OLD.descuento_centavos
  OR NEW.total_centavos     IS NOT OLD.total_centavos
  OR NEW.recibido_centavos  IS NOT OLD.recibido_centavos
  OR NEW.vuelto_centavos    IS NOT OLD.vuelto_centavos
  -- Todos los campos que asigna ARCA se escriben UNA vez y después quedan
  -- congelados. Guardar solo el CAE dejaba el resto de la numeración fiscal
  -- reescribible para siempre.
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

-- Un turno cerrado no se reabre ni se recalcula.
CREATE TRIGGER trg_caja_sesion_cerrada
BEFORE UPDATE ON caja_sesion
FOR EACH ROW WHEN OLD.estado = 'cerrada'
BEGIN SELECT RAISE(ABORT, 'El turno ya está cerrado.'); END;
```

La regla 5 deja de depender de que nadie escriba un `UPDATE` por error: la base
lo rechaza.

#### Vistas de consulta

```sql
-- Ventas no anuladas. Es lo que mira el resumen del día.
CREATE VIEW v_venta_vigente AS
SELECT v.*
FROM venta v
WHERE v.tipo = 'venta'
  AND NOT EXISTS (SELECT 1 FROM venta a WHERE a.venta_anulada_id = v.id);

-- Estado neto por turno, para la pantalla de cierre (antes de congelar).
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
```

Como la anulación guarda montos negativos, `SUM(p.monto_centavos)` ya descuenta
las devoluciones de efectivo sin ninguna condición extra.

### 2.3 Tablas de V2 y V3 — planteadas, NO creadas

No van en la migración `0001`. Se documentan acá para que las decisiones de V1
no las bloqueen, y para dejar claro qué campos de V1 ya las anticipan.

**V2 — stock, compras y operación**

| Tabla | Contenido | Qué de V1 la habilita |
|---|---|---|
| `stock_movimiento` | `id`, `producto_id`, `tipo` (compra / venta / ajuste / merma / devolucion), `cantidad_milesimas` con signo, `costo_unitario_centavos`, `origen_tipo`, `origen_id`, `fecha`, `usuario_id` | El saldo es la suma de estos movimientos, nunca un campo en `producto` (regla 4). Cada `venta_linea` con `producto_id` genera un movimiento negativo. `producto.controla_stock` ya existe. |
| `stock_snapshot` | `producto_id` PK, `saldo_milesimas`, `calculado_hasta` | Caché opcional de performance. La fuente de verdad sigue siendo `stock_movimiento`. |
| `recuento`, `recuento_linea` | Recuento físico: contado vs. sistema, genera movimientos de ajuste | — |
| `proveedor` | `id`, `razon_social`, `cuit`, contacto | — |
| `compra`, `compra_linea` | Remito/factura de compra, actualiza costo promedio ponderado | `producto.costo_centavos` y `venta_linea.costo_unitario_centavos` ya existen y se snapshotean desde V1. |
| `venta_espera`, `venta_espera_linea` | Ticket puesto en pausa. Tablas aparte: **no** un estado en `venta`, porque `venta` es inmutable y una venta en espera todavía no existe. | — |
| `tecla_rapida` | `id`, `producto_id`, `posicion`, `etiqueta`, `color` | — |
| `descuento` / campos en `venta` | `venta.descuento_centavos` ya está, en 0 | Columna ya presente, no requiere migración de datos. |
| `actualizacion_precio`, `actualizacion_precio_linea` | Cambio masivo por porcentaje con precio anterior guardado, para deshacer | — |
| `permiso`, `usuario_permiso` | Autorización por PIN del dueño para acciones sensibles | `usuario.rol` ya existe con `dueno`/`cajero`. |

**V3 — nube, fiscal y suscripción**

| Tabla | Contenido | Qué de V1 la habilita |
|---|---|---|
| `outbox` | `id INTEGER PRIMARY KEY AUTOINCREMENT` (única autoincremental, es local y necesita orden estricto), `entidad`, `entidad_id`, `operacion`, `payload_json`, `intentos`, `estado`, `creado_en`, `enviado_en` | Toda entidad ya tiene UUID de cliente, así que el sync es idempotente por construcción (regla 13). |
| `sync_estado` | `entidad` PK, `ultimo_cursor`, `ultima_sincronizacion` | — |
| `cliente` | `id`, `razon_social`, `doc_tipo`, `doc_numero`, `condicion_iva`, `limite_credito_centavos` | `venta.cliente_doc_tipo` / `cliente_doc_numero` / `condicion_iva_cliente` ya se snapshotean. Se agregará `venta.cliente_id` nullable. |
| `cuenta_corriente_movimiento` | Cargo por venta a fiado, pagos, saldo derivado por suma | Mismo patrón que stock: saldo derivado, nunca campo mutable. |
| `arca_solicitud` | Pedido de CAE: `venta_id`, request, response, estado, reintentos | Los campos `cae`, `cae_vencimiento`, `comprobante_tipo`, `punto_venta`, `comprobante_numero` **ya están en `venta`** y el trigger de inmutabilidad los deja escribir una sola vez. |
| `licencia` | Estado local cacheado de la suscripción | El token de licencia y el refresh token **no** van acá: van al almacén de credenciales del SO (regla 21). |

---

## 3. Capas y responsabilidades

Flujo obligatorio, en un solo sentido:

```
componente React  →  hook  →  service  →  repository (contrato)
                                              ↓
                                    repository (sqlite)  →  Ejecutor / comando Rust  →  SQLite
```

Un componente que importa algo de `db/` o escribe SQL es un bug de revisión, no
una decisión de estilo.

| Carpeta | Hace | No hace |
|---|---|---|
| `domain/` | Aritmética de centavos y milésimas, armado y validación de la venta en curso, cálculo del arqueo. TypeScript puro, testeable sin base ni DOM. | No toca SQLite. No importa React. No conoce repositorios. |
| `db/` | Abre la base, corre y verifica migraciones, expone `Ejecutor` (select/execute) y el tipado de los comandos Rust. Mapea filas a entidades validando que los enteros sean enteros. | No sabe qué es una venta. No tiene reglas de negocio. |
| `repositories/contratos/` | Interfaces y tipos de entrada/salida. Nada más. | No tiene implementación ni SQL. |
| `repositories/sqlite/` | El SQL. Traduce parámetros, arma las sentencias, devuelve entidades del dominio. | No valida reglas de negocio ("no podés vender sin turno abierto" no vive acá). No orquesta varias operaciones. |
| `services/` | Reglas de negocio y orquestación. Valida antes de persistir, arma los payloads, decide qué repositorio llamar y en qué orden, traduce errores técnicos a `ErrorDeNegocio` con mensaje accionable. | No conoce React ni el DOM. No arma SQL. |
| `hooks/` | Adaptan services a React: estado de carga, error, `useEffect`, debounce, foco. | No contienen reglas de negocio. Si un hook decide algo del negocio, va al service. |
| `features/` | Una pantalla y sus componentes. Estado de UI local (qué modal está abierto, qué fila está seleccionada). | No llaman a repositorios ni a `db/`. |
| `components/` | UI reutilizable y tonta: botón, campo, modal, tabla. | No conoce el dominio. Un `CampoMoneda` sabe de centavos, no de precios de producto. |
| `lib/` | Utilidades técnicas sin dominio: UUID, fechas, formato, normalización de texto, parseo CSV. | No conoce entidades. |
| `src-tauri/comandos/` | Las 6 operaciones transaccionales y de archivos. Validan estructura del payload y devuelven error tipado. | No duplican reglas de negocio del service. La validación de negocio ya pasó; acá se valida integridad e invariantes de base. |

**Separación de estado (preferencia de código, aplicada):** el estado de datos
(productos, turno, ventas) vive en hooks que hablan con services. El estado de UI
(`showModal`, `showConfirmModal`, `esModoEdicion`, fila seleccionada) vive en
`useState` local del componente. No se mezclan en el mismo objeto.

---

## 4. Contratos de repositorios

Van en `src/repositories/contratos/`. Solo interfaces y tipos. Cero
implementación.

### 4.1 Tipos base

```ts
// domain/tipos.ts
export type Uuid       = string;   // UUID v4
export type IsoUtc     = string;   // '2026-09-01T22:41:03.512Z'
export type Centavos   = number;   // entero. 123456 = $1.234,56
export type Milesimas  = number;   // entero. 1000 = 1 unidad / 1 kg
export type Bp         = number;   // puntos básicos. 2100 = 21,00 %

export type Unidad     = 'unidad' | 'kg';
export type TipoVenta  = 'venta' | 'anulacion';
export type TipoMovimientoCaja = 'ingreso' | 'egreso';
export type EstadoTurno = 'abierta' | 'cerrada';
export type TipoMedioPago =
  | 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'qr' | 'otro';
export type TipoCodigo = 'ean' | 'interno' | 'balanza';
export type RolUsuario = 'dueno' | 'cajero';
```

### 4.2 Ejecución y transacciones

```ts
// repositories/contratos/Ejecutor.ts
export interface Ejecutor {
  select<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<number>; // filas afectadas
}
```

`Ejecutor` es lo único que conocen las implementaciones SQLite. Las operaciones
transaccionales no reciben un `Ejecutor`: son un solo comando Rust que se ejecuta
entero o no se ejecuta.

### 4.3 Catálogo

```ts
// repositories/contratos/ProductoRepository.ts
export interface Producto {
  readonly id: Uuid;
  readonly categoriaId: Uuid | null;
  readonly descripcion: string;
  readonly unidad: Unidad;
  readonly precioVentaCentavos: Centavos;
  readonly costoCentavos: Centavos | null;
  readonly alicuotaIvaBp: Bp;
  readonly controlaStock: boolean;
  readonly activo: boolean;
  readonly creadoEn: IsoUtc;
  readonly actualizadoEn: IsoUtc;
}

export interface ProductoConCodigos extends Producto {
  readonly codigos: readonly CodigoBarra[];
  readonly categoriaNombre: string | null;
}

export interface CodigoBarra {
  readonly id: Uuid;
  readonly productoId: Uuid;
  readonly codigo: string;
  readonly tipo: TipoCodigo;
}

export interface NuevoProducto {
  readonly id: Uuid;
  readonly categoriaId: Uuid | null;
  readonly descripcion: string;
  readonly unidad: Unidad;
  readonly precioVentaCentavos: Centavos;
  readonly costoCentavos: Centavos | null;
  readonly alicuotaIvaBp: Bp;
  readonly codigos: readonly { id: Uuid; codigo: string; tipo: TipoCodigo }[];
}

export interface CambiosProducto extends Omit<NuevoProducto, 'id'> {
  readonly activo: boolean;
}

export interface FiltroProducto {
  readonly texto?: string;         // ya normalizado por el service
  readonly categoriaId?: Uuid;
  readonly soloActivos?: boolean;
  readonly limite?: number;
  readonly desplazamiento?: number;
}

export interface ProductoRepository {
  obtenerPorId(id: Uuid): Promise<ProductoConCodigos | null>;
  obtenerPorCodigo(codigo: string): Promise<ProductoConCodigos | null>;
  buscar(filtro: FiltroProducto): Promise<readonly ProductoConCodigos[]>;
  contar(filtro: FiltroProducto): Promise<number>;
  crear(producto: NuevoProducto): Promise<void>;
  actualizar(id: Uuid, cambios: CambiosProducto): Promise<void>;
  desactivar(id: Uuid): Promise<void>;
  codigoEstaEnUso(codigo: string, excluyendoProductoId?: Uuid): Promise<boolean>;
  /** Importación masiva: una transacción en Rust. Devuelve el resultado por fila. */
  importar(productos: readonly NuevoProducto[]): Promise<ResultadoImportacion>;
}

export interface ResultadoImportacion {
  readonly creados: number;
  readonly actualizados: number;
  readonly errores: readonly { readonly fila: number; readonly motivo: string }[];
}
```

```ts
// repositories/contratos/CategoriaRepository.ts
export interface Categoria {
  readonly id: Uuid;
  readonly nombre: string;
  readonly orden: number;
  readonly activo: boolean;
}

export interface CategoriaRepository {
  listar(soloActivas: boolean): Promise<readonly Categoria[]>;
  obtenerPorId(id: Uuid): Promise<Categoria | null>;
  crear(categoria: { id: Uuid; nombre: string; orden: number }): Promise<void>;
  actualizar(id: Uuid, cambios: { nombre: string; orden: number; activo: boolean }): Promise<void>;
  nombreEstaEnUso(nombreNormalizado: string, excluyendoId?: Uuid): Promise<boolean>;
  cantidadDeProductos(id: Uuid): Promise<number>;
}
```

```ts
// repositories/contratos/MedioPagoRepository.ts
export interface MedioPago {
  readonly id: Uuid;
  readonly nombre: string;
  readonly tipo: TipoMedioPago;
  readonly afectaArqueo: boolean;
  readonly permiteVuelto: boolean;
  readonly orden: number;
  readonly activo: boolean;
}

export interface MedioPagoRepository {
  listar(soloActivos: boolean): Promise<readonly MedioPago[]>;
  obtenerPorId(id: Uuid): Promise<MedioPago | null>;
}
```

### 4.4 Turno de caja

```ts
// repositories/contratos/CajaRepository.ts
export interface Turno {
  readonly id: Uuid;
  readonly cajaId: Uuid;
  readonly estado: EstadoTurno;
  readonly usuarioAperturaId: Uuid;
  readonly abiertaEn: IsoUtc;
  readonly fondoInicialCentavos: Centavos;
  readonly cierre: CierreTurno | null;
}

export interface CierreTurno {
  readonly usuarioCierreId: Uuid;
  readonly cerradaEn: IsoUtc;
  readonly ventasEfectivoCentavos: Centavos;
  readonly ingresosCentavos: Centavos;
  readonly egresosCentavos: Centavos;
  readonly esperadoCentavos: Centavos;
  readonly contadoCentavos: Centavos;
  readonly diferenciaCentavos: Centavos;
  readonly totalVendidoCentavos: Centavos;
  readonly cantidadTickets: number;
  readonly observaciones: string | null;
  readonly porMedio: readonly TotalPorMedio[];
}

export interface TotalPorMedio {
  readonly medioPagoId: Uuid;
  readonly medioPagoNombre: string;
  readonly totalCentavos: Centavos;
  readonly cantidadPagos: number;
}

/** Estado en vivo del turno abierto, calculado desde v_turno_efectivo. */
export interface EstadoEfectivoTurno {
  readonly fondoInicialCentavos: Centavos;
  readonly ventasEfectivoCentavos: Centavos;
  readonly ingresosCentavos: Centavos;
  readonly egresosCentavos: Centavos;
  readonly esperadoCentavos: Centavos;
}

export interface MovimientoCaja {
  readonly id: Uuid;
  readonly cajaSesionId: Uuid;
  readonly tipo: TipoMovimientoCaja;
  readonly concepto: string;
  readonly montoCentavos: Centavos;
  readonly usuarioId: Uuid;
  readonly creadoEn: IsoUtc;
}

export interface DatosCierre {
  readonly usuarioCierreId: Uuid;
  readonly cerradaEn: IsoUtc;
  readonly contadoCentavos: Centavos;
  readonly observaciones: string | null;
}

export interface CajaRepository {
  obtenerCaja(): Promise<{ id: Uuid; nombre: string } | null>;
  guardarCaja(caja: { id: Uuid; nombre: string }): Promise<void>;

  obtenerTurnoAbierto(): Promise<Turno | null>;
  obtenerTurnoPorId(id: Uuid): Promise<Turno | null>;
  listarTurnos(desde: IsoUtc, hasta: IsoUtc): Promise<readonly Turno[]>;

  abrirTurno(turno: {
    id: Uuid; cajaId: Uuid; usuarioAperturaId: Uuid;
    abiertaEn: IsoUtc; fondoInicialCentavos: Centavos;
  }): Promise<void>;

  /** Transaccional (comando Rust): congela totales + detalle por medio. */
  cerrarTurno(turnoId: Uuid, datos: DatosCierre): Promise<CierreTurno>;

  estadoEfectivo(turnoId: Uuid): Promise<EstadoEfectivoTurno>;
  totalesPorMedio(turnoId: Uuid): Promise<readonly TotalPorMedio[]>;

  registrarMovimiento(movimiento: MovimientoCaja): Promise<void>;
  listarMovimientos(turnoId: Uuid): Promise<readonly MovimientoCaja[]>;
}
```

### 4.5 Venta

```ts
// repositories/contratos/VentaRepository.ts
export interface LineaVentaPersistida {
  readonly id: Uuid;
  readonly orden: number;
  readonly productoId: Uuid | null;
  readonly esGenerica: boolean;
  readonly descripcion: string;
  readonly unidad: Unidad;
  readonly cantidadMilesimas: Milesimas;
  readonly precioUnitarioCentavos: Centavos;
  readonly costoUnitarioCentavos: Centavos | null;
  readonly alicuotaIvaBp: Bp;
  readonly importeCentavos: Centavos;
}

export interface PagoPersistido {
  readonly id: Uuid;
  readonly orden: number;
  readonly medioPagoId: Uuid;
  readonly medioPagoNombre: string;
  readonly medioPagoTipo: TipoMedioPago;
  readonly afectaArqueo: boolean;
  readonly montoCentavos: Centavos;
}

export interface Venta {
  readonly id: Uuid;
  readonly cajaId: Uuid;
  readonly cajaSesionId: Uuid;
  readonly usuarioId: Uuid;
  readonly tipo: TipoVenta;
  readonly ventaAnuladaId: Uuid | null;
  readonly ticketNumero: number;
  readonly fecha: IsoUtc;
  readonly subtotalCentavos: Centavos;
  readonly descuentoCentavos: Centavos;
  readonly totalCentavos: Centavos;
  readonly recibidoCentavos: Centavos;
  readonly vueltoCentavos: Centavos;
  readonly lineas: readonly LineaVentaPersistida[];
  readonly pagos: readonly PagoPersistido[];
  /** Derivado: existe una anulación que la referencia. */
  readonly anulada: boolean;
}

export interface VentaResumen {
  readonly id: Uuid;
  readonly ticketNumero: number;
  readonly fecha: IsoUtc;
  readonly tipo: TipoVenta;
  readonly totalCentavos: Centavos;
  readonly cantidadLineas: number;
  readonly anulada: boolean;
}

/** Payload que viaja entero al comando Rust. Sin ticketNumero: lo asigna la base. */
export interface VentaAPersistir {
  readonly id: Uuid;
  readonly cajaId: Uuid;
  readonly cajaSesionId: Uuid;
  readonly usuarioId: Uuid;
  readonly fecha: IsoUtc;
  readonly subtotalCentavos: Centavos;
  readonly descuentoCentavos: Centavos;
  readonly totalCentavos: Centavos;
  readonly recibidoCentavos: Centavos;
  readonly vueltoCentavos: Centavos;
  readonly lineas: readonly Omit<LineaVentaPersistida, 'orden'>[];
  readonly pagos: readonly Omit<PagoPersistido, 'orden'>[];
}

export interface FiltroVenta {
  readonly cajaSesionId?: Uuid;
  readonly desde?: IsoUtc;
  readonly hasta?: IsoUtc;
  readonly ticketNumero?: number;
  readonly incluirAnuladas?: boolean;
  readonly limite?: number;
  readonly desplazamiento?: number;
}

export interface VentaRepository {
  /** Transaccional (comando Rust): venta + líneas + pagos + secuencia de ticket. */
  registrar(venta: VentaAPersistir): Promise<Venta>;

  /**
   * Transaccional (comando Rust). Crea la venta espejo con montos negativos.
   * Falla si la venta no existe, es una anulación, o ya fue anulada.
   */
  anular(params: {
    readonly id: Uuid;
    readonly ventaAnuladaId: Uuid;
    readonly cajaSesionId: Uuid;
    readonly usuarioId: Uuid;
    readonly fecha: IsoUtc;
    readonly motivo: string;
  }): Promise<Venta>;

  obtenerPorId(id: Uuid): Promise<Venta | null>;
  obtenerPorTicket(cajaId: Uuid, ticketNumero: number): Promise<Venta | null>;
  listar(filtro: FiltroVenta): Promise<readonly VentaResumen[]>;
  ultimaVenta(cajaSesionId: Uuid): Promise<VentaResumen | null>;
}
```

### 4.6 Resumen, configuración, acceso y backup

```ts
// repositories/contratos/ResumenRepository.ts
export interface ResumenDia {
  readonly desde: IsoUtc;
  readonly hasta: IsoUtc;
  readonly totalVendidoCentavos: Centavos;
  readonly cantidadTickets: number;
  readonly ticketPromedioCentavos: Centavos;
  readonly cantidadAnulaciones: number;
  readonly totalAnuladoCentavos: Centavos;
  readonly porMedio: readonly TotalPorMedio[];
}

export interface ResumenRepository {
  resumenPorRango(desde: IsoUtc, hasta: IsoUtc): Promise<ResumenDia>;
  resumenPorTurno(turnoId: Uuid): Promise<ResumenDia>;
}
```

```ts
// repositories/contratos/ComercioRepository.ts
export interface Comercio {
  readonly id: Uuid;
  readonly razonSocial: string;
  readonly nombreFantasia: string | null;
  readonly domicilio: string | null;
  readonly localidad: string | null;
  readonly provincia: string | null;
  readonly telefono: string | null;
  readonly condicionIva: string | null;
  readonly cuit: string | null;
  readonly ingresosBrutos: string | null;
  readonly inicioActividades: string | null;
  readonly puntoVentaDefault: number | null;
}

export interface ComercioRepository {
  obtener(): Promise<Comercio | null>;
  guardar(comercio: Comercio): Promise<void>;
  leerConfig(clave: string): Promise<string | null>;
  escribirConfig(clave: string, valor: string): Promise<void>;
}
```

```ts
// repositories/contratos/UsuarioRepository.ts
export interface Usuario {
  readonly id: Uuid;
  readonly nombre: string;
  readonly rol: RolUsuario;
  readonly activo: boolean;
}

export interface UsuarioRepository {
  existeAlguno(): Promise<boolean>;
  listar(): Promise<readonly Usuario[]>;
  obtenerPorId(id: Uuid): Promise<Usuario | null>;
  /** El hash lo produce el comando Rust (argon2). Acá solo se persiste. */
  crear(usuario: Usuario & { readonly pinHash: string }): Promise<void>;
  actualizarPin(id: Uuid, pinHash: string): Promise<void>;
  obtenerPinHash(id: Uuid): Promise<string | null>;
}
```

```ts
// repositories/contratos/BackupRepository.ts
export interface InfoBackup {
  readonly ruta: string;
  readonly bytes: number;
  readonly creadoEn: IsoUtc;
}

export interface BackupRepository {
  /** VACUUM INTO en Rust: copia consistente sin cerrar la app. */
  crear(rutaDestino: string): Promise<InfoBackup>;
  /** Valida el archivo, guarda la base actual como .bak y reemplaza. Requiere reinicio. */
  restaurar(rutaOrigen: string): Promise<void>;
  ultimoBackup(): Promise<InfoBackup | null>;
}
```

---

## 5. Pantallas de V1 y navegación

### 5.1 Lineamientos visuales

El pedido es sobria y densa, para pantalla de caja. Concretamente:

- **Tema claro, alto contraste.** El mostrador tiene luz de día y monitores
  baratos con brillo alto. Fondo `#FFFFFF`, superficies `#F4F5F7`, texto
  `#111418`, bordes `#D5D9DF`.
- **Cuatro colores y se terminó.** Neutros + un acento azul (`#1D4ED8`) para el
  foco y la acción primaria + verde (`#15803D`) solo para el total y la
  confirmación de cobro + rojo (`#B91C1C`) solo para error y anulación. Nada de
  gradientes, sombras de colores ni iconos decorativos.
- **Tipografía.** Sistema (`Segoe UI` en Windows) para todo el texto.
  `font-variant-numeric: tabular-nums` en **todo** número, para que las columnas
  no bailen. Escala: base 15px, tabla 15px, total de la venta **64px**, importe
  de línea 20px, vuelto 48px.
- **Densidad.** Fila de tabla 34px, input 40px de alto, padding de sección 12px.
  La grilla de líneas de venta muestra 14 filas sin scroll en 1366×768.
- **Foco siempre visible.** `outline: 2px solid var(--acento); outline-offset: 2px`.
  Nunca `outline: none`.
- **Sin animaciones** más allá de 120ms de opacidad. Nada se mueve mientras el
  cajero tipea.
- **Barra de estado fija abajo:** caja, usuario, estado del turno, hora, y la
  línea de atajos de la pantalla actual. Es la ayuda permanente para el que no
  es técnico.
- Un tema oscuro opcional queda para V2. No se construye ahora.

### 5.2 Navegación

**No se usa react-router.** La app es un kiosco de una sola ventana con 13
pantallas y navegación por teclado. Un router de URL agrega dependencia, historial
del navegador y estados imposibles (botón "atrás" en medio de un cobro). En su
lugar: una máquina de estados en `app/Router.tsx` con una unión discriminada de
pantallas y un stack de retorno de un solo nivel.

```
                      ┌──────────────┐
   arranque  ─────────│ PRIMER USO   │  (solo si no hay comercio ni usuario)
                      └──────┬───────┘
                             ▼
                      ┌──────────────┐
                      │   ACCESO     │  PIN de 4 dígitos
                      └──────┬───────┘
                             ▼
              ┌──────────────────────────┐
              │  APERTURA DE TURNO       │  si no hay turno abierto
              └──────────┬───────────────┘
                         ▼
              ╔══════════════════════════╗
              ║        VENTA             ║  pantalla base, siempre se vuelve acá
              ╚══════════════════════════╝
                 │  │  │  │  │  │  │
     F2 buscar ──┘  │  │  │  │  │  └── F9  RESUMEN DEL DÍA
     F3 cantidad ───┘  │  │  │  └───── F8  TICKETS DEL TURNO ──► anulación
     F5 genérica ──────┘  │  └──────── F7  MOVIMIENTOS DE CAJA
     F12 COBRO ───────────┘
                                       F10 CATÁLOGO ─┬─ productos (lista)
                                                     ├─ producto (alta/edición)
                                                     ├─ categorías
                                                     └─ importación
                                       F11 CONFIGURACIÓN ─┬─ comercio y caja
                                                          └─ backup
                                    Ctrl+F4 CIERRE DE TURNO ──► ACCESO
```

Los modales (cobro, cantidad, venta genérica, confirmación) no son pantallas: son
overlay sobre VENTA, con `showModal` / `showConfirmModal`. `Esc` cierra el modal
y devuelve el foco al campo de búsqueda.

### 5.3 Detalle de pantallas

| # | Pantalla | Qué resuelve | Entrada / salida |
|---|---|---|---|
| 1 | **Primer uso** | Wizard de 3 pasos: datos del comercio, nombre de la caja, PIN del dueño. Solo aparece si la base está vacía. | → Acceso |
| 2 | **Acceso** | PIN de 4 dígitos, teclado numérico en pantalla + entrada por teclado físico. Bloqueo tras 5 intentos por 60 s. | → Apertura de turno o Venta |
| 3 | **Apertura de turno** | Un solo campo: fondo inicial. Muestra fecha/hora y usuario. | → Venta |
| 4 | **Venta** | Pantalla base. Grilla de líneas, campo de búsqueda/escaneo siempre enfocado, total en 64px, panel lateral con últimos 3 tickets. | → Cobro |
| 5 | **Cobro** (modal) | Total, medios de pago con teclas 1–5, monto por medio, restante, vuelto. Enter confirma si el restante es 0 o negativo. | → Venta (ticket registrado) |
| 6 | **Cantidad / precio de línea** (modal) | Editar cantidad (en unidades o kg) y precio unitario de la línea seleccionada. | → Venta |
| 7 | **Venta genérica** (modal) | Monto suelto sin producto, con descripción opcional. | → Venta |
| 8 | **Movimientos de caja** | Lista de ingresos/egresos del turno + alta con tipo, concepto y monto. | → Venta |
| 9 | **Tickets del turno** | Listado de las ventas del turno, búsqueda por número, detalle, y acción de anular con confirmación explícita. | → Venta |
| 10 | **Resumen del día** | Total vendido, desglose por medio de pago, cantidad de tickets, ticket promedio, anulaciones. Selector de fecha. | → Venta |
| 11 | **Catálogo · productos** | Listado con búsqueda, filtro por categoría, alta, edición, desactivación. | → Formulario |
| 12 | **Catálogo · producto** | Alta/edición: descripción, categoría, unidad, precio con IVA, costo, alícuota, N códigos de barras. `esModoEdicion` distingue alta de edición. | → Listado |
| 13 | **Catálogo · categorías** | ABM simple con orden. | → Listado |
| 14 | **Catálogo · importación** | Elegir archivo, mapear columnas, previsualizar (creados / actualizados / con error), confirmar. | → Listado |
| 15 | **Cierre de turno** | Esperado calculado y desglosado, campo de contado, diferencia en vivo, observaciones. Confirmación explícita: no se puede reabrir. | → Acceso |
| 16 | **Configuración · comercio y caja** | Datos del comercio (incluye los fiscales, deshabilitados con nota "se usa al facturar"), nombre de la caja. | — |
| 17 | **Configuración · backup** | Crear backup a un archivo elegido, ver último backup, restaurar desde archivo con doble confirmación. | — |

### 5.4 Teclado

Mapa global (funciona desde cualquier pantalla salvo modales):

| Tecla | Acción |
|---|---|
| `F1` | Ayuda: lista de atajos de la pantalla actual |
| `F2` | Foco en búsqueda por descripción |
| `F3` | Cantidad de la línea seleccionada |
| `F4` | Precio unitario de la línea seleccionada |
| `F5` | Venta genérica (monto suelto) |
| `F6` | Eliminar línea seleccionada |
| `F7` | Movimientos de caja |
| `F8` | Tickets del turno |
| `F9` | Resumen del día |
| `F10` | Catálogo |
| `F11` | Configuración |
| `F12` | Cobrar |
| `Esc` | Cerrar modal / cancelar venta en curso (con confirmación si hay líneas) |
| `↑` `↓` | Mover selección en la grilla |
| `Ctrl+F4` | Cerrar turno |

En VENTA, el campo de búsqueda está enfocado por defecto y **el foco vuelve ahí
después de cada acción**. El lector de código de barras se detecta con un
listener global: si llegan ≥6 caracteres en menos de 100 ms seguidos de `Enter`,
es el lector, no una persona tipeando. Funciona sin configuración porque el
lector emula teclado.

Todas las acciones frecuentes son de 1 o 2 pasos: escanear → Enter (1);
buscar → F2, tipear, Enter (2); cobrar en efectivo exacto → F12, Enter (2).

---

## 6. Orden de implementación en cortes verticales

Cada corte se entrega funcionando de punta a punta y se prueba a mano antes de
seguir. **No hay corte de andamiaje.** Los cimientos —limpieza del template,
migración `0001`, aritmética de centavos con sus tests, tokens de UI, shell—
entran adentro del corte 1, que además termina en algo que se abre y se usa.

Para que eso sea posible, la migración `0001` siembra una fila de `comercio`
(razón social vacía), una de `caja` ("Caja 1") y un `usuario` "Dueño" con
`pin_hash` en NULL. Así las FK `NOT NULL` de `venta` y `caja_sesion` existen
desde el primer día, y el wizard de primer uso del corte 7 no hace un alta:
completa filas que ya están. `usuario.pin_hash` pasa a ser nullable, y mientras
sea NULL la pantalla de acceso no aparece.

| # | Corte | Qué queda funcionando | `domain` | `db` | `repo` | `service` | UI |
|---|---|---|---|---|---|---|---|
| 1 | **Catálogo de punta a punta** | Se borra el demo del template, se aplica y verifica la migración `0001` (incluidos los PRAGMA y `crypto.randomUUID`), quedan `dinero.ts` y `cantidad.ts` con tests de Vitest en verde, los tokens de UI y el shell con barra de estado. Sobre eso: alta, edición, búsqueda y baja de productos con su código de barras. **Al terminar: abrís la app, cargás el catálogo del kiosco, cerrás, volvés a abrir y sigue ahí.** Es el primer recorrido completo componente → hook → service → repo → SQLite. | ✔ | ✔ | ✔ | ✔ | ✔ |
| 2 | **Venta en efectivo** | Escanear o buscar por descripción, ver líneas, total en vivo, cobrar en efectivo, vuelto, ticket guardado con su número interno. `registrar_venta` transaccional. Turno implícito: si no hay ninguno abierto se abre uno al arrancar, todavía sin pantalla. **Al terminar: hacés una venta real de punta a punta. Este corte hace que el producto exista.** | ✔ | ✔ | ✔ | ✔ | ✔ |
| 3 | **Venta completa** | Venta genérica (monto suelto), edición de cantidad y precio de línea, venta por peso, pago mixto con varios medios y restante en vivo. **Al terminar: cobrás un ticket con efectivo más tarjeta y vendés algo que no está en el catálogo.** | ✔ | — | ✔ | ✔ | ✔ |
| 4 | **Tickets y anulación** | Listado de tickets del turno, detalle, anulación con venta espejo negativa. **Al terminar: anulás un ticket mal hecho y ves que la venta original queda intacta.** | — | — | ✔ | ✔ | ✔ |
| 5 | **Turno de caja** | Apertura explícita con fondo inicial (reemplaza el turno implícito del corte 2), ingresos y egresos con concepto, cierre con arqueo y detalle por medio congelado. `cerrar_turno` transaccional. **Al terminar: abrís caja, vendés, cargás un retiro, cerrás con arqueo y la diferencia cierra a mano.** | ✔ | ✔ | ✔ | ✔ | ✔ |
| 6 | **Resumen del día** | Total vendido, desglose por medio de pago, cantidad de tickets, ticket promedio, anulaciones, selector de fecha. **Al terminar: sabés cuánto vendiste hoy y por qué medio.** | — | — | ✔ | ✔ | ✔ |
| 7 | **Primer uso, acceso y configuración** | Wizard de datos del comercio, nombre de la caja y PIN del dueño (hash argon2 por comando Rust). A partir de que el PIN existe, la app lo pide al abrir. Pantalla de configuración. **Al terminar: la app deja de ser tuya y pasa a ser instalable en un mostrador ajeno.** | — | ✔ | ✔ | ✔ | ✔ |
| 8 | **Catálogo completo** | Categorías, múltiples códigos por producto, importación desde CSV/Excel con previsualización y errores por fila. `importar_productos` transaccional. **Al terminar: cargás los 400 productos del kiosco desde su planilla.** | — | — | ✔ | ✔ | ✔ |
| 9 | **Backup y restauración** | `VACUUM INTO` a un archivo elegido, restauración con doble confirmación y reinicio. **Al terminar: te llevás la base en un pendrive y la restaurás en otra máquina.** | — | ✔ | ✔ | ✔ | ✔ |
| 10 | **Endurecimiento y empaquetado** | Prueba de corte de luz (apagado en caliente con una venta a mitad), error boundary, mensajes accionables, revisión de foco y atajos sin mouse, instalador MSI/NSIS, prueba en un comercio real. **Al terminar: se lo instalás a alguien.** | — | — | — | — | ✔ |

Después del corte 2 la app ya vende. Después del corte 5 sirve para operar un día
entero. Del 7 al 10 es lo que hace falta para que la use alguien que no seas vos y
no pierda los datos.

---

## 7. Decisiones abiertas

Necesito definición antes de escribir código. Marco con **(bloqueante)** las que
frenan un corte específico.

**D1 — Redondeo del importe de línea. (bloqueante: corte 0)**
Propuesta: half-up en valor absoluto, redondeo únicamente al calcular el importe
de cada línea, total como suma exacta de importes ya redondeados. Alternativa:
banker's rounding. ¿Se confirma half-up?

**D2 — Redondeo del total en efectivo. (bloqueante: corte 4)**
En Argentina es común redondear el vuelto a $10, $50 o $100 porque no hay
monedas. ¿V1 redondea el total cuando el pago es en efectivo? Si sí, el esquema
necesita una columna `redondeo_centavos` en `venta` y hay que decidir a qué
múltiplo y con qué regla. Si no, `recibido_centavos` puede ser cualquier valor y
el vuelto sale exacto. **Mi recomendación: no redondear en V1**, mostrar el
vuelto exacto y dejar que el cajero resuelva. Agregar la columna después es una
migración con dato por defecto 0, sin riesgo.

**D3 — Venta por peso. (bloqueante: corte 5)**
Tres preguntas: (a) ¿el cajero ingresa el peso en kg o el importe en pesos?
(b) ¿hay balanza con etiquetadora que imprime códigos con el peso embebido
(prefijo 20–29, formato `PPPPP` de peso o importe)? Si sí, necesito el formato
exacto de la balanza del comercio piloto. (c) ¿precio por kg o por 100 g?

**D4 — Alícuota de IVA por producto. (bloqueante: corte 2)**
El esquema soporta alícuota por producto. ¿El comerciante la va a cargar, o en
V1 se fija 21 % global y el campo queda oculto en la UI? Recomiendo lo segundo:
un kiosquero no sabe qué alícuota tiene un producto, y el campo ya está en la
base para cuando llegue ARCA.

**D5 — Venta sin turno abierto. (bloqueante: corte 4)**
Propuesta: prohibido. Si no hay turno abierto, la pantalla de venta redirige a
apertura de turno. Es la única forma de que el arqueo cierre. ¿Se acepta, o hay
que permitir vender y asignar a un turno "implícito"?

**D6 — Anulación. (bloqueante: corte 6)**
(a) ¿Solo anulación total, o también parcial por línea? Recomiendo solo total en
V1: la parcial es una devolución y merece su propio tipo de comprobante.
(b) Si la venta original es de un turno ya cerrado, ¿se puede anular? Propuesta:
sí, pero la anulación se imputa al turno **abierto en ese momento**, porque el
efectivo sale de la caja de hoy. Eso hace que el turno viejo, ya congelado, no
cambie. ¿Se acepta?
(c) ¿Se pide motivo obligatorio? ¿Se pide PIN? (En V1 hay un solo usuario, así
que el PIN no agrega nada; en V2 sí.)

**D7 — Backup. (bloqueante: corte 10)**
(a) ¿Automático al cerrar turno, además del manual? (b) ¿Dónde por defecto:
`Documentos\POS\backups`, o una carpeta que elija el dueño (pendrive)?
(c) ¿Cuántos se retienen antes de borrar el más viejo?

**D8 — Formato de importación. (bloqueante: corte 9)**
Necesito el archivo real que van a usar, o la definición de columnas. Preguntas:
(a) ¿la clave para decidir crear vs. actualizar es el código de barras o la
descripción? (b) ¿el precio viene con o sin IVA? (c) ¿viene con separador
decimal coma o punto, y con separador de miles? (d) ¿`.xlsx` o alcanza con
`.csv`? Si es `.xlsx`, hay que sumar una dependencia de parseo y prefiero
resolverlo en Rust (`calamine`) antes que meter una librería pesada en el bundle
del front.

**D9 — Recuperación del PIN.**
Si el dueño olvida el PIN de 4 dígitos, con la app 100 % offline y sin cuenta,
no hay a quién pedirle un reseteo. Opciones: (a) pregunta de seguridad guardada
en el primer uso; (b) código maestro derivado del CUIT del comercio, que el
soporte pueda calcular; (c) nada, se restaura un backup. Ninguna es linda.
Recomiendo (a) más (c) documentado.

**D10 — Multi-caja en V1.**
`ux_venta_ticket` es único por `(caja_id, ticket_numero)` y `caja` tiene una sola
fila. Eso asume **una PC por comercio**. Si algún piloto tiene dos cajas, en V1
serían dos instalaciones independientes con bases separadas y numeraciones
independientes, sin forma de consolidar hasta V3. ¿Es aceptable?

**D11 — Identidad del producto y del instalador.**
Hoy `tauri.conf.json` dice `productName: "pos-ventas"` e `identifier:
"com.francisco-martinez.pos-ventas"`. Antes de generar el primer instalador hay
que fijar nombre comercial, identificador definitivo (cambiarlo después mueve el
directorio de datos de la app y "pierde" la base del cliente), e ícono. También:
¿se firma el ejecutable? Sin firma, Windows SmartScreen le muestra una advertencia
al comerciante en cada instalación.

**D12 — Ubicación del archivo SQLite.**
Propuesta: `AppData\Roaming\<identifier>\pos.db` (el directorio de datos de la
app que resuelve Tauri). Es lo correcto técnicamente, pero un comerciante nunca
lo va a encontrar para copiarlo a mano. La alternativa —`Documentos\POS\pos.db`—
es visible pero se sincroniza sola a OneDrive y **eso corrompe bases SQLite**.
Recomiendo `AppData` más un botón "Abrir carpeta de datos" en Configuración.

**D13 — Estado del servidor sin librería.**
Propuesta: en V1 no se usa TanStack Query. Las consultas son a SQLite local, en
milisegundos, y una capa de caché agrega complejidad y estados intermedios que no
hacen falta. Un `useAsync` propio de 30 líneas alcanza. ¿Se acepta?

---

**D14 — `recibido_centavos` y `vuelto_centavos` a nivel venta. (bloqueante: corte 2)**
Hoy están en `venta`, con `CHECK (recibido >= total)` y
`CHECK (vuelto = recibido - total)`. Eso funciona cuando se paga todo en
efectivo, pero se rompe conceptualmente con pago mixto: si un ticket de $1.000
se cobra $600 con débito y $400 en efectivo y el cliente entrega $500, para que
el CHECK pase hay que guardar `recibido = 1.100`, un número que no existió nunca
en el mostrador. Y en una anulación, con total negativo, `recibido = -1.000` no
significa nada.

Propuesta: mover `recibido_centavos` y `vuelto_centavos` a `venta_pago`, donde
solo se llenan en las líneas con `permite_vuelto = 1`, y sacar los dos CHECK de
`venta`. El invariante que importa —`SUM(venta_pago.monto_centavos) =
venta.total_centavos`— no se puede expresar como CHECK declarativo en SQLite de
todas formas: vive en `registrar_venta` (Rust) y en un test unitario. ¿Se mueve?

**D15 — `outbox` en V1. (bloqueante: corte 1)**
El plan deja `outbox` para V3, y a la vez rutea las escrituras de una sola tabla
(ABM de producto, categoría, movimiento de caja) al plugin. Esas dos decisiones
juntas tienen una consecuencia que conviene ver ahora: la regla 12 exige que la
operación de negocio y su fila en `outbox` se inserten en la MISMA transacción.
El plugin no puede hacer eso. Entonces, el día que llegue V3, cada ABM que hoy
resuelve el plugin tiene que convertirse en un comando Rust.

Dos salidas, y hay que elegir una ahora porque cambia el corte 1:
(a) crear `outbox` en la migración `0001` y escribirla desde el día uno, con
todas las escrituras —también las de una tabla— pasando por comando Rust. Más
Rust desde el principio, cero retrabajo en V3.
(b) dejarla para V3 como está planteado, y asumir que en V3 se reescribe la capa
de escritura del catálogo. Más simple ahora, con una deuda conocida y acotada.

Mi recomendación es (b), pero anotado por escrito y no descubierto en dos años:
V1 tiene que salir, y el catálogo es la parte que menos importa sincronizar en
tiempo real. Lo que no me parece es dejarlo sin decidir.

**D16 — `F12` para cobrar.**
Es la acción más frecuente del día y quedó en la tecla más lejana, que además
abre las devtools de WebView2 en las builds de desarrollo. Propuesta:
`Enter` con el campo de búsqueda vacío y líneas cargadas abre el cobro, y el `+`
del teclado numérico hace lo mismo, para que la mano no se mueva del pad. `F12`
queda como tercer alias. ¿Va?

**D17 — `Esc` cancela la venta en curso.**
Está en el mapa global como "cerrar modal / cancelar venta en curso (con
confirmación)". En un mostrador, `Esc` se aprieta por reflejo. Propuesta: `Esc`
solo cierra modales y limpia el campo de búsqueda; descartar el ticket entero es
`Ctrl+Supr` con confirmación. ¿Va?

**D18 — Vistas con `SELECT v.*`.**
`v_venta_vigente` está definida como `SELECT v.*`. SQLite congela la lista de
columnas en el momento de crear la vista: si una migración posterior le agrega
una columna a `venta`, la vista no la va a devolver y el bug es silencioso.
Propuesta: listar las columnas explícitamente. No bloquea nada, pero conviene
resolverlo antes de escribir la migración.

---

## Resumen de lo que hay que aprobar

1. El modelo híbrido de acceso a datos: plugin por default, 6 comandos Rust para
   lo transaccional (§0).
2. El esquema de la migración `0001` de §2.2 —incluidos los triggers de
   inmutabilidad, la convención de anulación con montos negativos y las tres
   correcciones marcadas en §2.2— y las filas semilla de `comercio`, `caja` y
   `usuario`.
3. La estructura de carpetas de §1.
4. Los contratos de repositorio de §4.
5. El orden de cortes de §6, que arranca directo por el catálogo funcionando.
6. Las 18 decisiones abiertas de §7. Bloquean el arranque: **D1** (redondeo),
   **D4** (alícuota por producto), **D14** (recibido/vuelto), **D15** (outbox).
   Las demás las puedo ir preguntando sobre la marcha.

Con eso aprobado, arranco por el corte 1.
