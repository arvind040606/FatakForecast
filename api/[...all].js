import app from '../backend/server.js';

export default function handler(req, res) {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + req.url;
  }
  return app(req, res);
}
