// API route to proxy Unusual Whales requests for MP/LP Zones
// Endpoint: /api/uw?symbol=SPY&expiry=2026-01-17

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

  const apiKey = process.env.UW_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'UW_API_KEY not configured' });
  }

  const { symbol, expiry } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json'
  };

  try {
    // Fetch data from UW endpoints in parallel
    const [oiChangeRes, maxPainRes] = await Promise.all([
      // OI Change - has contract-level data we can parse
      fetch(`https://api.unusualwhales.com/api/stock/${symbol}/oi-change`, { headers }),
      // Max Pain
      fetch(`https://api.unusualwhales.com/api/stock/${symbol}/max-pain`, { headers })
    ]);

    // Parse responses
    const oiChangeData = await oiChangeRes.json();
    const maxPainData = await maxPainRes.json();

    // Get current price from max pain response
    const currentPrice = parseFloat(maxPainData?.data?.[0]?.close || 0);

    // Process OI change data to aggregate by strike
    const strikeData = processOIChange(oiChangeData, symbol, expiry);

    // Calculate MP/LP zones
    const zones = calculateMPLPZones(strikeData, currentPrice);

    // Get max pain value for nearest expiry
    const maxPain = extractMaxPain(maxPainData, expiry);

    return res.status(200).json({
      success: true,
      symbol: symbol.toUpperCase(),
      currentPrice,
      maxPain,
      zones,
      strikeData,
      expirations: getExpirations(maxPainData)
    });

  } catch (error) {
    console.error('UW API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch from Unusual Whales API',
      details: error.message 
    });
  }
}

// Parse option symbol: SPY260109C00712000 -> {expiry: "2026-01-09", type: "call", strike: 712}
function parseOptionSymbol(optionSymbol, ticker) {
  try {
    // Remove ticker prefix
    const withoutTicker = optionSymbol.replace(ticker, '');
    
    // Format: YYMMDD + C/P + 8 digit strike
    const expYY = withoutTicker.substring(0, 2);
    const expMM = withoutTicker.substring(2, 4);
    const expDD = withoutTicker.substring(4, 6);
    const optType = withoutTicker.substring(6, 7);
    const strikeRaw = withoutTicker.substring(7);
    
    const expiry = `20${expYY}-${expMM}-${expDD}`;
    const type = optType === 'C' ? 'call' : 'put';
    const strike = parseInt(strikeRaw) / 1000;
    
    return { expiry, type, strike };
  } catch (e) {
    return null;
  }
}

// Process OI change data to aggregate by strike
function processOIChange(oiChangeData, ticker, targetExpiry) {
  const strikes = {};
  
  if (!oiChangeData?.data) {
    return strikes;
  }

  const data = Array.isArray(oiChangeData.data) ? oiChangeData.data : [];
  
  data.forEach(item => {
    const parsed = parseOptionSymbol(item.option_symbol, ticker);
    if (!parsed) return;
    
    // Filter by expiry if specified
    if (targetExpiry && parsed.expiry !== targetExpiry) {
      return;
    }
    
    const strike = parsed.strike;
    
    if (!strikes[strike]) {
      strikes[strike] = {
        strike,
        callOI: 0,
        putOI: 0,
        callVolume: 0,
        putVolume: 0,
        totalOI: 0
      };
    }
    
    const oi = parseInt(item.curr_oi || 0);
    const volume = parseInt(item.volume || 0);
    
    if (parsed.type === 'call') {
      strikes[strike].callOI += oi;
      strikes[strike].callVolume += volume;
    } else {
      strikes[strike].putOI += oi;
      strikes[strike].putVolume += volume;
    }
  });
  
  // Calculate totals and estimate gamma direction
  Object.values(strikes).forEach(s => {
    s.totalOI = s.callOI + s.putOI;
    s.oiDiff = s.callOI - s.putOI;
    // Estimate net gamma direction (calls positive, puts negative for MM)
    s.netGamma = s.callOI - s.putOI; // Simplified - positive means call-heavy
  });

  return strikes;
}

