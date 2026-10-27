import { useEffect, useState, useCallback } from 'react';
import { api, brl, getToken, setToken } from './api.js';

const emptyForm = { name: '', category: 'produto', unit: 'un', quantity: 0, min_quantity: 0, price: '0' };

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function LoginForm({ onLoginSuccess }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isRegistering) {
        await api.register({ username, password });
        setSuccessMsg('Conta criada com sucesso! Faça login.');
        setIsRegistering(false);
        setPassword('');
      } else {
        await onLoginSuccess({ username, password });
      }
    } catch (err) {
      setError(err.message || 'Ocorreu um erro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="modal login-card">
        <div className="login-header">
          <h2>🥖 Estoque Atêlie dos Pães</h2>
          <p className="muted">
            {isRegistering ? 'Crie a sua conta de acesso' : 'Entre com suas credenciais para continuar'}
          </p>
        </div>

        {error && <div className="error">{error}</div>}
        {successMsg && (
          <div className="success" style={{ background: '#d8f0d8', color: '#1d5a1d', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.9rem' }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          <label>
            Usuário
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Digite seu usuário"
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <button type="submit" disabled={loading} style={{ marginTop: '8px' }}>
            {loading ? 'A processar...' : isRegistering ? 'Criar Conta' : 'Entrar'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            type="button"
            className="ghost"
            style={{ border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: '0.85rem' }}
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
              setSuccessMsg('');
            }}
          >
            {isRegistering ? 'Já tem uma conta? Faça login' : 'Não tem conta? Crie a primeira conta'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductForm({ product, onSave, onClose }) {
  const [f, setF] = useState(
    product ? { ...product, price: (product.price_cents / 100).toFixed(2) } : emptyForm
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    onSave({
      name: f.name,
      category: f.category,
      unit: f.unit,
      quantity: Number(f.quantity),
      min_quantity: Number(f.min_quantity),
      price_cents: Math.round(Number(String(f.price).replace(',', '.')) * 100),
    });
  };

  return (
    <Modal title={product ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>Nome<input required value={f.name} onChange={set('name')} /></label>
        <div className="row">
          <label>Categoria
            <input list="cats" value={f.category} onChange={set('category')} />
            <datalist id="cats"><option value="produto" /><option value="insumo" /><option value="embalagem" /></datalist>
          </label>
          <label>Unidade
            <select value={f.unit} onChange={set('unit')}>
              <option>un</option><option>kg</option><option>g</option><option>L</option><option>pct</option>
            </select>
          </label>
        </div>
        <div className="row">
          {!product && (
            <label>Qtd. inicial<input type="number" min="0" step="any" value={f.quantity} onChange={set('quantity')} /></label>
          )}
          <label>Estoque mínimo<input type="number" min="0" step="any" value={f.min_quantity} onChange={set('min_quantity')} /></label>
          <label>Preço de Venda (R$)<input value={f.price} onChange={set('price')} /></label>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function MovementForm({ product, onSave, onClose }) {
  const [kind, setKind] = useState('entrada');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    onSave({ product_id: product.id, kind, quantity: Number(quantity), note: note || null });
  };

  return (
    <Modal title={`Movimentar: ${product.name}`} onClose={onClose}>
      <p className="muted">Estoque atual: {product.quantity} {product.unit}</p>
      <form onSubmit={submit} className="form">
        <label>Tipo
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="entrada">Entrada (compra/produção)</option>
            <option value="saida">Saída (venda/uso/perda)</option>
            <option value="ajuste">Ajuste (definir quantidade exata)</option>
          </select>
        </label>
        <label>{kind === 'ajuste' ? 'Nova quantidade' : 'Quantidade'}
          <input required type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        <label>Observação<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="opcional" /></label>
        <div className="actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit">Registrar</button>
        </div>
      </form>
    </Modal>
  );
}

function ProductTable({ products, onEdit, onMove, onDelete }) {
  if (!products.length) return <p className="muted">Nenhum produto encontrado.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>Preço</th><th></th></tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const low = p.quantity <= p.min_quantity;
            return (
              <tr key={p.id} className={low ? 'low' : ''}>
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td><strong>{p.quantity}</strong> {p.unit} {low && <span className="badge">baixo</span>}</td>
                <td>{p.min_quantity} {p.unit}</td>
                <td>{brl(p.price_cents)}</td>
                <td className="btns">
                  <button onClick={() => onMove(p)}>Movimentar</button>
                  <button className="ghost" onClick={() => onEdit(p)}>Editar</button>
                  <button className="danger" onClick={() => onDelete(p)}>Excluir</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SalesComponent({ products, onSold }) {
  const [quantities, setQuantities] = useState({});
  const [note, setNote] = useState('');
  const [salesList, setSalesList] = useState([]);

  const getProductUnitCosts = () => {
    const costs = JSON.parse(localStorage.getItem('padaria_costs') || '[]');
    const totals = {};
    costs.forEach(c => {
      const uCost = c.unitCents || Math.round((c.totalCents || 0) / (c.producedQty || 1));
      totals[c.product_id] = (totals[c.product_id] || 0) + uCost;
    });
    return totals;
  };

  const loadSales = useCallback(async () => {
    try {
      const data = await api.sales({ limit: 50 });
      setSalesList(data);
    } catch {
      setSalesList([]);
    }
  }, []);

  useEffect(() => { loadSales(); }, [loadSales]);

  const handleQtyChange = (id, val) => {
    setQuantities({ ...quantities, [id]: val });
  };

  const totalCents = products.reduce((acc, p) => {
    const q = Number(quantities[p.id] || 0);
    return acc + (q * p.price_cents);
  }, 0);

  const registerSale = async (e) => {
    e.preventDefault();
    const items = Object.entries(quantities)
      .filter(([_, q]) => Number(q) > 0)
      .map(([product_id, quantity]) => ({
        product_id: Number(product_id),
        quantity: Number(quantity)
      }));

    if (!items.length) return;

    try {
      await api.createSale({ items, note: note || null });
      setQuantities({});
      setNote('');
      loadSales();
      onSold();
      alert('Venda registrada com sucesso!');
    } catch (err) {
      alert('Erro ao registrar venda: ' + err.message);
    }
  };

  const cancelSale = async (id) => {
    if (confirm('Deseja cancelar esta venda? O estoque será reposto.')) {
      try {
        await api.deleteSale(id);
        loadSales();
        onSold();
      } catch (err) {
        alert('Erro ao cancelar venda: ' + err.message);
      }
    }
  };

  const productUnitCost = getProductUnitCosts();

  return (
    <div>
      <form onSubmit={registerSale} className="form" style={{ background: 'var(--card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--line)', marginBottom: '20px' }}>
        <h3>Registrar Nova Venda</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Produto</th><th>Em estoque</th><th>Preço</th><th>Quantidade</th></tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.quantity} {p.unit}</td>
                  <td>{brl(p.price_cents)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      max={p.quantity}
                      step="any"
                      value={quantities[p.id] || ''}
                      onChange={(e) => handleQtyChange(p.id, e.target.value)}
                      style={{ width: '100px' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="Observação (ex: Nome do cliente)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ flex: 1 }}
          />
          <strong>Total: {brl(totalCents)}</strong>
          <button type="submit" disabled={totalCents === 0}>Finalizar Venda</button>
        </div>
      </form>

      <h3>Histórico de Vendas & Custos Associados</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th>Itens da Venda</th><th>Faturamento</th><th>Custo de Produção</th><th>Lucro Líquido</th><th>Observação</th><th>Ação</th></tr>
          </thead>
          <tbody>
            {salesList.map(s => {
              const saleCostCents = s.items.reduce((sum, i) => {
                const unitCost = productUnitCost[i.product_id] || 0;
                return sum + (unitCost * i.quantity);
              }, 0);
              const netProfit = s.total_cents - saleCostCents;

              return (
                <tr key={s.id}>
                  <td>{s.created_at}</td>
                  <td>
                    {s.items.map((i, idx) => (
                      <div key={idx}>{i.quantity}× {i.name} ({brl(i.unit_price_cents)})</div>
                    ))}
                  </td>
                  <td><strong>{brl(s.total_cents)}</strong></td>
                  <td style={{ color: 'var(--danger)' }}>{brl(saleCostCents)}</td>
                  <td><strong style={{ color: netProfit >= 0 ? 'var(--success, #2e7d32)' : 'var(--danger)' }}>{brl(netProfit)}</strong></td>
                  <td>{s.note || '-'}</td>
                  <td>
                    <button className="danger" onClick={() => cancelSale(s.id)}>Cancelar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!salesList.length && <p className="muted">Nenhuma venda registrada.</p>}
      </div>
    </div>
  );
}

function InboundCosts({ products }) {
  const [costs, setCosts] = useState(() => {
    const saved = localStorage.getItem('padaria_costs');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedProduct, setSelectedProduct] = useState('');
  const [ingredientName, setIngredientName] = useState('');
  const [totalCostReais, setTotalCostReais] = useState('');
  const [producedQty, setProducedQty] = useState('1');

  const saveCost = (e) => {
    e.preventDefault();
    const totalCents = Math.round(Number(totalCostReais.replace(',', '.')) * 100);
    const qty = Number(producedQty) || 1;
    const unitCents = Math.round(totalCents / qty);

    const newCost = {
      id: Date.now(),
      product_id: Number(selectedProduct),
      ingredient: ingredientName,
      totalCents,
      producedQty: qty,
      unitCents
    };
    const updated = [...costs, newCost];
    setCosts(updated);
    localStorage.setItem('padaria_costs', JSON.stringify(updated));
    setIngredientName('');
    setTotalCostReais('');
    setProducedQty('1');
  };

  const removeCost = (id) => {
    const updated = costs.filter(c => c.id !== id);
    setCosts(updated);
    localStorage.setItem('padaria_costs', JSON.stringify(updated));
  };

  const productMap = Object.fromEntries(products.map(p => [p.id, p.name]));

  const productTotals = costs.reduce((acc, c) => {
    const uCost = c.unitCents || Math.round((c.totalCents || 0) / (c.producedQty || 1));
    acc[c.product_id] = (acc[c.product_id] || 0) + uCost;
    return acc;
  }, {});

  return (
    <div>
      <form onSubmit={saveCost} className="form" style={{ background: 'var(--card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--line)', marginBottom: '20px' }}>
        <h3>Adicionar Gasto de Insumo / Produção</h3>
        <div className="row">
          <label>Produto Final
            <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} required>
              <option value="">Selecione o produto...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Nome do Insumo / Gasto
            <input required value={ingredientName} onChange={(e) => setIngredientName(e.target.value)} placeholder="Ex: Farinha, Embalagem" />
          </label>
        </div>
        <div className="row" style={{ marginTop: '10px' }}>
          <label>Custo Total deste Insumo (R$)
            <input required value={totalCostReais} onChange={(e) => setTotalCostReais(e.target.value)} placeholder="Ex: 20,00" />
          </label>
          <label>Quantos itens rende este lote?
            <input required type="number" min="1" step="any" value={producedQty} onChange={(e) => setProducedQty(e.target.value)} placeholder="Ex: 50" />
          </label>
        </div>
        <div className="actions" style={{ marginTop: '12px' }}>
          <button type="submit">Adicionar Custo ao Produto</button>
        </div>
      </form>

      <h3>Custo Unitário de Produção por Produto</h3>
      <div className="table-wrap" style={{ marginBottom: '20px' }}>
        <table>
          <thead>
            <tr><th>Produto</th><th>Custo Unitário (Soma dos Insumos)</th><th>Preço de Venda</th><th>Margem Unitária</th></tr>
          </thead>
          <tbody>
            {products.map(p => {
              const unitCost = productTotals[p.id] || 0;
              const margin = p.price_cents - unitCost;
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{brl(unitCost)}</td>
                  <td>{brl(p.price_cents)}</td>
                  <td><strong style={{ color: margin >= 0 ? 'var(--success, #2e7d32)' : 'var(--danger)' }}>{brl(margin)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Histórico de Insumos Cadastrados</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Produto</th><th>Insumo / Gasto</th><th>Custo Total</th><th>Rendimento do Lote</th><th>Custo por Unidade</th><th></th></tr>
          </thead>
          <tbody>
            {costs.map(c => {
              const uCost = c.unitCents || Math.round((c.totalCents || 0) / (c.producedQty || 1));
              return (
                <tr key={c.id}>
                  <td>{productMap[c.product_id] || 'Produto Removido'}</td>
                  <td>{c.ingredient}</td>
                  <td>{brl(c.totalCents || (c.cents * (c.producedQty || 1)))}</td>
                  <td>{c.producedQty || 1} un</td>
                  <td><strong>{brl(uCost)}</strong></td>
                  <td>
                    <button className="danger" onClick={() => removeCost(c.id)}>Excluir</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!costs.length && <p className="muted">Nenhum custo de insumo cadastrado.</p>}
      </div>
    </div>
  );
}

function Movements({ products }) {
  const [rows, setRows] = useState([]);
  const [pid, setPid] = useState('');
  const names = Object.fromEntries(products.map((p) => [p.id, p.name]));

  useEffect(() => {
    const params = pid ? { product_id: pid, limit: 200 } : { limit: 200 };
    api.movements(params).then(setRows).catch(() => setRows([]));
  }, [pid, products]);

  return (
    <>
      <div className="toolbar">
        <select value={pid} onChange={(e) => setPid(e.target.value)}>
          <option value="">Todos os produtos</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Qtd.</th><th>Observação</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.created_at}</td>
                <td>{names[m.product_id] || `#${m.product_id}`}</td>
                <td><span className={`tag ${m.kind}`}>{m.kind}</span></td>
                <td>{m.quantity}</td>
                <td>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">Sem movimentações.</p>}
      </div>
    </>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getToken());
  const [tab, setTab] = useState('produtos');
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);
  const [error, setError] = useState('');

  const handleLogin = async (credentials) => {
    await api.login(credentials);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setToken(null);
    setIsAuthenticated(false);
  };

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setProducts(await api.products({ search, category }));
      setError('');
    } catch (e) {
      setError('Não consegui falar com a API: ' + e.message);
    }
  }, [search, category, isAuthenticated]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, after) => {
    try { await fn(); after?.(); await load(); setError(''); } catch (e) { setError(e.message); }
  };

  const saveProduct = (data) =>
    run(() => (editing === 'new' ? api.createProduct(data) : api.updateProduct(editing.id, data)), () => setEditing(null));
  const saveMovement = (data) => run(() => api.createMovement(data), () => setMoving(null));
  const remove = (p) => confirm(`Excluir "${p.name}" e todo o histórico dele?`) && run(() => api.deleteProduct(p.id));

  const lowList = products.filter((p) => p.quantity <= p.min_quantity);
  const categories = [...new Set(products.map((p) => p.category))];
  const shown = tab === 'baixo' ? lowList : products;

  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLogin} />;
  }

  return (
    <div className="app">
      <header>
        <h1>🥖 Estoque da Padaria</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setEditing('new')}>+ Novo produto</button>
          <button className="ghost" onClick={handleLogout}>Sair</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <nav>
        <button className={tab === 'produtos' ? 'active' : ''} onClick={() => setTab('produtos')}>Produtos ({products.length})</button>
        <button className={tab === 'baixo' ? 'active' : ''} onClick={() => setTab('baixo')}>Baixo estoque ({lowList.length})</button>
        <button className={tab === 'vendas' ? 'active' : ''} onClick={() => setTab('vendas')}>Vendas</button>
        <button className={tab === 'insumos' ? 'active' : ''} onClick={() => setTab('insumos')}>Insumos & Custos</button>
        <button className={tab === 'mov' ? 'active' : ''} onClick={() => setTab('mov')}>Movimentações</button>
      </nav>

      {(tab === 'produtos' || tab === 'baixo') && (
        <>
          <div className="toolbar">
            <input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <ProductTable products={shown} onEdit={setEditing} onMove={setMoving} onDelete={remove} />
        </>
      )}
      {tab === 'vendas' && <SalesComponent products={products} onSold={load} />}
      {tab === 'insumos' && <InboundCosts products={products} />}
      {tab === 'mov' && <Movements products={products} />}

      {editing && (
        <ProductForm product={editing === 'new' ? null : editing} onSave={saveProduct} onClose={() => setEditing(null)} />
      )}
      {moving && <MovementForm product={moving} onSave={saveMovement} onClose={() => setMoving(null)} />}
    </div>
  );
}