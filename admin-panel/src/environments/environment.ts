// Development: API calls go to /api and are proxied to http://localhost:3000 (see proxy.conf.json)
export const environment = {
  production: false,
  apiUrl: '/api/admin',
  // Base URL for uploaded files (logos, images). Empty = same origin (proxied in dev).
  fileBaseUrl: '',
};
