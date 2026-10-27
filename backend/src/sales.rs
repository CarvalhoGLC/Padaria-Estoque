use core::f64;

use crate::{errors::{ApiResult, AppError}, AppState};
use crate::models::{SaleInput, SalesQuery};

use axum::{
    Json, extract::{Path, Query, State}, http::StatusCode,
};
use serde_json::{json, Value};



pub async fn create_sale(
    State(st): State<AppState>,
    Json(input): Json<SaleInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    if input.items.is_empty() {
        return Err(AppError::BadRequest("a venda precisa ter ao menos um item".into()));
    }
    if input.items.iter().any(|i| !i.quantity.is_finite() || i.quantity <= 0.0) {
        return Err(AppError::BadRequest("as quantidades devem ser maiores que zero".into()));
    }

    let mut tx = st.pool.begin().await?;

    let sale_id: i64 =
        sqlx::query_scalar("INSERT INTO sales (total_cents, note) VALUES (0, ?) RETURNING id")
            .bind(&input.note)
            .fetch_one(&mut *tx)
            .await?;

    let mut total: i64 = 0;
    let mut items_out = Vec::new();

    for it in &input.items {
        let row: Option<(String, f64, i64)> =
            sqlx::query_as("SELECT name, quantity, price_cents FROM products WHERE id = ?")
                .bind(it.product_id)
                .fetch_optional(&mut *tx)
                .await?;
        let (name, stock, price) = row.ok_or_else(|| {
            AppError::BadRequest(format!("produto {} não existe", it.product_id))
        })?;

        if it.quantity > stock {
            return Err(AppError::BadRequest(format!(
                "estoque insuficiente de {name}: disponível {stock}, pedido {}",
                it.quantity
            )));
        }

        let line = (it.quantity * price as f64).round() as i64;
        total += line;

        sqlx::query(
            "UPDATE products SET quantity = MAX(quantity - ?, 0), updated_at = datetime('now') WHERE id = ?",
        )
        .bind(it.quantity)
        .bind(it.product_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price_cents)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(sale_id)
        .bind(it.product_id)
        .bind(&name)
        .bind(it.quantity)
        .bind(price)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO movements (product_id, kind, quantity, note) VALUES (?, 'saida', ?, ?)",
        )
        .bind(it.product_id)
        .bind(it.quantity)
        .bind(format!("venda #{sale_id}"))
        .execute(&mut *tx)
        .await?;

        items_out.push(json!({
            "product_id": it.product_id,
            "name": name,
            "quantity": it.quantity,
            "unit_price_cents": price,
            "subtotal_cents": line
        }));
    }

    sqlx::query("UPDATE sales SET total_cents = ? WHERE id = ?")
        .bind(total)
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": sale_id, "total_cents": total, "items": items_out })),
    ))
}

pub async fn list_sales(
    State(st): State<AppState>,
    Query(q): Query<SalesQuery>,
) -> ApiResult<Json<Vec<Value>>> {
    let rows: Vec<(i64, i64, Option<String>, String, String)> = sqlx::query_as(
        "SELECT s.id, s.total_cents, s.note, s.created_at,
                COALESCE((SELECT json_group_array(json_object(
                    'product_id', i.product_id,
                    'name', i.product_name,
                    'quantity', i.quantity,
                    'unit_price_cents', i.unit_price_cents))
                  FROM sale_items i WHERE i.sale_id = s.id), '[]')
           FROM sales s ORDER BY s.id DESC LIMIT ?",
    )
    .bind(q.limit.unwrap_or(50).clamp(1, 500))
    .fetch_all(&st.pool)
    .await?;

    let out = rows
        .into_iter()
        .map(|(id, total, note, created_at, items)| {
            json!({
                "id": id,
                "total_cents": total,
                "note": note,
                "created_at": created_at,
                "items": serde_json::from_str::<Value>(&items).unwrap_or(json!([]))
            })
        })
        .collect();
    Ok(Json(out))
}

pub async fn delete_sales(
    State(st): State<AppState>,
    Path(sale_id): Path<i64>,
) -> ApiResult<StatusCode> {
    let mut tx = st.pool.begin().await?;

    let items: Vec<(Option<i64>, f64)> = sqlx::query_as(
        "SELECT product_id, quantity FROM sale_items WHERE sale_id = ?"
    )
    .bind(sale_id)
    .fetch_all(&mut *tx)
    .await?;

    if items.is_empty() {
        return Err(AppError::NotFound);
    }

    for (product_id, qty) in items {
        sqlx::query(
            "UPDATE products SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(qty)
        .bind(product_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("DELETE FROM movements WHERE note = ?")
        .bind(format!("venda #{sale_id}"))
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM sale_items WHERE sale_id = ?")
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM sales WHERE id = ?")
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}