mod comandos;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::URL_BASE, db::migraciones::todas())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            comandos::venta::registrar_venta,
            comandos::anulacion::anular_venta
        ])
        .run(tauri::generate_context!())
        .expect("error al arrancar la aplicacion");
}
