CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    category     TEXT    NOT NULL DEFAULT 'geral',
    unit         TEXT    NOT NULL DEFAULT 'un',
    quantity     REAL    NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_quantity REAL    NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
    price_cents  INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS movements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL CHECK (kind IN ('entrada', 'saida', 'ajuste')),
    quantity   REAL    NOT NULL,
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_movements_product ON movements(product_id);