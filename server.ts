import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Yahoo Finance Proxy
  app.get("/api/yahoo", async (req, res) => {
    const { symbol, interval, range } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval || '1d'}&range=${range || '1mo'}`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval || '1d'}&range=${range || '1mo'}`
    ];

    const userAgents = [
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
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        console.log(`[PROXY] Attempting Yahoo: ${url}`);
        
        const response = await axios({
          method: "get",
          url: url,
          headers: {
            "User-Agent": randomUA,
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
        return res.json(response.data);
      } catch (error: any) {
        lastError = error;
        console.warn(`[PROXY] Yahoo Attempt failed (${error.response?.status}) for ${url}: ${error.message}`);
        if (error.response?.status === 429) {
          // Stop immediately on 429
          return res.status(429).json({ error: 'Rate limited by Yahoo' });
        }
      }
    }

    if (lastError?.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limited by Yahoo' });
    }

    res.status(lastError?.response?.status || 500).json({ 
      error: "Yahoo Finance Proxy Error", 
      message: lastError?.message,
      detail: lastError?.response?.data
    });
  });

  // FinMind Proxy Route
  app.get("/api/finmind", async (req, res) => {
    const { dataset, data_id, start_date } = req.query;
    const token = process.env.FINMIND_TOKEN || process.env.VITE_FINMIND_TOKEN || "";
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${data_id}&start_date=${start_date || ''}&token=${token}`;

    try {
      console.log(`[PROXY] Fetching FinMind: ${url.replace(token, 'REDACTED')}`);
      const response = await axios.get(url, { timeout: 10000 });
      res.json(response.data);
    } catch (error: any) {
      console.error("[PROXY] FinMind Error:", error.message);
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // TPEx Proxy Routes
  app.get("/api/tpex", async (req, res) => {
    const { path: tpexPath, ...params } = req.query;

    if (!tpexPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const query = new URLSearchParams(params as any).toString();
    const url = `https://www.tpex.org.tw${tpexPath}?${query}`;

    try {
      console.log(`[PROXY] Fetching TPEx: ${url}`);
      const response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.tpex.org.tw/",
          "Accept": "application/json, text/javascript, */*; q=0.01"
        },
        timeout: 10000 
      });
      res.json(response.data);
    } catch (error: any) {
      console.error("[PROXY] TPEx Error:", error.message);
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // TWSE Proxy Routes
  app.get("/api/twse", async (req, res) => {
    const { path: twsePath, ...params } = req.query;

    if (!twsePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const query = new URLSearchParams(params as any).toString();
    const url = `https://www.twse.com.tw${twsePath}?${query}`;

    try {
      console.log(`[PROXY] Fetching TWSE: ${url}`);
      const response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.twse.com.tw/zh/page/trading/exchange/STOCK_DAY.html",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        timeout: 10000 
      });
      res.json(response.data);
    } catch (error: any) {
      console.error("[PROXY] TWSE Error:", error.message);
      res.status(error.response?.status || 500).json({ 
        error: "Failed to fetch from TWSE",
        message: error.message 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
