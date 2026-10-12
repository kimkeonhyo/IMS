import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// Request: JWT 자동 첨부
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response: 401 → 로그아웃
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('erp_token');
      localStorage.removeItem('erp_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default client;
