mod auth;
mod errors;
mod models;
mod reports;
mod sales;

use axum::{
    extract::{Path, Query, State},
    http::{header::{AUTHORIZATION, CONTENT_TYPE}, HeaderValue, Method, StatusCode},
    middleware,
    routing::{get, post, delete},
    Json, Router,
};
use errors::{ApiResult, AppError};
use models::*;
use serde_json::json;
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, SqlitePool};
use std::str::FromStr;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    /// None = autenticação desativada (modo dev)
    pub jwt_secret: Option<String>,
}

// ---------- Handlers: produtos ----------

async fn list_products(
    State(st): State<AppState>,
    Query(f): Query<ProductFilter>,
) -> ApiResult<Json<Vec<Product>>> {
    let category_filter = f.category.filter(|s| !s.is_empty());
    let search_filter = f.search.filter(|s| !s.is_empty());
    let rows = sqlx::query_as::<_, Product>(
        "SELECT * FROM products
         WHERE (?1 IS NULL OR category = ?1)
           AND (?2 IS NULL OR name LIKE '%' || ?2 || '%')
         ORDER BY name",
    )
    .bind(category_filter)
    .bind(search_filter)
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(rows))
}

async fn low_stock(State(st): State<AppState>) -> ApiResult<Json<Vec<Product>>> {
    let rows = sqlx::query_as::<_, Product>(
        "SELECT * FROM products WHERE quantity <= min_quantity ORDER BY name",
    )
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(rows))
}

async fn get_product(
    State(st): State<AppState>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Product>> {
    let p = sqlx::query_as::<_, Product>("SELECT * FROM products WHERE id = ?")
        .bind(id)
        .fetch_one(&st.pool)
        .await?;
    Ok(Json(p))
}

async fn create_product(
    State(st): State<AppState>,
    Json(input): Json<ProductInput>,
) -> ApiResult<(StatusCode, Json<Product>)> {
    input.validate()?;
    let p = sqlx::query_as::<_, Product>(
        "INSERT INTO products (name, category, unit, quantity, min_quantity, price_cents)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
    )
    .bind(input.name.trim())
    .bind(&input.category)
    .bind(&input.unit)
    .bind(input.quantity)
    .bind(input.min_quantity)
    .bind(input.price_cents)
    .fetch_one(&st.pool)
    .await?;

    if p.quantity > 0.0 {
        sqlx::query(
            "INSERT INTO movements (product_id, kind, quantity, note) VALUES (?, 'entrada', ?, 'estoque inicial')",
        )
        .bind(p.id)
        .bind(p.quantity)
        .execute(&st.pool)
        .await?;
    }
    Ok((StatusCode::CREATED, Json(p)))
}

/// Atualiza dados cadastrais. A quantidade só muda via /movements.
async fn update_product(
    State(st): State<AppState>,
    Path(id): Path<i64>,
    Json(input): Json<ProductInput>,
) -> ApiResult<Json<Product>> {
    input.validate()?;
    let p = sqlx::query_as::<_, Product>(
        "UPDATE products
            SET name = ?, category = ?, unit = ?, min_quantity = ?, price_cents = ?,
                updated_at = datetime('now')
          WHERE id = ? RETURNING *",
    )
    .bind(input.name.trim())
    .bind(&input.category)
    .bind(&input.unit)
    .bind(input.min_quantity)
    .bind(input.price_cents)
    .bind(id)
    .fetch_one(&st.pool)
    .await?;
    Ok(Json(p))
}

async fn delete_product(
    State(st): State<AppState>,
    Path(id): Path<i64>,
) -> ApiResult<StatusCode> {
    let r = sqlx::query("DELETE FROM products WHERE id = ?")
        .bind(id)
        .execute(&st.pool)
        .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---------- Handlers: movimentações ----------

async fn create_movement(
    State(st): State<AppState>,
    Json(input): Json<MovementInput>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    if !input.quantity.is_finite() || input.quantity < 0.0 {
        return Err(AppError::BadRequest("quantidade inválida".into()));
    }
    if input.kind != "ajuste" && input.quantity == 0.0 {
        return Err(AppError::BadRequest("a quantidade deve ser maior que zero".into()));
    }

    let mut tx = st.pool.begin().await?;

    let current: f64 = sqlx::query_scalar("SELECT quantity FROM products WHERE id = ?")
        .bind(input.product_id)
        .fetch_one(&mut *tx)
        .await?;

    let new_qty = match input.kind.as_str() {
        "entrada" => current + input.quantity,
        "saida" => {
            if input.quantity > current {
                return Err(AppError::BadRequest(format!(
                    "estoque insuficiente: disponível {current}, pedido {}",
                    input.quantity
                )));
            }
            current - input.quantity
        }
        "ajuste" => input.quantity,
        _ => {
            return Err(AppError::BadRequest(
                "kind deve ser 'entrada', 'saida' ou 'ajuste'".into(),
            ))
        }
    };

    sqlx::query("UPDATE products SET quantity = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(new_qty)
        .bind(input.product_id)
        .execute(&mut *tx)
        .await?;

    let m = sqlx::query_as::<_, Movement>(
        "INSERT INTO movements (product_id, kind, quantity, note) VALUES (?, ?, ?, ?) RETURNING *",
    )
    .bind(input.product_id)
    .bind(&input.kind)
    .bind(input.quantity)
    .bind(&input.note)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "movement": m, "new_quantity": new_qty })),
    ))
}

