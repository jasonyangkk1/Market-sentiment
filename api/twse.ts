import axios from 'axios';

export default async function handler(req: any, res: any) {
  const { path, ...params } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v)).replace(/%2F/g, '/')}`)
    .join('&');
  const url = `https://www.twse.com.tw${path}?${query}`;

  try {
    let response;
    try {
      response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Referer": "https://www.twse.com.tw/",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "zh-TW,zh;q=0.9,en-US;q-0.8,en;q=0.7"
        },
        timeout: 10000 
      });
    } catch (e: any) {
      console.warn(`[TWSE Proxy] First attempt failed on ${url}: ${e.message}. Retrying with minimal fallback headers...`);
      await new Promise(resolve => setTimeout(resolve, 800));
      response = await axios({
        method: "get",
        url: url,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "Referer": "https://www.twse.com.tw/"
        },
        timeout: 10000
      });
    }
    return res.status(200).json(response.data);
  } catch (error: any) {
    return res.status(error.response?.status || 500).json({ 
      error: "TWSE Proxy Error", 
      message: error.message 
    });
  }
}
