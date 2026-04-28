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
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
    ];

    let lastError = null;
    for (const url of urls) {
      try {
        console.log(`[PROXY] Fetching Yahoo: ${url}`);
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
        return res.json(response.data);
      } catch (error: any) {
        lastError = error;
        console.warn(`[PROXY] Yahoo Attempt failed (${error.response?.status}): ${error.message}`);
        if (error.response?.status === 429) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    res.status(lastError?.response?.status || 500).json({ 
      error: "Yahoo Finance Proxy Error", 
      message: lastError?.message,
      detail: lastError?.response?.data
    });
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
