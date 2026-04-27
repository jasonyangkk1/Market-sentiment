import { AnalysisResult, fetchMarketBreadthViaGemini } from "./geminiService";

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume5D: number;
  turnoverRatio: number; 
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
  raw: any; 
}

const safeNum = (v: any) => {
  if (v === undefined || v === null) return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

function getYYYMMDD(date: Date): string {
  const twDate = new Date(date.getTime() + 8 * 3600 * 1000);
  const y = twDate.getUTCFullYear();
  const m = String(twDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(twDate.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getROCDate(date: Date): string {
  const twDate = new Date(date.getTime() + 8 * 3600 * 1000);
  const y = twDate.getUTCFullYear() - 1911;
  const m = String(twDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(twDate.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function getLatestTradingDate(date: Date): string {
  const twTime = date.getTime() + 8 * 3600 * 1000;
  const twDate = new Date(twTime);
  const day = twDate.getUTCDay();
  
  let offset = 0;
  if (day === 0) offset = 2; // Sunday -> Friday
  else if (day === 6) offset = 1; // Saturday -> Friday
  
  const adjusted = new Date(twTime - offset * 86400000);
  return adjusted.toISOString().split('T')[0];
}

function getPrevTradingDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  // Skip Sunday (0) and Saturday (6)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

async function fetchYahooPrice(symbol: string) {
  const suffixes = [".TW", ".TWO"];
  for (const suffix of suffixes) {
    try {
      const url = `/api/yahoo/${symbol}${suffix}?interval=1d&range=1mo`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.chart?.result?.[0]) continue;

      const result = json.chart.result[0];
      const indicators = result.indicators.quote[0];
      const timestamps = result.timestamp;
      
      const closes = indicators.close || [];
      const volumes = indicators.volume || [];
      const opens = indicators.open || [];
      
      // Get valid data (filter nulls)
      const validIndices = closes.map((c: any, i: number) => c !== null ? i : -1).filter((i: number) => i !== -1);
      
      if (validIndices.length === 0) continue;

      const latestIdx = validIndices[validIndices.length - 1];
      const close = closes[latestIdx];
      const open = opens[latestIdx];
      const volume = volumes[latestIdx];
      const change = close - opens[latestIdx]; // Approx change from open if no prev close
      
      // More accurate change if enough data
      let prevClose = close;
      if (validIndices.length > 1) {
        prevClose = closes[validIndices[validIndices.length - 2]];
      }
      
      const actualChange = close - prevClose;
      const changePercent = (actualChange / prevClose) * 100;
      
      // Last 5 days volume
      const last5Volumes = validIndices.slice(-5).map(i => volumes[i]);
      const avgVol5D = last5Volumes.reduce((a, b) => a + b, 0) / last5Volumes.length;

      return {
        symbol: `${symbol}${suffix}`,
        close,
        change: actualChange,
        changePercent,
        volume,
        avgVol5D,
        date: new Date(timestamps[latestIdx] * 1000 + 8 * 3600 * 1000).toISOString().split('T')[0],
        suffix
      };
    } catch (e) {
      console.warn(`Yahoo fetch failed for ${symbol}${suffix}`, e);
    }
  }
  return null;
}

async function fetchInstitutionalData(symbol: string, date: string, suffix: string) {
  try {
    if (suffix === ".TW") {
      const url = `/api/twse/fund/T86?response=json&date=${date.replace(/-/g, '')}&selectType=ALLBUT0999`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.data) {
        const row = json.data.find((r: any[]) => r[0].trim() === symbol);
        if (row) {
          const f = safeNum(row[4]);    // 外資買賣超股數
          const t = safeNum(row[10]);   // 投信買賣超股數
          const d = safeNum(row[11]);   // 自營商買賣超股數(合計)
          const total = safeNum(row[16]); // 三大法人買賣超股數
          
          return {
            foreign: Math.round(f / 1000),
            trust: Math.round(t / 1000),
            dealer: Math.round(d / 1000),
            total: Math.round(total / 1000)
          };
        }
      }
    } else {
      // TPEx
      const rocDate = getROCDate(new Date(date));
      const url = `/api/tpex/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json&se=EW&t=D&d=${rocDate}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.aaData) {
        const row = json.aaData.find((r: any[]) => r[0].trim() === symbol);
        if (row) {
          // TPEx Columns: 0:ID, 1:Name, 4:ForeignNet, 7:TrustNet, 10:DealerNet, 11:Total (Units are 1000 shares)
          const foreign = safeNum(row[4]);
          const trust = safeNum(row[7]);
          const dealer = safeNum(row[10]);
          const total = safeNum(row[11]);
          return { foreign, trust, dealer, total };
        }
      }
    }
  } catch (e) {
    console.warn("Institutional fetch failed", e);
  }
  return { foreign: 0, trust: 0, dealer: 0, total: 0 };
}

async function fetchFinMindMargin(symbol: string, date: string) {
  const token = localStorage.getItem("finmind_token") || (import.meta.env.VITE_FINMIND_TOKEN as string) || "";
  if (!token) return null;
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMarginPurchaseShortSale&data_id=${symbol}&start_date=${date}&token=${token}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 200 && json.data?.length > 0) {
      return json.data[json.data.length - 1];
    }
  } catch (e) {
    console.warn("FinMind Margin fetch failed", e);
  }
  return null;
}

async function fetchMarketIndices() {
  try {
    // TAIEX
    const resT = await fetch(`/api/yahoo/%5ETWII?interval=1d&range=5d`);
    const jsonT = await resT.json();
    const resultT = jsonT.chart?.result?.[0];
    const quoteT = resultT?.indicators.quote[0];
    const closeT = quoteT?.close?.filter((c:any)=>c)?.[quoteT.close.length-1] || 0;
    const prevT = quoteT?.close?.filter((c:any)=>c)?.[quoteT.close.length-2] || closeT;
    const changeT = closeT - prevT;
    const percentT = (changeT / prevT) * 100;

    // OTC
    const resO = await fetch(`/api/yahoo/%5ETWOII?interval=1d&range=5d`);
    const jsonO = await resO.json();
    const resultO = jsonO.chart?.result?.[0];
    const quoteO = resultO?.indicators.quote[0];
    const closeO = quoteO?.close?.filter((c:any)=>c)?.[quoteO.close.length-1] || 0;
    const prevO = quoteO?.close?.filter((c:any)=>c)?.[quoteO.close.length-2] || closeO;
    const changeO = closeO - prevO;
    const percentO = (changeO / prevO) * 100;

    return {
      taiex: { close: closeT, change: changeT, percent: percentT },
      otc: { close: closeO, change: changeO, percent: percentO }
    };
  } catch (e) {
    console.warn("Indices fetch failed", e);
    return {
      taiex: { close: 0, change: 0, percent: 0 },
      otc: { close: 0, change: 0, percent: 0 }
    };
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

async function fetchInstitutionalWithFallback(symbol: string, initialDate: string, suffix: string) {
  let currentDateStr = initialDate;
  for (let i = 0; i < 5; i++) {
    const data = await fetchInstitutionalData(symbol, currentDateStr, suffix);
    
    if (data.foreign !== 0 || data.trust !== 0 || data.dealer !== 0) {
      return { ...data, actualDate: currentDateStr };
    }
    // Go back one trading day
    currentDateStr = getPrevTradingDay(currentDateStr);
  }
  return { foreign: 0, trust: 0, dealer: 0, total: 0, actualDate: initialDate };
}

export async function fetchAllStockData(symbol: string): Promise<StockData> {
  // 1. Get Price via Yahoo
  const yahooData = await fetchYahooPrice(symbol);
  if (!yahooData) {
    throw new Error(`找不到股票 ${symbol} 的資產資料。請確認代碼是否正確。`);
  }

  const tradingDate = yahooData.date;

  // 2. Parallel fetches (Initial inst fetch or wait? Let's keep parallel but handle inst delay)
  // Actually, breadths (Gemini) might also need date adjustment if it's too early.
  const [instResult, margin, indices, breadths] = await Promise.all([
    fetchInstitutionalWithFallback(symbol, tradingDate, yahooData.suffix),
    fetchFinMindMargin(symbol, tradingDate),
    fetchMarketIndices(),
    withTimeout(fetchMarketBreadthViaGemini(tradingDate), 15000, {
      advance: 0,
      decline: 0,
      note: "搜尋超時"
    })
  ]);

  console.log("[DEBUG] Institutional Data:", instResult);

  const foreign = safeNum(instResult.foreign);
  const trust = safeNum(instResult.trust);
  const dealer = safeNum(instResult.dealer);
  const total = safeNum(instResult.total);
  
  const marginBalance = margin ? safeNum(margin.MarginPurchaseTodayBalance) : 0;
  const marginYest = margin ? safeNum(margin.MarginPurchaseYesterdayBalance) : marginBalance;
  const marginChange = marginBalance - marginYest;

  const turnoverRatio = (yahooData.volume / (yahooData.avgVol5D || 1)) * 100;

  return {
    symbol,
    name: symbol, // Could fetch name from Yahoo result if needed
    price: yahooData.close,
    change: yahooData.change,
    changePercent: yahooData.changePercent,
    volume: yahooData.volume,
    avgVolume5D: yahooData.avgVol5D,
    turnoverRatio,
    institutions: {
      foreign,
      trust,
      dealer,
      total: foreign + trust + dealer
    },
    margin: {
      balance: marginBalance,
      change: marginChange
    },
    marketBreadth: {
      advance: breadths.advance,
      decline: breadths.decline,
      ratio: breadths.advance / (breadths.decline || 1)
    },
    raw: {
      dateStr: tradingDate,
      institutionDate: instResult.actualDate,
      latestPrice: { close: yahooData.close, spread: yahooData.change, Trading_Volume: yahooData.volume },
      marginData: margin ? [margin] : [],
      geminiNote: breadths.note,
      taiex: indices.taiex,
      otc: indices.otc,
      note: `大盤今日${indices.taiex.change > 0 ? "漲" : "跌"} ${Math.abs(indices.taiex.change).toFixed(2)} 點 (${indices.taiex.percent.toFixed(2)}%)，櫃買指數 ${indices.otc.percent.toFixed(2)}%。` + 
            (breadths.advance > 0 ? ` 漲跌家數：${breadths.advance}/${breadths.decline}。` : "")
    }
  };
}
