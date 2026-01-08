// API route to proxy Unusual Whales requests for MP/LP Zones
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.UW_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'UW_API_KEY not configured' });

  const { symbol, expiry } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol parameter' });

  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' };

  try {
    const [oiChangeRes, maxPainRes] = await Promise.all([
      fetch(`https://api.unusualwhales.com/api/stock/${symbol}/oi-change`, { headers }),
      fetch(`https://api.unusualwhales.com/api/stock/${symbol}/max-pain`, { headers })
    ]);

    const oiChangeData = await oiChangeRes.json();
    const maxPainData = await maxPainRes.json();
    const currentPrice = parseFloat(maxPainData?.data?.[0]?.close || 0);
    const expirations = getExpirations(maxPainData);
    const targetExpiry = expiry || (expirations.length > 0 ? expirations[0] : null);
    const strikeData = processOIChange(oiChangeData, symbol, targetExpiry, currentPrice);
    const zones = calculateMPLPZones(strikeData, currentPrice);
    const maxPain = extractMaxPain(maxPainData, targetExpiry);

    return res.status(200).json({ success: true, symbol: symbol.toUpperCase(), currentPrice, maxPain, selectedExpiry: targetExpiry, expirations, zones, strikeData });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch from UW API', details: error.message });
  }
}

function getExpirations(maxPainData) {
  if (!maxPainData?.data || !Array.isArray(maxPainData.data)) return [];
  return maxPainData.data.map(d => d.expiry).filter(Boolean).sort();
}

function parseOptionSymbol(optionSymbol, ticker) {
  try {
    const withoutTicker = optionSymbol.replace(ticker, '');
    const expiry = `20${withoutTicker.substring(0,2)}-${withoutTicker.substring(2,4)}-${withoutTicker.substring(4,6)}`;
    const type = withoutTicker.substring(6,7) === 'C' ? 'call' : 'put';
    const strike = parseInt(withoutTicker.substring(7)) / 1000;
    return { expiry, type, strike };
  } catch (e) { return null; }
}

function processOIChange(oiChangeData, ticker, targetExpiry, currentPrice) {
  const strikes = {};
  if (!oiChangeData?.data) return strikes;
  const minStrike = currentPrice * 0.92;
  const maxStrike = currentPrice * 1.08;
  
  oiChangeData.data.forEach(item => {
    const parsed = parseOptionSymbol(item.option_symbol, ticker);
    if (!parsed) return;
    if (targetExpiry && parsed.expiry !== targetExpiry) return;
    if (parsed.strike < minStrike || parsed.strike > maxStrike) return;
    
    if (!strikes[parsed.strike]) {
      strikes[parsed.strike] = { strike: parsed.strike, callOI: 0, putOI: 0, callVolume: 0, putVolume: 0, totalOI: 0 };
    }
    
    const oi = parseInt(item.curr_oi || 0);
    const volume = parseInt(item.volume || 0);
    
    if (parsed.type === 'call') { strikes[parsed.strike].callOI += oi; strikes[parsed.strike].callVolume += volume; }
    else { strikes[parsed.strike].putOI += oi; strikes[parsed.strike].putVolume += volume; }
  });
  
  Object.values(strikes).forEach(s => {
    s.totalOI = s.callOI + s.putOI;
    s.netGamma = s.callOI - s.putOI;
    s.pcRatio = s.callOI > 0 ? (s.putOI / s.callOI).toFixed(2) : 'N/A';
  });
  return strikes;
}

function calculateMPLPZones(strikeData, currentPrice) {
  const strikes = Object.values(strikeData).sort((a, b) => a.strike - b.strike);
  if (strikes.length === 0) return { magnetPrice: null, liquidityPull: null, callWall: null, putWall: null, netGEX: 0, interpretation: 'No data for selected expiry.' };

  let magnetPrice = strikes.reduce((max, s) => Math.abs(s.netGamma) > Math.abs(max.netGamma) ? s : max, strikes[0]);
  let liquidityPull = strikes.reduce((max, s) => s.totalOI > max.totalOI ? s : max, strikes[0]);
  
  const strikesAbove = strikes.filter(s => s.strike > currentPrice);
  const strikesBelow = strikes.filter(s => s.strike < currentPrice);
  let callWall = strikesAbove.length > 0 ? strikesAbove.reduce((max, s) => s.callOI > max.callOI ? s : max, strikesAbove[0]) : null;
  let putWall = strikesBelow.length > 0 ? strikesBelow.reduce((max, s) => s.putOI > max.putOI ? s : max, strikesBelow[0]) : null;

  const netGEX = strikes.reduce((sum, s) => sum + s.netGamma, 0);
  const totalCallOI = strikes.reduce((sum, s) => sum + s.callOI, 0);
  const totalPutOI = strikes.reduce((sum, s) => sum + s.putOI, 0);
  const pcRatio = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : 'N/A';
  
  let interpretation = netGEX > 0 ? '📈 BULLISH: More call OI. ' : '📉 BEARISH: More put OI. ';
  interpretation += `P/C: ${pcRatio}. `;
  if (callWall) interpretation += `Resistance $${callWall.strike}. `;
  if (putWall) interpretation += `Support $${putWall.strike}.`;

  return { magnetPrice: magnetPrice?.strike, magnetPriceOI: magnetPrice?.totalOI, liquidityPull: liquidityPull?.strike, liquidityPullOI: liquidityPull?.totalOI, callWall: callWall?.strike, callWallOI: callWall?.callOI, putWall: putWall?.strike, putWallOI: putWall?.putOI, netGEX, totalCallOI, totalPutOI, pcRatio, interpretation };
}

function extractMaxPain(maxPainData, targetExpiry) {
  if (!maxPainData?.data || !Array.isArray(maxPainData.data)) return null;
  if (targetExpiry) { const match = maxPainData.data.find(d => d.expiry === targetExpiry); if (match) return parseFloat(match.max_pain); }
  return parseFloat(maxPainData.data[0]?.max_pain || 0);
}