// Get list of expirations from max pain data
function getExpirations(maxPainData) {
  if (!maxPainData?.data) return [];
  return maxPainData.data.map(d => d.expiry).filter(Boolean);
}

// Calculate MP (Magnet Price) and LP (Liquidity Pull) zones
function calculateMPLPZones(strikeData, currentPrice) {
  const strikes = Object.values(strikeData).sort((a, b) => a.strike - b.strike);
  
  if (strikes.length === 0) {
    return {
      magnetPrice: null,
      liquidityPull: null,
      callWall: null,
      putWall: null,
      netGEX: 0,
      interpretation: 'No data available'
    };
  }

  // Magnet Price (MP) = Strike with highest absolute net gamma
  let magnetPrice = strikes[0];
  strikes.forEach(s => {
    if (Math.abs(s.netGamma) > Math.abs(magnetPrice.netGamma)) {
      magnetPrice = s;
    }
  });

  // Liquidity Pull (LP) = Strike with highest combined OI
  let liquidityPull = strikes[0];
  strikes.forEach(s => {
    if (s.totalOI > liquidityPull.totalOI) {
      liquidityPull = s;
    }
  });

  // Call Wall = Highest call OI above current price
  let callWall = null;
  const strikesAbove = strikes.filter(s => s.strike > currentPrice);
  if (strikesAbove.length > 0) {
    callWall = strikesAbove.reduce((max, s) => s.callOI > max.callOI ? s : max, strikesAbove[0]);
  }

  // Put Wall = Highest put OI below current price
  let putWall = null;
  const strikesBelow = strikes.filter(s => s.strike < currentPrice);
  if (strikesBelow.length > 0) {
    putWall = strikesBelow.reduce((max, s) => s.putOI > max.putOI ? s : max, strikesBelow[0]);
  }

  // Calculate net GEX
  const netGEX = strikes.reduce((sum, s) => sum + s.netGamma, 0);

  // Generate interpretation
  let interpretation = '';
  
  if (netGEX > 0) {
    interpretation = '📈 POSITIVE GEX: Expect mean-reversion, range-bound price action. Dealers sell into rallies, buy dips.';
  } else {
    interpretation = '📉 NEGATIVE GEX: Expect trending/volatile moves. Dealers amplify directional moves.';
  }

  if (magnetPrice && Math.abs(magnetPrice.strike - currentPrice) < currentPrice * 0.02) {
    interpretation += ` Price near Magnet Price ($${magnetPrice.strike}) - expect gravitational pull to this level.`;
  }

  if (callWall && currentPrice > callWall.strike * 0.98) {
    interpretation += ` Approaching Call Wall at $${callWall.strike} - potential resistance.`;
  }

  if (putWall && currentPrice < putWall.strike * 1.02) {
    interpretation += ` Near Put Wall at $${putWall.strike} - potential support.`;
  }

  return {
    magnetPrice: magnetPrice?.strike || null,
    magnetPriceData: magnetPrice,
    liquidityPull: liquidityPull?.strike || null,
    liquidityPullData: liquidityPull,
    callWall: callWall?.strike || null,
    callWallData: callWall,
    putWall: putWall?.strike || null,
    putWallData: putWall,
    netGEX,
    interpretation
  };
}

// Extract max pain from UW data
function extractMaxPain(maxPainData, targetExpiry) {
  if (!maxPainData?.data || !Array.isArray(maxPainData.data)) return null;
  
  // If target expiry specified, find it
  if (targetExpiry) {
    const match = maxPainData.data.find(d => d.expiry === targetExpiry);
    if (match) return parseFloat(match.max_pain);
  }
  
  // Otherwise return nearest expiry (first one)
  return parseFloat(maxPainData.data[0]?.max_pain || 0);
}
