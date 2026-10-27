import { useState } from 'react';
import { api } from './api.js';

export function RegisterForm({ onCancel, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
    
    if (username.length < 3) {
      setError('O utilizador deve ter pelo menos 3 caracteres.');
      return;
    }
    if (password.length < 8) {
      setError('A palavra-passe deve ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await api.register({ username, password });
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <h3>Criar Novo Utilizador</h3>
      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit} className="form">
        <label>
          Nome de utilizador
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ex: joao"
          />
        </label>

        <label>
          Palavra-passe (mín. 8 caracteres)
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        <div className="actions">
          {onCancel && (
            <button type="button" className="ghost" onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button type="submit" disabled={loading}>
            {loading ? 'A criar...' : 'Criar Conta'}
          </button>
        </div>
      </form>
    </div>
  );
}