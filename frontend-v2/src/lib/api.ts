import axios from 'axios';

function getApiBase() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return `http://${host}:8000/api`;
  }
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '').endsWith('/api') ? configured.replace(/\/$/, '') : `${configured.replace(/\/$/, '')}/api`;
  // Production must provide NEXT_PUBLIC_API_URL. Never guess a LAN/localhost backend.
  return '/api';
}

const api = axios.create({ baseURL: getApiBase(), timeout: 15000 });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('emefast_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function normalizeCaseStatus(status: any): string {
  if (typeof status !== 'string') return status;
  const upper = status.toUpperCase().trim();
  switch (upper) {
    case 'SEARCHING':
    case 'AWAITING_RESPONSE':
      return 'WAITING_FOR_RESPONSES';
    case 'ACCEPTED':
      return 'HOSPITAL_ACCEPTED';
    case 'EN_ROUTE':
    case 'ARRIVED':
      return 'HOSPITAL_SELECTED';
    case 'CLOSED':
      return 'COMPLETED';
    default:
      return upper;
  }
}

function normalizeCaseObjects(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(normalizeCaseObjects);
  }
  if (typeof data.case_code === 'string' && typeof data.status === 'string') {
    return {
      ...data,
      status: normalizeCaseStatus(data.status),
    };
  }
  return data;
}

api.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = normalizeCaseObjects(response.data);
    }
    return response;
  },
  (error) => {
    if (typeof window !== 'undefined' && error?.response?.status === 401) {
      localStorage.removeItem('emefast_token');
      localStorage.removeItem('emefast_role');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
