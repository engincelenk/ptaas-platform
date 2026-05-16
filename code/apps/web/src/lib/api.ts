import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api/v1',
});

const DEV_MODE = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

export function configureApiAuth(getToken: () => Promise<string | null>) {
  api.interceptors.request.use(async (config) => {
    if (DEV_MODE) {
      config.headers['x-dev-tenant-id'] = 'dev-tenant-001';
      config.headers['x-dev-user-id'] = 'dev-user-001';
    } else {
      const token = await getToken();
      if (token) config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });
}

export default api;

export const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

export const severityColors: Record<string, string> = {
  CRITICAL: 'text-red-500 bg-red-500/10',
  HIGH: 'text-orange-500 bg-orange-500/10',
  MEDIUM: 'text-yellow-500 bg-yellow-500/10',
  LOW: 'text-blue-500 bg-blue-500/10',
  INFO: 'text-gray-400 bg-gray-400/10',
};
