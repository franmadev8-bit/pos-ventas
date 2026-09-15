use tauri_plugin_sql::{Migration, MigrationKind};

/// Migraciones versionadas, en orden. Una migracion ya aplicada en una
/// instalacion real JAMAS se modifica: un cambio es siempre un archivo nuevo.
pub fn todas() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "v1_inicial",
        sql: include_str!("../../migrations/0001_v1_inicial.sql"),
        kind: MigrationKind::Up,
    }]
}
