use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub enum AppError {
    NotFound,
    BadRequest(String),
    Conflict(String),
    Unauthorized,
    Internal(String),
}

pub type ApiResult<T> = Result<T, AppError>;

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match &e {
            sqlx::Error::RowNotFound => AppError::NotFound,
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                AppError::Conflict("já existe um registro com esse nome".into())
            }
            _ => AppError::Internal(e.to_string()),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "não encontrado".to_string()),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            AppError::Conflict(m) => (StatusCode::CONFLICT, m),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "não autorizado".to_string()),
            AppError::Internal(e) => {
                tracing::error!("erro interno: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "erro interno".to_string())
            }
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}