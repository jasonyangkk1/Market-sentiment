import axios from 'axios';

export default async function handler(req: any, res: any) {
  const { dataset, data_id, start_date } = req.query;
  
  if (!dataset || !data_id) {
    return res.status(400).json({ error: 'dataset and data_id are required' });
  }

  // Use FINMIND_TOKEN from environment variables
  const token = process.env.FINMIND_TOKEN || process.env.VITE_FINMIND_TOKEN || "";
  
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${data_id}&start_date=${start_date || ''}&token=${token}`;

  try {
    const response = await axios({
      method: "get",
      url: url,
      timeout: 10000 
    });
    return res.status(200).json(response.data);
  } catch (error: any) {
    return res.status(error.response?.status || 500).json({ 
      error: "FinMind Proxy Error", 
      message: error.message 
    });
  }
}
