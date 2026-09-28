use serde::Deserialize;
use sqlx::{Acquire, Row};
use tauri::{AppHandle, Runtime};

use super::venta::{LineaEntrada, PagoEntrada, VentaRegistrada};
use crate::db::pool::pool;

/// El ticket espejo que anula a otro. Lo arma el cliente, que ya tiene el
/// detalle del original en pantalla, y aca se verifica contra la base: los
/// montos tienen que ser exactamente el negativo de los del original.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnulacionEntrada {
    pub id: String,
    pub venta_anulada_id: String,
    pub caja_id: String,
    pub caja_sesion_id: String,
    pub usuario_id: String,
    pub fecha: String,
    pub motivo: String,
    pub subtotal_centavos: i64,
    pub descuento_centavos: i64,
    pub total_centavos: i64,
    pub lineas: Vec<LineaEntrada>,
    pub pagos: Vec<PagoEntrada>,
}

/// Anula una venta con un ticket espejo en negativo, en UNA transaccion.
///
/// Las ventas no se editan ni se borran (regla 5): anular es registrar un
/// hecho nuevo que referencia al original. Los dos quedan, y el saldo del dia
/// es la suma de ambos.
///
/// El espejo se verifica contra el original leido de la base, no contra lo que
/// diga el cliente: si los numeros no son el negativo exacto, se rechaza. El
/// indice unico sobre venta_anulada_id es el que impide anular dos veces, y
/// esa barrera es del motor, no de esta funcion.
#[tauri::command]
pub async fn anular_venta<R: Runtime>(
    app: AppHandle<R>,
    anulacion: AnulacionEntrada,
) -> Result<VentaRegistrada, String> {
    if anulacion.motivo.trim().is_empty() {
        return Err("La anulacion necesita un motivo.".into());
    }
    if anulacion.total_centavos > 0 {
        return Err("El total de una anulacion no puede ser positivo.".into());
    }
    if anulacion.total_centavos != anulacion.subtotal_centavos - anulacion.descuento_centavos {
        return Err("El total del espejo no es subtotal menos descuento.".into());
    }

    let db = pool(&app).await?;
    let mut conn = db.acquire().await.map_err(|e| e.to_string())?;
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut tx = conn.begin().await.map_err(|e| e.to_string())?;

    // Idempotencia por el UUID del espejo (regla 13).
    let ya = sqlx::query("SELECT ticket_numero, fecha FROM venta WHERE id = ?")
        .bind(anulacion.id.as_str())
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    if let Some(fila) = ya {
        return Ok(VentaRegistrada {
            id: anulacion.id,
            ticket_numero: fila.try_get("ticket_numero").map_err(|e| e.to_string())?,
            fecha: fila.try_get("fecha").map_err(|e| e.to_string())?,
            ya_existia: true,
        });
    }

    // El original, leido de la base. Es la unica fuente que vale.
    let original = sqlx::query(
        "SELECT tipo, subtotal_centavos, descuento_centavos, total_centavos
           FROM venta WHERE id = ?",
    )
    .bind(anulacion.venta_anulada_id.as_str())
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "La venta que se quiere anular no existe.".to_string())?;

    let tipo: String = original.try_get("tipo").map_err(|e| e.to_string())?;
    if tipo != "venta" {
        return Err("Solo se puede anular una venta, no otra anulacion.".into());
    }
    let sub_orig: i64 = original.try_get("subtotal_centavos").map_err(|e| e.to_string())?;
    let desc_orig: i64 = original.try_get("descuento_centavos").map_err(|e| e.to_string())?;
    let tot_orig: i64 = original.try_get("total_centavos").map_err(|e| e.to_string())?;

    if anulacion.subtotal_centavos != -sub_orig
        || anulacion.descuento_centavos != -desc_orig
        || anulacion.total_centavos != -tot_orig
    {
        return Err(format!(
            "El espejo no coincide con el original: total {} contra {}.",
            anulacion.total_centavos, -tot_orig
        ));
    }

    let suma_lineas: i64 = anulacion.lineas.iter().map(|l| l.importe_centavos).sum();
    if suma_lineas != anulacion.subtotal_centavos {
        return Err("Las lineas del espejo no suman su subtotal.".into());
    }
    let suma_pagos: i64 = anulacion.pagos.iter().map(|p| p.monto_centavos).sum();
    if suma_pagos != anulacion.total_centavos {
        return Err("Los pagos del espejo no suman su total.".into());
    }

    let clave = format!("ticket:{}", anulacion.caja_id);
    sqlx::query("INSERT OR IGNORE INTO secuencia (nombre, valor) VALUES (?, 0)")
        .bind(clave.as_str())
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let ticket: i64 =
        sqlx::query("UPDATE secuencia SET valor = valor + 1 WHERE nombre = ? RETURNING valor")
            .bind(clave.as_str())
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .try_get("valor")
            .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO venta (id, caja_id, caja_sesion_id, usuario_id, tipo, venta_anulada_id,
                            motivo, ticket_numero, fecha, subtotal_centavos,
                            descuento_centavos, total_centavos)
         VALUES (?, ?, ?, ?, 'anulacion', ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(anulacion.id.as_str())
    .bind(anulacion.caja_id.as_str())
    .bind(anulacion.caja_sesion_id.as_str())
    .bind(anulacion.usuario_id.as_str())
    .bind(anulacion.venta_anulada_id.as_str())
    .bind(anulacion.motivo.trim())
    .bind(ticket)
    .bind(anulacion.fecha.as_str())
    .bind(anulacion.subtotal_centavos)
    .bind(anulacion.descuento_centavos)
    .bind(anulacion.total_centavos)
    .execute(&mut *tx)
    .await
    // El unico sobre venta_anulada_id avisa aca si ya estaba anulada.
    .map_err(|e| {
        let t = e.to_string();
        if t.contains("venta_anulada_id") {
            "Ese ticket ya fue anulado.".to_string()
        } else {
            t
        }
    })?;

    for l in &anulacion.lineas {
        sqlx::query(
            "INSERT INTO venta_linea (id, venta_id, orden, tipo_linea, producto_id, descripcion,
                                      unidad, cantidad_milesimas, origen_precio,
                                      precio_unitario_centavos, precio_lista_centavos,
                                      costo_unitario_centavos, alicuota_iva_bp, importe_centavos)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(l.id.as_str())
        .bind(anulacion.id.as_str())
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

        // La anulacion devuelve el stock: la cantidad de la linea espejo ya
        // viene en negativo, asi que el movimiento es su opuesto, positivo.
        if let (Some(producto_id), Some(mov_id)) = (&l.producto_id, &l.movimiento_stock_id) {
            sqlx::query(
                "INSERT INTO stock_movimiento (id, producto_id, tipo, cantidad_milesimas,
                                               costo_unitario_centavos, origen_tipo, origen_id,
                                               motivo, usuario_id, creado_en)
                 VALUES (?, ?, 'anulacion', ?, ?, 'anulacion', ?, ?, ?, ?)",
            )
            .bind(mov_id.as_str())
            .bind(producto_id.as_str())
            .bind(-l.cantidad_milesimas)
            .bind(l.costo_unitario_centavos)
            .bind(anulacion.id.as_str())
            .bind(anulacion.motivo.trim())
            .bind(anulacion.usuario_id.as_str())
            .bind(anulacion.fecha.as_str())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    for p in &anulacion.pagos {
        sqlx::query(
            "INSERT INTO venta_pago (id, venta_id, orden, medio_pago_id, medio_pago_nombre,
                                     medio_pago_tipo, afecta_arqueo, monto_centavos,
                                     recibido_centavos, vuelto_centavos, referencia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)",
        )
        .bind(p.id.as_str())
        .bind(anulacion.id.as_str())
        .bind(p.orden)
        .bind(p.medio_pago_id.as_str())
        .bind(p.medio_pago_nombre.as_str())
        .bind(p.medio_pago_tipo.as_str())
        .bind(if p.afecta_arqueo { 1_i64 } else { 0_i64 })
        .bind(p.monto_centavos)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(VentaRegistrada {
        id: anulacion.id,
        ticket_numero: ticket,
        fecha: anulacion.fecha,
        ya_existia: false,
    })
}
