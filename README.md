# MP/LP Zones - Unusual Whales Edition

Magnet Price & Liquidity Pull Zone Analysis Tool - now powered by Unusual Whales API instead of Polygon.

## Features

| Level | Description | Trading Implication |
|-------|-------------|---------------------|
| **Magnet Price (MP)** | Highest absolute net gamma | Price gravitates here due to dealer hedging |
| **Liquidity Pull (LP)** | Highest combined OI | Major liquidity cluster - expect reactions |
| **Call Wall** | Highest call OI above price | Resistance - dealers sell into rallies |
| **Put Wall** | Highest put OI below price | Support - dealers buy the dips |

## Deployment

### 1. Update your existing repo (if you have mp-lp-zones already)

Replace the files in your existing `mp-lp-zones` folder with these new ones, then:

```bash
cd mp-lp-zones
git add .
git commit -m "Switch from Polygon to Unusual Whales API"
git push
```

### 2. Or create fresh deployment

```bash
cd mp-lp-zones-uw
git init
git add .
git commit -m "MP/LP Zones - UW Edition"
git remote add origin https://github.com/Renotrader31/mp-lp-zones.git
git branch -M main
git push -u origin main --force
```

### 3. Update Environment Variables on Vercel

1. Go to [vercel.com](https://vercel.com) → Your project → Settings → Environment Variables
2. **REMOVE** the old `POLYGON_API_KEY` variable
3. **ADD** new variable:
   - Name: `UW_API_KEY`
   - Value: Your Unusual Whales API key (72cac8bd-c1c5-488b-ad48-58d554be20d9)
4. Click **Redeploy** from the Deployments tab

## API Endpoints Used

This tool calls these Unusual Whales endpoints:

- `/api/stock/{symbol}/greek-exposure` - GEX by strike
- `/api/stock/{symbol}/max-pain` - Max pain calculation
- `/api/stock/{symbol}/info` - Current price

## Net GEX Interpretation

- **Positive Net GEX**: Dealer hedging dampens moves → Mean reversion, range-bound
- **Negative Net GEX**: Dealer hedging amplifies moves → Trending, volatile conditions

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Vercel Serverless Functions
- Unusual Whales API

## Troubleshooting

**"UW_API_KEY not configured"**
- Make sure you added the environment variable in Vercel
- Make sure you redeployed after adding it

**Empty strike data**
- UW API may return different data structures - check Vercel logs
- The API handles multiple response formats but may need adjustment

## License

For personal trading use only.
