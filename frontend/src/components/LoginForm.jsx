import { useState } from 'react';
import { api } from '../api';

export function LoginForm({ onLoginSuccess }) {
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
              placeholder="•••••••• (mín. 8 caracteres)"
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