async fn list_movements(
    State(st): State<AppState>,
    Query(f): Query<MovementFilter>,
) -> ApiResult<Json<Vec<Movement>>> {
    let rows = sqlx::query_as::<_, Movement>(
        "SELECT * FROM movements
         WHERE (?1 IS NULL OR product_id = ?1)
         ORDER BY id DESC LIMIT ?2",
    )
    .bind(f.product_id)
    .bind(f.limit.unwrap_or(100).clamp(1, 1000))
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(rows))
}

// ---------- Main ----------

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://padaria.db".into());
    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let auth_off = std::env::var("AUTH_DISABLED").as_deref() == Ok("true");
    let jwt_secret = std::env::var("JWT_SECRET").ok().filter(|s| !s.is_empty());
    if jwt_secret.is_none() && !auth_off {
        panic!("defina JWT_SECRET (ou AUTH_DISABLED=true, só para desenvolvimento)");
    }
    match &jwt_secret {
        Some(s) if s.len() < 32 => panic!("JWT_SECRET deve ter ao menos 32 caracteres"),
        Some(_) => tracing::info!("autenticação JWT ativada"),
        None => tracing::warn!("AUTH_DISABLED=true: a API está ABERTA, sem login"),
    }

    let opts = SqliteConnectOptions::from_str(&db_url)
        .expect("DATABASE_URL inválida")
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await
        .expect("falha ao conectar no banco");

    for sql in [
        include_str!("../migrations/0001_init.sql"),
        include_str!("../migrations/0002_users.sql"),
        include_str!("../migrations/0003_sales.sql"),
    ] {
        sqlx::raw_sql(sql).execute(&pool).await.expect("falha ao criar tabelas");
    }

    let state = AppState { pool, jwt_secret };

    let protected = Router::new()
        .route("/products", get(list_products).post(create_product))
        .route("/products/low-stock", get(low_stock))
        .route("/products/:id", get(get_product).put(update_product).delete(delete_product))
        .route("/movements", get(list_movements).post(create_movement))
        .route("/sales", get(sales::list_sales).post(sales::create_sale))
        .route("/sales/:id", delete(sales::delete_sales))
        .route("/reports/summary", get(reports::summary))
        .route("/reports/daily-out", get(reports::daily_out))
        .route("/reports/top-out", get(reports::top_out))
        .route("/export/products.csv", get(reports::export_products))
        .route("/export/movements.csv", get(reports::export_movements))
        .layer(middleware::from_fn_with_state(state.clone(), auth::require_auth));

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE]);

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/auth/login", post(auth::login))
        .route("/auth/register", post(auth::register))
        .merge(protected)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("API rodando em http://{addr}");
    axum::serve(listener, app).await.unwrap();
}