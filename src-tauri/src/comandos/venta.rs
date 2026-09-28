use serde::{Deserialize, Serialize};
use sqlx::{Acquire, Row};
use tauri::{AppHandle, Runtime};

use crate::db::pool::pool;

/// Una linea del ticket. Los montos ya vienen calculados por el frontend y se
/// vuelven a verificar aca: el cliente arma, el servidor comprueba.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineaEntrada {
    pub id: String,
    pub orden: i64,
    pub tipo_linea: String,
    pub producto_id: Option<String>,
    pub descripcion: String,
    pub unidad: String,
    pub cantidad_milesimas: i64,
    pub origen_precio: Option<String>,
    pub precio_unitario_centavos: i64,
    pub precio_lista_centavos: Option<i64>,
    pub costo_unitario_centavos: Option<i64>,
    pub alicuota_iva_bp: i64,
    pub importe_centavos: i64,
    /// UUID del movimiento de stock que genera esta linea. Lo manda el cliente
    /// (regla 1). Null en las lineas que no mueven stock.
    pub movimiento_stock_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagoEntrada {
    pub id: String,
    pub orden: i64,
    pub medio_pago_id: String,
    pub medio_pago_nombre: String,
    pub medio_pago_tipo: String,
    pub afecta_arqueo: bool,
    pub monto_centavos: i64,
    pub recibido_centavos: Option<i64>,
    pub vuelto_centavos: Option<i64>,
    /// Numero de autorizacion del POSNET. Siempre opcional.
    pub referencia: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VentaEntrada {
    pub id: String,
    pub caja_id: String,
    pub caja_sesion_id: String,
    pub usuario_id: String,
    pub fecha: String,
    pub subtotal_centavos: i64,
    pub descuento_centavos: i64,
    pub total_centavos: i64,
    pub lineas: Vec<LineaEntrada>,
    pub pagos: Vec<PagoEntrada>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VentaRegistrada {
    pub id: String,
    pub ticket_numero: i64,
    pub fecha: String,
    /// true cuando la venta ya estaba grabada y esta llamada no escribio nada.
    pub ya_existia: bool,
}

/// Verificaciones que no dependen de la base. Si algo de esto falla, no se
/// abre transaccion: se rechaza y listo.
fn verificar(v: &VentaEntrada) -> Result<(), String> {
    if v.lineas.is_empty() {
        return Err("La venta no tiene lineas.".into());
    }
    if v.pagos.is_empty() {
        return Err("La venta no tiene pagos.".into());
    }

    let suma_lineas: i64 = v.lineas.iter().map(|l| l.importe_centavos).sum();
    if suma_lineas != v.subtotal_centavos {
        return Err(format!(
            "El subtotal no coincide con las lineas: lineas {suma_lineas}, subtotal {}.",
            v.subtotal_centavos
        ));
    }
    if v.total_centavos != v.subtotal_centavos - v.descuento_centavos {
        return Err("El total no es subtotal menos descuento.".into());
    }

    let suma_pagos: i64 = v.pagos.iter().map(|p| p.monto_centavos).sum();
    if suma_pagos != v.total_centavos {
        return Err(format!(
            "Los pagos no cubren el total: pagos {suma_pagos}, total {}.",
            v.total_centavos
        ));
    }

    for p in &v.pagos {
        match (p.recibido_centavos, p.vuelto_centavos) {
            (Some(r), Some(vu)) if vu != r - p.monto_centavos => {
                return Err("El vuelto no es lo recibido menos el monto.".into());
            }
            (Some(_), None) | (None, Some(_)) => {
                return Err("Un pago con recibido tiene que tener vuelto, y al reves.".into());
            }
            _ => {}
        }
    }
    Ok(())
}

/// Graba una venta completa: cabecera, lineas, pagos, numero de ticket y
/// movimientos de stock, todo en UNA transaccion.
///
/// Es idempotente por el UUID que genera el cliente (regla 13): si la venta ya
/// esta, devuelve el resultado de la primera y no escribe nada. Eso cubre el
/// caso de un reintento despues de un error de red o de un cierre abrupto
/// justo despues del commit.
#[tauri::command]
pub async fn registrar_venta<R: Runtime>(
    app: AppHandle<R>,
    venta: VentaEntrada,
) -> Result<VentaRegistrada, String> {
    verificar(&venta)?;

    let db = pool(&app).await?;
    let mut conn = db.acquire().await.map_err(|e| e.to_string())?;

    // Las claves foraneas son por conexion y estan apagadas por defecto.
    // Tiene que ir FUERA de la transaccion: adentro es una sentencia muda.
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut tx = conn.begin().await.map_err(|e| e.to_string())?;

    // Idempotencia.
    let ya = sqlx::query("SELECT ticket_numero, fecha FROM venta WHERE id = ?")
        .bind(venta.id.as_str())
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    if let Some(fila) = ya {
        return Ok(VentaRegistrada {
            id: venta.id,
            ticket_numero: fila.try_get("ticket_numero").map_err(|e| e.to_string())?,
            fecha: fila.try_get("fecha").map_err(|e| e.to_string())?,
            ya_existia: true,
        });
    }

    // Numero de ticket: secuencial por caja, tomado adentro de la transaccion.
    // Si dos ventas se pisaran, la unica de venta(caja_id, ticket_numero)
    // aborta la segunda en vez de repetir un numero.
    let clave = format!("ticket:{}", venta.caja_id);
    sqlx::query("INSERT OR IGNORE INTO secuencia (nombre, valor) VALUES (?, 0)")
        .bind(clave.as_str())
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let ticket: i64 = sqlx::query("UPDATE secuencia SET valor = valor + 1 WHERE nombre = ? RETURNING valor")
        .bind(clave.as_str())
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .try_get("valor")
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO venta (id, caja_id, caja_sesion_id, usuario_id, tipo, ticket_numero, fecha,
                            subtotal_centavos, descuento_centavos, total_centavos)
         VALUES (?, ?, ?, ?, 'venta', ?, ?, ?, ?, ?)",
    )
    .bind(venta.id.as_str())
    .bind(venta.caja_id.as_str())
    .bind(venta.caja_sesion_id.as_str())
    .bind(venta.usuario_id.as_str())
    .bind(ticket)
    .bind(venta.fecha.as_str())
    .bind(venta.subtotal_centavos)
    .bind(venta.descuento_centavos)
    .bind(venta.total_centavos)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for l in &venta.lineas {
        sqlx::query(
            "INSERT INTO venta_linea (id, venta_id, orden, tipo_linea, producto_id, descripcion,
                                      unidad, cantidad_milesimas, origen_precio,
                                      precio_unitario_centavos, precio_lista_centavos,
                                      costo_unitario_centavos, alicuota_iva_bp, importe_centavos)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(l.id.as_str())
        .bind(venta.id.as_str())
        .bind(l.orden)
        .bind(l.tipo_linea.as_str())
        .bind(l.producto_id.as_deref())
        .bind(l.descripcion.as_str())
        .bind(l.unidad.as_str())
        .bind(l.cantidad_milesimas)
        .bind(l.origen_precio.as_deref())
        .bind(l.precio_unitario_centavos)
        .bind(l.precio_lista_centavos)
        .bind(l.costo_unitario_centavos)
        .bind(l.alicuota_iva_bp)
        .bind(l.importe_centavos)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // La venta descuenta stock: cantidad en negativo, origen apuntando al
        // ticket. El saldo sigue siendo la suma de movimientos (regla 4).
        if let (Some(producto_id), Some(mov_id)) = (&l.producto_id, &l.movimiento_stock_id) {
            sqlx::query(
                "INSERT INTO stock_movimiento (id, producto_id, tipo, cantidad_milesimas,
                                               costo_unitario_centavos, origen_tipo, origen_id,
                                               motivo, usuario_id, creado_en)
                 VALUES (?, ?, 'venta', ?, ?, 'venta', ?, NULL, ?, ?)",
            )
            .bind(mov_id.as_str())
            .bind(producto_id.as_str())
            .bind(-l.cantidad_milesimas)
            .bind(l.costo_unitario_centavos)
            .bind(venta.id.as_str())
            .bind(venta.usuario_id.as_str())
            .bind(venta.fecha.as_str())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    for p in &venta.pagos {
        sqlx::query(
            "INSERT INTO venta_pago (id, venta_id, orden, medio_pago_id, medio_pago_nombre,
                                     medio_pago_tipo, afecta_arqueo, monto_centavos,
                                     recibido_centavos, vuelto_centavos, referencia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(p.id.as_str())
        .bind(venta.id.as_str())
        .bind(p.orden)
        .bind(p.medio_pago_id.as_str())
        .bind(p.medio_pago_nombre.as_str())
        .bind(p.medio_pago_tipo.as_str())
        .bind(if p.afecta_arqueo { 1_i64 } else { 0_i64 })
        .bind(p.monto_centavos)
        .bind(p.recibido_centavos)
        .bind(p.vuelto_centavos)
        .bind(p.referencia.as_deref())
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(VentaRegistrada {
        id: venta.id,
        ticket_numero: ticket,
        fecha: venta.fecha,
        ya_existia: false,
    })
}
