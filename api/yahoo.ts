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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
  ];

  const languages = ["en-US,en;q=0.9", "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7", "en-GB,en;q=0.9,en-US;q=0.8"];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)],
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": languages[Math.floor(Math.random() * languages.length)],
          "Cache-Control": "max-age=0",
          "DNT": "1",
          "Sec-Ch-Ua": '"Chromium";v="125", "Google Chrome";v="125", "Not-A.Brand";v="99"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
          "Referer": "https://finance.yahoo.com/"
        },
        timeout: 8000 
      });
      return res.status(200).json(response.data);
    } catch (error: any) {
      lastError = error;
      console.warn(`[PROXY] Yahoo Attempt failed (${error.response?.status}) for ${url}: ${error.message}`);
      if (error.response?.status === 429) {
        // Stop immediately on 429
        return res.status(429).json({ error: 'Rate limited by Yahoo' });
      }
    }
  }

  // If all failed and we have a 429, specifically tell frontend
  if (lastError?.response?.status === 429) {
    return res.status(429).json({ error: 'Rate limited by Yahoo' });
  }

  return res.status(lastError?.response?.status || 500).json({ 
    error: "Yahoo Proxy Error", 
    message: lastError?.message,
    detail: lastError?.response?.data
  });
}
