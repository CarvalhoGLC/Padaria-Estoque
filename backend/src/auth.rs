use crate::{errors::{ApiResult, AppError}, AppState};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{Request, State},
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

const TOKEN_HOURS: u64 = 12;

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

#[derive(Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
}

pub fn verify_headers(headers: &HeaderMap, secret: &str) -> ApiResult<Claims> {
    let token = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;
    decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &Validation::default())
        .map(|d| d.claims)
        .map_err(|_| AppError::Unauthorized)
}

/// Middleware: se JWT_SECRET não estiver definido, a API fica aberta (modo dev).
pub async fn require_auth(
    State(st): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    if let Some(secret) = &st.jwt_secret {
        verify_headers(req.headers(), secret)?;
    }
    Ok(next.run(req).await)
}

/// O primeiro usuário pode se registrar livremente; os demais precisam de um token válido.
pub async fn register(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(c): Json<Credentials>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let secret = st.jwt_secret.as_deref().ok_or_else(|| {
        AppError::BadRequest("autenticação desativada: defina JWT_SECRET".into())
    })?;

    let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&st.pool)
        .await?;
    if users > 0 {
        verify_headers(&headers, secret)?;
    }

    let username = c.username.trim();
    if username.len() < 3 {
        return Err(AppError::BadRequest("usuário deve ter ao menos 3 caracteres".into()));
    }
    if c.password.len() < 8 {
        return Err(AppError::BadRequest("senha deve ter ao menos 8 caracteres".into()));
    }

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(c.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .to_string();

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id",
    )
    .bind(username)
    .bind(hash)
    .fetch_one(&st.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({ "id": id, "username": username }))))
}

pub async fn login(
    State(st): State<AppState>,
    Json(c): Json<Credentials>,
) -> ApiResult<Json<Value>> {
    let secret = st.jwt_secret.as_deref().ok_or_else(|| {
        AppError::BadRequest("autenticação desativada: defina JWT_SECRET".into())
    })?;

    let row: Option<(String,)> =
        sqlx::query_as("SELECT password_hash FROM users WHERE username = ?")
            .bind(c.username.trim())
            .fetch_optional(&st.pool)
            .await?;
    let (hash,) = row.ok_or(AppError::Unauthorized)?;
    let parsed = PasswordHash::new(&hash).map_err(|e| AppError::Internal(e.to_string()))?;
    Argon2::default()
        .verify_password(c.password.as_bytes(), &parsed)
        .map_err(|_| AppError::Unauthorized)?;

    let exp = (SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
        + TOKEN_HOURS * 3600) as usize;
    let token = encode(
        &Header::default(),
        &Claims { sub: c.username.trim().to_string(), exp },
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(json!({ "token": token, "expires_in_hours": TOKEN_HOURS })))
}