const BASE_URL = 'http://localhost:3000';

export const getToken = () => localStorage.getItem('token');
export const setToken = (token) => {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
};

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  
  if (res.status === 401) {
    setToken(null);
    window.location.reload();
    throw new Error('Sessão expirada ou não autorizada');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'Erro na requisição');
  }

  if (res.status === 204) return null;

  return res.json();
}

export const api = {
  login: async (credentials) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (data.token) {
      setToken(data.token);
    }
    return data;
  },
  register: async (credentials) => {
    return await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },
  products: (params = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append("search", params.search);
    if (params.category) query.append("category", params.category); 
    return request(`/products?${query.toString()}`);
  },
  createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  movements: (params) => request(`/movements?${new URLSearchParams(params)}`),
  createMovement: (data) => request('/movements', { method: 'POST', body: JSON.stringify(data) }),
  sales: (params = {}) => request(`/sales?${new URLSearchParams(params)}`),
  createSale: (data) => request('/sales', { method: 'POST', body: JSON.stringify(data) }),
  deleteSale: (id) => request(`/sales/${id}`, { method: 'DELETE' }),
};

export const brl = (cents) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });