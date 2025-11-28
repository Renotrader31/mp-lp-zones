// API route to proxy Polygon requests and protect API key
// Endpoint: /api/polygon?endpoint=...&params=...

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.POLYGON_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'POLYGON_API_KEY not configured' });
  }

  const { endpoint, ...params } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }

  try {
    // Build the Polygon URL
    const queryParams = new URLSearchParams(params);
    queryParams.append('apiKey', apiKey);
    
    const polygonUrl = `https://api.polygon.io${endpoint}?${queryParams.toString()}`;
    
    const response = await fetch(polygonUrl);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Polygon API error:', error);
    return res.status(500).json({ error: 'Failed to fetch from Polygon API' });
  }
}
