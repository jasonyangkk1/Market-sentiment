import { AnalysisResult, fetchMissingDataViaGemini } from "./geminiService";

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume5D: number;
  turnoverRatio: number; // 週轉率
  institutions: {
    foreign: number;
    trust: number;
    dealer: number;
    total: number;
  };
  margin: {
    balance: number;
    change: number;
  };
  marketBreadth: {
    advance: number;
    decline: number;
    ratio: number;
  };
  raw: any; // 保存原始數據包供 Gemini 參考
}

const FINMIND_BASE = "https://api.finmindtrade.com/api/v4/data";

function getYYYY_MM_DD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getFinMindToken(): string {
  return localStorage.getItem("finmind_token") || (import.meta.env.VITE_FINMIND_TOKEN as string) || "";
}

async function fetchFinMind(params: Record<string, string>) {
  const token = getFinMindToken();
  const query = new URLSearchParams({ ...params, token }).toString();
  const url = `${FINMIND_BASE}?${query}`;
  
  try {
    const res = await fetch(url);
    if (res.status === 401) return null; // Gracefully handle unauthorized (paid datasets)
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== 200) return null;
    return json.data;
  } catch (error) {
    console.error(`[FinMind] Fetch failed for ${params.dataset}:`, error);
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, defaultValue: T): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(defaultValue), ms);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}

export async function fetchAllStockData(symbol: string): Promise<StockData> {
  const now = new Date();
  const taiwanNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (8 * 3600000));
  
  const endDateStr = getYYYY_MM_DD(taiwanNow);
  const startDate = new Date(taiwanNow.getTime() - 15 * 24 * 60 * 60 * 1000); 
  const startDateStr = getYYYY_MM_DD(startDate);

  console.log(`[FinMind] Fetching data for ${symbol}`);

  // 1. Get Stock Price (Daily) - Must succeed
  const priceData = await fetchFinMind({
    dataset: "TaiwanStockPrice",
    data_id: symbol,
    start_date: startDateStr,
    end_date: endDateStr
  });

  if (!priceData || priceData.length === 0) {
    throw new Error(`找不到股票 ${symbol} 的交易資料。請確認代碼是否正確或 Token 是否有效。`);
  }

  const latestPrice = priceData[priceData.length - 1];
  const tradingDate = latestPrice.date;
  const last5Days = priceData.slice(-5);
  const avgVolume5D = last5Days.reduce((acc: number, d: any) => acc + d.Trading_Volume, 0) / last5Days.length;

  // 2. Fetch Margin, TAIEX and OTC Index from FinMind
  // And call Gemini for Missing data
  const [marginData, taiexData, otcData, geminiData] = await Promise.all([
    fetchFinMind({
      dataset: "TaiwanStockMarginPurchaseShortSale",
      data_id: symbol,
      start_date: tradingDate
    }),
    fetchFinMind({
      dataset: "TaiwanStockPrice",
      data_id: "TAIEX",
      start_date: tradingDate
    }),
    fetchFinMind({
      dataset: "TaiwanStockPrice",
      data_id: "TWO",
      start_date: tradingDate
    }),
    withTimeout(fetchMissingDataViaGemini(symbol, tradingDate), 15000, {
      foreign:0, trust:0, dealer:0, instTotal:0,
      marginBalance:0, marginChange:0,
      advance:0, decline:0,
      note: "搜尋超時"
    })
  ]);

  // 3. Institutional logic: Prefer Gemini search results
  const foreign = geminiData.foreign;
  const trust = geminiData.trust;
  const dealer = geminiData.dealer;
  const total = geminiData.instTotal || (foreign + trust + dealer);

  // 4. Margin logic
  const margin = marginData && marginData.length > 0 ? marginData[marginData.length - 1] : null;
  const marginBalance = margin ? Number(margin.MarginPurchaseTodayBalance) : geminiData.marginBalance;
  const marginYest = margin ? Number(margin.MarginPurchaseYesterdayBalance) : (geminiData.marginBalance - geminiData.marginChange);
  const marginChange = margin ? (marginBalance - marginYest) : geminiData.marginChange;

  // 5. Market Breadth logic
  const upCount = geminiData.advance || 0;
  const downCount = geminiData.decline || 0;
  
  const taiex = taiexData && taiexData.length > 0 ? taiexData[taiexData.length - 1] : null;
  const taiexChange = taiex ? taiex.spread : 0;
  const taiexClose = taiex ? taiex.close : 1;
  const taiexPercent = (taiexChange / (taiexClose - taiexChange)) * 100;

  const otc = otcData && otcData.length > 0 ? otcData[otcData.length - 1] : null;
  const otcChange = otc ? otc.spread : 0;
  const otcClose = otc ? otc.close : 1;
  const otcPercent = (otcChange / (otcClose - otcChange)) * 100;

  // 6. Turnover Ratio
  const turnoverRatio = (latestPrice.Trading_Volume / avgVolume5D) * 100;

  return {
    symbol,
    name: symbol,
    price: latestPrice.close,
    change: latestPrice.spread,
    changePercent: (latestPrice.spread / (latestPrice.close - latestPrice.spread)) * 100,
    volume: latestPrice.Trading_Volume,
    avgVolume5D,
    turnoverRatio,
    institutions: {
      foreign,
      trust,
      dealer,
      total
    },
    margin: {
      balance: marginBalance,
      change: marginChange
    },
    marketBreadth: {
      advance: upCount,
      decline: downCount,
      ratio: upCount / (downCount || 1)
    },
    raw: {
      dateStr: tradingDate,
      latestPrice,
      marginData,
      geminiNote: geminiData.note,
      taiex: {
        change: taiexChange,
        close: taiexClose,
        percent: taiexPercent
      },
      otc: {
        change: otcChange,
        close: otcClose,
        percent: otcPercent
      },
      note: `大盤今日${taiexChange > 0 ? "漲" : "跌"} ${Math.abs(taiexChange)} 點 (${taiexPercent.toFixed(2)}%)，櫃買指數 ${otcPercent.toFixed(2)}%。` + 
            (upCount > 0 ? ` 漲跌家數：${upCount}/${downCount}。` : "")
    }
  };
}
