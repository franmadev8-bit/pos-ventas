pub mod migraciones;
pub mod pool;

/// Nombre del archivo SQLite. Vive en el directorio de datos de la app,
/// que Tauri resuelve por el identificador de tauri.conf.json.
/// Es tambien la clave con la que el plugin guarda el pool.
pub const URL_BASE: &str = "sqlite:pos.db";
