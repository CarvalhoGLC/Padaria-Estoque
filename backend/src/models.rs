use crate::errors::{ApiResult, AppError};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, FromRow)]
pub struct Product {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub unit: String,
    pub quantity: f64,
    pub min_quantity: f64,
    pub price_cents: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct ProductInput {
    pub name: String,
    #[serde(default = "default_category")]
    pub category: String,
    #[serde(default = "default_unit")]
    pub unit: String,
    #[serde(default)]
    pub quantity: f64,
    #[serde(default)]
    pub min_quantity: f64,
    #[serde(default)]
    pub price_cents: i64,
}

fn default_category() -> String {
    "geral".into()
}
fn default_unit() -> String {
    "un".into()
}

impl ProductInput {
    pub fn validate(&self) -> ApiResult<()> {
        if self.name.trim().is_empty() {
            return Err(AppError::BadRequest("o nome é obrigatório".into()));
        }
        if self.quantity < 0.0 || self.min_quantity < 0.0 || self.price_cents < 0 {
            return Err(AppError::BadRequest(
                "quantidade, estoque mínimo e preço não podem ser negativos".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Serialize, FromRow)]
pub struct Movement {
    pub id: i64,
    pub product_id: i64,
    pub kind: String,
    pub quantity: f64,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct MovementInput {
    pub product_id: i64,
    /// "entrada" | "saida" | "ajuste" (ajuste = define a quantidade absoluta)
    pub kind: String,
    pub quantity: f64,
    pub note: Option<String>,
}

#[derive(Deserialize)]
pub struct ProductFilter {
    pub category: Option<String>,
    pub search: Option<String>,
}

#[derive(Deserialize)]
pub struct MovementFilter {
    pub product_id: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct SaleItemInput {
    pub product_id: i64,
    pub quantity: f64,
}

#[derive(Deserialize)]
pub struct SaleInput {
    pub items: Vec<SaleItemInput>,
    pub note: Option<String>,
}

#[derive(Deserialize)]
pub struct SalesQuery {
    pub limit: Option<i64>,
}