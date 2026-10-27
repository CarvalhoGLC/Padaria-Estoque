# padaria-estoque

API REST de estoque de padaria em Rust (Axum + SQLx + SQLite).

## Rodar
    cp .env.example .env
    cargo run

Requer Rust recente (1.85+): https://rustup.rs
O banco e as tabelas são criados automaticamente.

## Com Docker
    echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
    docker compose up --build -d

Os dados ficam no volume `padaria-data`.

## Autenticação (JWT)
Defina `JWT_SECRET` e todas as rotas, exceto `/health` e `/auth/*`, passam a exigir
`Authorization: Bearer <token>`. Sem `JWT_SECRET` a API fica aberta (modo dev).

    # o primeiro usuário se registra livremente; os seguintes precisam de token
    curl -XPOST localhost:3000/auth/register -H 'Content-Type: application/json' \
      -d '{"username":"admin","password":"senha-forte-1"}'
    curl -XPOST localhost:3000/auth/login -H 'Content-Type: application/json' \
      -d '{"username":"admin","password":"senha-forte-1"}'     # -> {"token": "..."}

Token vale 12 horas. Senha mínima de 8 caracteres, guardada com Argon2.

## Endpoints
| Método | Rota | Descrição |
|---|---|---|
| GET | /health | verificação (pública) |
| POST | /auth/register, /auth/login | usuários e token |
| GET | /products?category=&search= | lista produtos |
| POST | /products | cria produto |
| GET/PUT/DELETE | /products/:id | detalhe, edita cadastro, remove |
| GET | /products/low-stock | quantidade <= mínimo |
| POST | /movements | `kind`: entrada, saida ou ajuste |
| GET | /movements?product_id=&limit= | histórico |
| GET | /reports/summary | nº de produtos, valor do estoque, itens em baixa |
| GET | /reports/daily-out?days=30&product_id= | saídas por dia |
| GET | /reports/top-out?days=30 | produtos que mais saíram, com valor estimado |
| GET | /export/products.csv, /export/movements.csv | CSV para Excel (`;` e vírgula decimal) |

Preços em centavos (`price_cents`). "Saída" inclui vendas, uso na produção e perdas;
o valor em `top-out` usa o preço atual do produto.