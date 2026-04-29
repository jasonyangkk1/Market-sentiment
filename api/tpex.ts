import axios from 'axios';

export default async function handler(req: any, res: any) {
  const { path, ...params } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  // 修正：手動組裝 query string，確保 "/" 不被過度編碼
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${String(v)}`)
    .join('&')
    .replace(/%2F/g, '/'); // 保持日期中的 /

  const url = `https://www.tpex.org.tw${path.startsWith('/') ? '' : '/'}${path}?${query}`;

  try {
    const response = await axios({
      method: "get",
      url: url,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Referer": "https://www.tpex.org.tw/zh-tw/web/stock/3insti/daily_trade/3itrade_hedge.php",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      timeout: 15000 
    });
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error(`[TPEx Proxy] Error on ${url}:`, error.message);
    return res.status(error.response?.status || 500).json({ 
      error: "TPEx Proxy Error", 
      message: error.message,
      url: url
    });
  }
}
