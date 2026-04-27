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
  app.get("/api/yahoo/*", async (req, res) => {
    try {
      const yahooPath = req.params[0];
      const query = new URLSearchParams(req.query as any).toString();
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooPath}?${query}`;
      
      console.log(`[PROXY] Fetching Yahoo: ${url}`);
      
      const response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        },
        timeout: 10000 
      });
      res.json(response.data);
    } catch (error: any) {
      console.error("[PROXY] Yahoo Error:", error.message);
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // TPEx Proxy Routes
  app.get("/api/tpex/*", async (req, res) => {
    try {
      const tpexPath = req.params[0];
      const query = new URLSearchParams(req.query as any).toString();
      const url = `https://www.tpex.org.tw/${tpexPath}?${query}`;
      
      console.log(`[PROXY] Fetching TPEx: ${url}`);
      
      const response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
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
  app.get("/api/twse/*", async (req, res) => {
    try {
      const twsePath = req.params[0];
      const query = new URLSearchParams(req.query as any).toString();
      const url = `https://www.twse.com.tw/${twsePath}?${query}`;
      
      console.log(`[PROXY] Fetching: ${url}`);
      
      const response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Referer": "https://www.twse.com.tw/zh/page/trading/exchange/STOCK_DAY.html",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
          "X-Requested-With": "XMLHttpRequest",
          "Cookie": "JSESSIONID=" + Math.random().toString(36).substring(2, 15) // Spoof session if needed
        },
        timeout: 10000 
      });

      if (!response.data || (response.data.stat && response.data.stat !== "OK" && response.data.stat !== "查詢成功")) {
        console.warn(`[PROXY] TWSE returned warning for ${url}: ${response.data.stat}`);
      }

      res.json(response.data);
    } catch (error: any) {
      console.error("[PROXY] Error:", error.message, error.config?.url);
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
