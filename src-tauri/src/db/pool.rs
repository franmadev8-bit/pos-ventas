use sqlx::{Pool, Sqlite};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_sql::{DbInstances, DbPool};

use super::URL_BASE;

/// Devuelve el MISMO pool que usa tauri-plugin-sql, no uno nuevo.
///
/// Abrir una conexion propia obligaria a resolver a mano donde deja el plugin
/// el archivo, y si esa ruta no coincide se crea una segunda base en silencio:
/// la aplicacion anda, pero cada camino escribe en un archivo distinto. Tomando
/// el pool del estado del plugin ese riesgo no existe.
pub async fn pool<R: Runtime>(app: &AppHandle<R>) -> Result<Pool<Sqlite>, String> {
    let instancias = app.state::<DbInstances>();
    let mapa = instancias.0.read().await;
    match mapa.get(URL_BASE) {
        Some(DbPool::Sqlite(p)) => Ok(p.clone()),
        _ => Err(format!(
            "La base {URL_BASE} todavia no esta abierta. El frontend tiene que cargarla antes de operar."
        )),
    }
}
