import axios from 'axios';

export default async function handler(req: any, res: any) {
  const { symbol, interval, range } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval || '1d'}&range=${range || '1mo'}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval || '1d'}&range=${range || '1mo'}`
  ];

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)],
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://finance.yahoo.com/quote/AAPL",
          "Origin": "https://finance.yahoo.com"
        },
        timeout: 10000 
      });
      return res.status(200).json(response.data);
    } catch (error: any) {
      lastError = error;
      if (error.response?.status === 429) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  return res.status(lastError?.response?.status || 500).json({ 
    error: "Yahoo Proxy Error", 
    message: lastError?.message,
    detail: lastError?.response?.data
  });
}
