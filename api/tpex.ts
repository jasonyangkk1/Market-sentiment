import axios from 'axios';

export default async function handler(req: any, res: any) {
  const { path, ...params } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  // 修正：手動組裝 query string，避免 URLSearchParams 把 "/" encode 成 "%2F"
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v)).replace(/%2F/g, '/')}`)
    .join('&');
  const url = `https://www.tpex.org.tw${path}?${query}`;

  try {
    const response = await axios({
      method: "get",
      url: url,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.tpex.org.tw/",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive"
      },
      timeout: 10000 
    });
    return res.status(200).json({
      ...response.data,
      _debug_url: url // Provide for debugging
    });
  } catch (error: any) {
    return res.status(error.response?.status || 500).json({ 
      error: "TPEx Proxy Error", 
      message: error.message,
      url: url
    });
  }
}
