import { useEffect, useState } from 'react';
import { api, brl } from '../api.js';
import '../sales.css';

const toNum = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const localDate = (utc) => new Date(utc.replace(' ', 'T') + 'Z');

export default function Sales({ onSold }) {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [qty, setQty] = useState({});
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // Lê os custos do localStorage e calcula o custo unitário por produto
  const getProductUnitCosts = () => {
    const costs = JSON.parse(localStorage.getItem('padaria_costs') || '[]');
    const totals = {};
    costs.forEach(c => {
      const uCost = c.unitCents || Math.round((c.totalCents || 0) / (c.producedQty || 1));
      totals[c.product_id] = (totals[c.product_id] || 0) + uCost;
    });
    return totals;
  };

  const load = async () => {
    try {
      const [p, s] = await Promise.all([api.products(), api.sales({ limit: 50 })]);
      setProducts(p);
      setSales(s);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };
  useEffect(() => { load(); }, []);

  const lines = products
    .map((p) => ({ p, q: toNum(qty[p.id]) }))
    .filter((l) => l.q > 0)
    .map((l) => ({ ...l, sub: Math.round(l.q * l.p.price_cents), over: l.q > l.p.quantity }));
  const total = lines.reduce((s, l) => s + l.sub, 0);
  const hasOver = lines.some((l) => l.over);
  const visible = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const today = new Date().toLocaleDateString();
  const todayTotal = sales
    .filter((s) => localDate(s.created_at).toLocaleDateString() === today)
    .reduce((sum, s) => sum + s.total_cents, 0);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.createSale({
        items: lines.map((l) => ({ product_id: l.p.id, quantity: l.q })),
        note: note || null,
      });
      setMsg({ ok: true, text: `Venda registrada: ${brl(r.total_cents)}` });
      setQty({});
      setNote('');
      await load();
      onSold?.();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const cancelSale = async (id) => {
    if (confirm('Deseja cancelar esta venda? O estoque será reposto.')) {
      try {
        await api.deleteSale(id);
        await load();
        onSold?.();
      } catch (e) {
        alert('Erro ao cancelar venda: ' + e.message);
      }
    }
  };

  const productUnitCost = getProductUnitCosts();

  return (
    <>
      {msg && <div className={msg.ok ? 'ok' : 'error'}>{msg.text}</div>}

      <div className="toolbar">
        <input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Produto</th><th>Em estoque</th><th>Preço</th><th>Quantidade</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const q = toNum(qty[p.id]);
              return (
                <tr key={p.id} className={q > p.quantity ? 'low' : ''}>
                  <td>{p.name}</td>
                  <td>{p.quantity} {p.unit}</td>
                  <td>{brl(p.price_cents)} / {p.unit}</td>
                  <td>
                    <input
                      className="qty" inputMode="decimal" placeholder="0"
                      value={qty[p.id] ?? ''}
                      onChange={(e) => setQty({ ...qty, [p.id]: e.target.value })}
                    />
                  </td>
                  <td>{q > 0 ? brl(Math.round(q * p.price_cents)) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && <p className="muted">Nenhum produto encontrado.</p>}
      </div>

      <div className="total-bar">
        <div>
          <div className="muted-s">Total a receber</div>
          <div className="total">{brl(total)}</div>
          {hasOver && <div className="warn">Quantidade maior que o estoque em algum item.</div>}
        </div>
        <input className="note" placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button disabled={!lines.length || hasOver || busy} onClick={submit}>Registrar venda</button>
      </div>

      <h3 className="h-sales">Histórico de Vendas & Custos <span className="muted-s">· hoje: {brl(todayTotal)}</span></h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Itens da Venda</th>
              <th>Faturamento</th>
              <th>Custo de Produção</th>
              <th>Lucro Líquido</th>
              <th>Observação</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => {
              const saleCostCents = s.items.reduce((sum, i) => {
                const unitCost = productUnitCost[i.product_id] || 0;
                return sum + (unitCost * i.quantity);
              }, 0);
              const netProfit = s.total_cents - saleCostCents;

              return (
                <tr key={s.id}>
                  <td>{localDate(s.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="wrap">
                    {s.items.map((i, idx) => (
                      <div key={idx}>{i.quantity}× {i.name} ({brl(i.unit_price_cents)})</div>
                    ))}
                  </td>
                  <td><strong>{brl(s.total_cents)}</strong></td>
                  <td style={{ color: 'var(--danger, #d32f2f)' }}>{brl(saleCostCents)}</td>
                  <td>
                    <strong style={{ color: netProfit >= 0 ? 'var(--success, #2e7d32)' : 'var(--danger, #d32f2f)' }}>
                      {brl(netProfit)}
                    </strong>
                  </td>
                  <td>{s.note || '—'}</td>
                  <td>
                    <button className="danger" onClick={() => cancelSale(s.id)}>Cancelar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!sales.length && <p className="muted">Nenhuma venda registrada.</p>}
      </div>
    </>
  );
}