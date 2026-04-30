import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('adspro_token');
    const savedUser = localStorage.getItem('adspro_user');

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        // Verify với server
        authApi.getMe()
          .then(res => setUser(res.data.user))
          .catch(() => {
            localStorage.removeItem('adspro_token');
            localStorage.removeItem('adspro_user');
            setUser(null);
          })
          .finally(() => setLoading(false));
      } catch (e) {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const res = await authApi.login(username, password);
    const { token, user: userData } = res.data;
    localStorage.setItem('adspro_token', token);
    localStorage.setItem('adspro_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch (e) {}
    localStorage.removeItem('adspro_token');
    localStorage.removeItem('adspro_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
