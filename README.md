# MP/LP Zones - Magnet Price & Liquidity Pull Analysis

A real-time options analysis tool that identifies key price levels based on gamma exposure and open interest distribution.

## Features

- **Magnet Price (MP)**: Strike with highest net gamma - where dealer hedging creates the strongest price "pull"
- **Liquidity Pull (LP)**: Strike with highest combined OI - where most liquidity is concentrated
- **Call/Put Walls**: Key resistance and support levels based on open interest
- **Visual Strike Ladder**: Color-coded OI distribution with MP/LP zones highlighted
- **Net GEX Analysis**: Positive = mean reversion, Negative = trending conditions
- **Auto-generated Interpretation**: Market structure analysis based on positioning

## Setup

### 1. Clone or download this project

### 2. Install Vercel CLI (if not already installed)
```bash
npm install -g vercel
```

### 3. Deploy to Vercel
```bash
cd mp-lp-zones
vercel
```

### 4. Set Environment Variable
After deployment, go to your Vercel dashboard:
1. Select your project
2. Go to **Settings** → **Environment Variables**
3. Add a new variable:
   - Name: `POLYGON_API_KEY`
   - Value: Your Polygon.io API key
4. Redeploy for changes to take effect

### 5. Access Your App
Your app will be available at the URL Vercel provides (e.g., `https://mp-lp-zones.vercel.app`)

## Local Development

1. Create a `.env` file in the project root:
```
POLYGON_API_KEY=your_polygon_api_key_here
```

2. Run locally:
```bash
vercel dev
```

3. Open http://localhost:3000

## Usage

1. Enter a stock symbol (default: SPY)
2. Select an expiration date
3. Choose strike range (±10 to ±50 strikes around current price)
4. Click **Analyze**

## Key Levels Explained

| Level | Description | Trading Implication |
|-------|-------------|---------------------|
| **Magnet Price (MP)** | Highest absolute net gamma | Price tends to gravitate here due to dealer hedging |
| **Liquidity Pull (LP)** | Highest combined OI | Major liquidity cluster - expect reactions |
| **Call Wall** | Highest call OI above price | Resistance - dealers sell stock as price approaches |
| **Put Wall** | Highest put OI below price | Support - dealers buy stock as price approaches |

## Net GEX Interpretation

- **Positive Net GEX**: Dealer hedging dampens moves → Mean reversion, range-bound
- **Negative Net GEX**: Dealer hedging amplifies moves → Trending, volatile conditions

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Vercel Serverless Functions
- Polygon.io Options API

## License

For personal trading use only.
