import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const api = axios.create({ baseURL: API });
api.interceptors.request.use((config) => {
    const t = localStorage.getItem('kerma_token');
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
});

export const fileUrl = (path) => (path ? `${API}/files/${path}?auth=${localStorage.getItem('kerma_token')}` : null);

export function formatApiError(detail) {
    if (detail == null) return 'Something went wrong. Please try again.';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).join(' ');
    if (detail && typeof detail.msg === 'string') return detail.msg;
    return String(detail);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(undefined);

    useEffect(() => {
        const t = localStorage.getItem('kerma_token');
        if (!t) {
            setUser(null);
            return;
        }
        api.get('/auth/me')
            .then((r) => setUser(r.data))
            .catch(() => {
                localStorage.removeItem('kerma_token');
                setUser(null);
            });
    }, []);

    const login = async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        localStorage.setItem('kerma_token', data.access_token);
        return data.user;
    };

    const commitSession = (u) => setUser(u);

    const logout = () => {
        localStorage.removeItem('kerma_token');
        setUser(null);
    };

    return <AuthContext.Provider value={{ user, setUser, login, logout, commitSession }}>{children}</AuthContext.Provider>;
}
