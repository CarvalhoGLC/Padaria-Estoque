use crate::{errors::ApiResult, models::{Movement, Product}, AppState};
use axum::{
    extract::{Query, State},
    http::{header, HeaderValue},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;

#[derive(Deserialize)]
pub struct PeriodQuery {
    days: Option<i64>,
    product_id: Option<i64>,
}

impl PeriodQuery {
    fn window(&self) -> String {
        format!("-{} days", self.days.unwrap_or(30).clamp(1, 365))
    }
}

pub async fn summary(State(st): State<AppState>) -> ApiResult<Json<Value>> {
    let (products, value_cents, low): (i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*),
                CAST(ROUND(COALESCE(SUM(quantity * price_cents), 0)) AS INTEGER),
                COALESCE(SUM(quantity <= min_quantity), 0)
           FROM products",
    )
    .fetch_one(&st.pool)
    .await?;
    Ok(Json(json!({
        "products": products,
        "stock_value_cents": value_cents,
        "low_stock_count": low
    })))
}

#[derive(Serialize, FromRow)]
pub struct DayTotal {
    day: String,
    total: f64,
}

/// Saídas por dia (últimos `days` dias, padrão 30), opcionalmente de um produto.
pub async fn daily_out(
    State(st): State<AppState>,
    Query(q): Query<PeriodQuery>,
) -> ApiResult<Json<Vec<DayTotal>>> {
    let rows = sqlx::query_as::<_, DayTotal>(
        "SELECT date(created_at) AS day, SUM(quantity) AS total
           FROM movements
          WHERE kind = 'saida'
            AND created_at >= datetime('now', ?1)
            AND (?2 IS NULL OR product_id = ?2)
          GROUP BY day ORDER BY day",
    )
    .bind(q.window())
    .bind(q.product_id)
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize, FromRow)]
pub struct TopOut {
    product_id: i64,
    name: String,
    unit: String,
    total_out: f64,
    value_cents: i64,
}

/// Produtos que mais saíram no período. O valor usa o preço atual do produto.
pub async fn top_out(
    State(st): State<AppState>,
    Query(q): Query<PeriodQuery>,
) -> ApiResult<Json<Vec<TopOut>>> {
    let rows = sqlx::query_as::<_, TopOut>(
        "SELECT p.id AS product_id, p.name, p.unit,
                SUM(m.quantity) AS total_out,
                CAST(ROUND(SUM(m.quantity * p.price_cents)) AS INTEGER) AS value_cents
           FROM movements m JOIN products p ON p.id = m.product_id
          WHERE m.kind = 'saida' AND m.created_at >= datetime('now', ?1)
          GROUP BY p.id ORDER BY total_out DESC LIMIT 20",
    )
    .bind(q.window())
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(rows))
}

// ---------- Exportação CSV (separador ';' e decimal com vírgula, para o Excel pt-BR) ----------

fn text(s: &str) -> String {
    let mut v = s.to_string();
    if v.starts_with(['=', '+', '-', '@']) {
        v.insert(0, '\''); // evita injeção de fórmula em planilhas
    }
    if v.contains([';', '"', '\n', '\r']) {
        v = format!("\"{}\"", v.replace('"', "\"\""));
    }
    v
}

fn num(n: f64) -> String {
    n.to_string().replace('.', ",")
}

fn csv_response(filename: &str, body: String) -> Response {
    let mut res = format!("\u{feff}{body}").into_response(); // BOM: acentos corretos no Excel
    let h = res.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/csv; charset=utf-8"));
    h.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{filename}\"")).unwrap(),
    );
    res
}

pub async fn export_products(State(st): State<AppState>) -> ApiResult<Response> {
    let rows = sqlx::query_as::<_, Product>("SELECT * FROM products ORDER BY name")
        .fetch_all(&st.pool)
        .await?;
    let mut out = String::from("id;nome;categoria;unidade;quantidade;minimo;preco_reais\n");
    for p in rows {
        out += &format!(
            "{};{};{};{};{};{};{}\n",
            p.id, text(&p.name), text(&p.category), text(&p.unit),
            num(p.quantity), num(p.min_quantity), num(p.price_cents as f64 / 100.0)
        );
    }
    Ok(csv_response("produtos.csv", out))
}

pub async fn export_movements(State(st): State<AppState>) -> ApiResult<Response> {
    let rows = sqlx::query_as::<_, Movement>("SELECT * FROM movements ORDER BY id")
        .fetch_all(&st.pool)
        .await?;
    let mut out = String::from("id;produto_id;tipo;quantidade;observacao;data\n");
    for m in rows {
        out += &format!(
            "{};{};{};{};{};{}\n",
            m.id, m.product_id, m.kind, num(m.quantity),
            text(m.note.as_deref().unwrap_or("")), m.created_at
        );
    }
    Ok(csv_response("movimentacoes.csv", out))
}