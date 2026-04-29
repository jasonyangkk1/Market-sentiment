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

async function fetchPriceFallback(symbol: string, suffix: string) {
  // Try FinMind first if token exists
  const token = localStorage.getItem("finmind_token") || (import.meta.env.VITE_FINMIND_TOKEN as string) || "";
  if (token) {
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${dateStr}&token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.data?.length > 0) {
        const last = json.data[json.data.length - 1];
        return {
          symbol: `${symbol}${suffix}`,
          close: Number(last.close),
          change: Number(last.spread),
          changePercent: (Number(last.spread) / (Number(last.close) - Number(last.spread))) * 100,
          volume: Number(last.Trading_Volume),
          avgVol5D: Number(last.Trading_Volume), 
          date: last.date,
          suffix
        };
      }
    } catch (e) {
      console.warn(`FinMind Price Fallback failed for ${symbol}`, e);
    }
  }

  // Reliable Daily Summary Fallback
  try {
    if (suffix === ".TW") {
      // TWSE STOCK_DAY_ALL is the best daily fallback for listed stocks
      const url = `/api/twse?path=/exchangeReport/STOCK_DAY_ALL&response=json`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.data) {
        const row = json.data.find((r: any[]) => r[0] === symbol);
        if (row) {
          // TWSE STOCK_DAY_ALL: 0:Code, 1:Name, 2:Vol, 3:Turnover, 4:Open, 5:High, 6:Low, 7:Close, 8:Change, 9:Trans
          const close = safeNum(row[7]);
          const change = safeNum(row[8]);
          // Convert YYYYMMDD to YYYY-MM-DD
          let date = new Date().toISOString().split('T')[0];
          if (json.date && json.date.length === 8) {
            date = `${json.date.substring(0, 4)}-${json.date.substring(4, 6)}-${json.date.substring(6, 8)}`;
          }

          return {
            symbol: `${symbol}${suffix}`,
            close,
            change,
            changePercent: (change / (close - change)) * 100,
            volume: safeNum(row[2]) / 1000, // To Lots
            avgVol5D: safeNum(row[2]) / 1000,
            date,
            suffix
          };
        }
      }
    } else if (suffix === ".TWO") {
      // TPEx Daily Quote
      const url = `/api/tpex?path=/web/stock/aftertrading/otc_trading_summary/result.php&l=zh-tw&o=json`;
      const res = await fetch(url);
      const json = await res.json();
      // TPEx results are grouped by category, but we can search in json.aaData
      if (json.aaData) {
        const row = json.aaData.find((r: any[]) => r[0] === symbol);
        if (row) {
          // TPEx: 0:Code, 1:Name, 2:Close, 3:Change, 4:Open, 5:High, 6:Low, 7:Vol(Lots), 8:Turnover, 9:Trans...
          const close = safeNum(row[2]);
          const change = safeNum(row[3]);
          let date = new Date().toISOString().split('T')[0];
          if (json.reportDate) {
             // reportDate is often ROC date like "112/05/20"
             const parts = json.reportDate.split('/');
             if (parts.length === 3) {
                date = `${Number(parts[0]) + 1911}-${parts[1]}-${parts[2]}`;
             }
          }

          return {
            symbol: `${symbol}${suffix}`,
            close,
            change,
            changePercent: (change / (close - change)) * 100,
            volume: safeNum(row[7]),
            avgVol5D: safeNum(row[7]),
            date,
            suffix
          };
        }
      }
    }
  } catch (e) {
    console.warn(`Summary Price Fallback failed for ${symbol}`, e);
  }
  return null;
}

async function fetchStockPrice(symbol: string) {
  // Check Cache first
  const cacheKey = `price_${symbol}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data, expiry } = JSON.parse(cached);
      if (Date.now() < expiry) {
        console.log(`[CACHE] Using cached data for ${symbol}`);
        return data;
      }
    } catch(e) { 
      sessionStorage.removeItem(cacheKey);
    }
  }

  try {
    // 1. Try TWSE (Listed)
    const twseAllUrl = `/api/twse?path=/exchangeReport/STOCK_DAY_ALL&response=json`;
    const twseRes = await fetch(twseAllUrl);
    const twseJson = await twseRes.json();
    
    if (twseJson.data) {
      const row = twseJson.data.find((r: any[]) => r[0].trim() === symbol);
      if (row) {
        // TWSE STOCK_DAY_ALL: 0:Code, 1:Name, 2:Vol, 3:Turnover, 4:Open, 5:High, 6:Low, 7:Close, 8:Change, 9:Trans
        const close = safeNum(row[7]);
        const changeStr = String(row[8] || "0");
        // Handle ▲/▼/+/ /
        let change = safeNum(changeStr.replace(/[▲▼+]/g, ''));
        if (changeStr.includes("▼") || changeStr.includes("-")) {
          change = -change;
        }
        
        const volume = safeNum(row[2]) / 1000;
        let date = new Date().toISOString().split('T')[0];
        if (twseJson.date && twseJson.date.length === 8) {
          date = `${twseJson.date.substring(0, 4)}-${twseJson.date.substring(4, 6)}-${twseJson.date.substring(6, 8)}`;
        }

        // Fetch 5D Avg Volume for listed
        let avgVol5D = volume;
        try {
          const histUrl = `/api/twse?path=/exchangeReport/STOCK_DAY&response=json&date=${date.replace(/-/g,'')}&stockNo=${symbol}`;
          const histRes = await fetch(histUrl);
          const histJson = await histRes.json();
          if (histJson.data && histJson.data.length > 0) {
            const last5 = histJson.data.slice(-5);
            const sum = last5.reduce((acc: number, r: any[]) => acc + (safeNum(r[1]) / 1000), 0);
            avgVol5D = sum / last5.length;
          }
        } catch (e) {
          console.warn(`Failed to fetch historical volume for ${symbol}`, e);
        }

        const data = {
          symbol: `${symbol}.TW`,
          close,
          change,
          changePercent: (change / (close - change)) * 100,
          volume,
          avgVol5D,
          date,
          suffix: ".TW"
        };
        console.log(`[Price] ${symbol} identified as ${data.suffix} (TWSE STOCK_DAY_ALL)`);
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, expiry: Date.now() + 300000 }));
        return data;
      }
    }

    // 2. Try TPEx (OTC)
    const tpexAllUrl = `/api/tpex?path=/web/stock/aftertrading/otc_trading_summary/result.php&l=zh-tw&o=json`;
    const tpexRes = await fetch(tpexAllUrl);
    const tpexJson = await tpexRes.json();
    
    if (tpexJson.aaData) {
      const row = tpexJson.aaData.find((r: any[]) => r[0].trim() === symbol);
      if (row) {
        // TPEx: 0:Code, 1:Name, 2:Close, 3:Change, 4:Open, 5:High, 6:Low, 7:Vol(Lots), 8:Turnover, 9:Trans...
        const close = safeNum(row[2]);
        const change = safeNum(row[3]);
        const volume = safeNum(row[7]);
        
        let date = new Date().toISOString().split('T')[0];
        if (tpexJson.reportDate) {
           const parts = tpexJson.reportDate.split('/');
           if (parts.length === 3) {
              date = `${Number(parts[0]) + 1911}-${parts[1]}-${parts[2]}`;
           }
        }

        // Fetch 5D Avg Volume for OTC
        let avgVol5D = volume;
        try {
          const histUrl = `/api/tpex?path=/web/stock/aftertrading/daily_trading_info/stk_quote_result.php&l=zh-tw&o=json&stkno=${symbol}`;
          const histRes = await fetch(histUrl);
          const histJson = await histRes.json();
          if (histJson.aaData && histJson.aaData.length > 0) {
            const last5 = histJson.aaData.slice(-5);
            // TPEx individual: 1:Volume(1000 shares)
            const sum = last5.reduce((acc: number, r: any[]) => acc + safeNum(r[1]), 0);
            avgVol5D = sum / last5.length;
          }
        } catch (e) {
          console.warn(`Failed to fetch historical volume for ${symbol} (OTC)`, e);
        }

        const data = {
          symbol: `${symbol}.TWO`,
          close,
          change,
          changePercent: (change / (close - change)) * 100,
          volume,
          avgVol5D,
          date,
          suffix: ".TWO"
        };
        console.log(`[Price] ${symbol} identified as ${data.suffix} (TPEx otc_summary)`);
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, expiry: Date.now() + 300000 }));
        return data;
      }
    }
  } catch (e) {
    console.error(`fetchStockPrice error for ${symbol}`, e);
  }

  // Final fallback (Original logic)
  return await fetchPriceFallback(symbol, "");
}

async function fetchFinMindInstitutional(symbol: string, date: string): Promise<{ foreign: number, trust: number, dealer: number, total: number, found: boolean } | null> {
  const url = `/api/finmind?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${symbol}&start_date=${date}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 200 && json.data?.length > 0) {
      // FinMind might return multiple rows for the same day (one per investor type)
      const dayData = json.data.filter((r: any) => r.date === date);
      if (dayData.length === 0) return null;

      let f = 0, t = 0, d = 0;
      dayData.forEach((r: any) => {
        const net = safeNum(r.buy) - safeNum(r.sell);
        if (r.name.includes('Foreign')) f += net;
        else if (r.name.includes('Trust')) t += net;
        else if (r.name.includes('Dealer')) d += net;
      });

      return {
        foreign: Math.round(f / 1000),
        trust: Math.round(t / 1000),
        dealer: Math.round(d / 1000),
        total: Math.round((f + t + d) / 1000),
        found: true
      };
    }
  } catch (e) {
    console.warn("FinMind Institutional fetch failed", e);
  }
  return null;
}

async function fetchInstitutionalData(symbol: string, date: string, suffix: string): Promise<{ foreign: number, trust: number, dealer: number, total: number, found: boolean, reason?: 'notInList' | 'apiError', noActivity?: boolean }> {
  const clean = (s: string) => String(s || "").replace(/\s/g, '');
  const cleanSymbol = clean(symbol);

  const performFetch = async (targetSuffix: string) => {
    try {
      // 1. Try TWSE T86 (Covers many stocks, including some OTC)
      const isLikelyETF = symbol.startsWith('00') || symbol.length > 4;
      const t86Types = isLikelyETF 
        ? ["0099P", "ALLBUT0999", "0015", "0049"] 
        : ["ALLBUT0999", "0099P", "0015", "0049"];
      
      for (const type of t86Types) {
        const url = `/api/twse?path=/rwd/zh/fund/T86&response=json&date=${date.replace(/-/g, '')}&selectType=${type}`;
        const res = await fetch(url);
        const json = await res.json();
        
        if (json.stat === "OK" && json.data) {
          const row = json.data.find((r: any[]) => clean(r[0]) === cleanSymbol);
          if (row) {
            console.log(`[Inst] Found ${symbol} in TWSE T86 (${type})`);
            const f = safeNum(row[4]);
            const t = safeNum(row[10]);
            const d = safeNum(row[11]);
            const total = safeNum(row[16]);
            return {
              foreign: Math.round(f / 1000),
              trust: Math.round(t / 1000),
              dealer: Math.round(d / 1000),
              total: Math.round(total / 1000),
              found: true,
              noActivity: false
            };
          }
        }
      }

      // 2. If OTC stock, try TWSE TWT38U (OTC Institutional)
      if (targetSuffix === ".TWO") {
        const twtTypes = ["", "EW", "ES"]; // "" for all, EW for general, ES for innovation
        for (const type of twtTypes) {
           const qs = type ? `&selectType=${type}` : "";
           const url = `/api/twse?path=/rwd/zh/fund/TWT38U&response=json&date=${date.replace(/-/g, '')}${qs}`;
           const res = await fetch(url);
           const json = await res.json();
          
           console.log(`[Inst] TWSE TWT38U selectType="${type}" stat=${json.stat} rows=${json.data?.length ?? 'N/A'}`);
          
           if (json.stat === "OK" && json.data && json.data.length > 0) {
             console.log('[TWT38U Field Check]', json.data[0]);
             const row = json.data.find((r: any[]) => clean(r[0]) === cleanSymbol);
             if (row) {
               console.log(`[Inst] Found ${symbol} in TWSE TWT38U (${type})`);
               // Guess indexes based on T86 style but log them
               // Usually: 0:Code, 1:Name, 2:ForeignBuy, 3:ForeignSell, 4:ForeignNet...
               // For TWT38U (OTC summary daily), indexes might be different. 
               // Based on standard TWSE OTC summary: 4:ForeignNet, 10:TrustNet, 11:DealerNet
               const f = safeNum(row[4]);
               const t = safeNum(row[10]);
               const d = safeNum(row[11]);
               // The total field index can vary, so sum them manually if unsure
               const total = f + t + d;
               return {
                 foreign: Math.round(f / 1000),
                 trust: Math.round(t / 1000),
                 dealer: Math.round(d / 1000),
                 total: Math.round(total / 1000),
                 found: true,
                 noActivity: false
               };
             }
           }
        }
      }

      // 3. Fallback to TPEx Scraper (3itrade)
      if (targetSuffix === ".TWO") {
        const rocDate = getROCDate(new Date(date));
        const seTypes = ["EW", "ES", ""];
        for (const se of seTypes) {
          const url = `/api/tpex?path=/web/stock/3insti/daily_trade/3itrade_hedge_result.php&l=zh-tw&o=json&se=${se}&t=D&d=${rocDate}`;
          const res = await fetch(url);
          const json = await res.json();
          
          if (json.aaData && json.aaData.length > 0) {
            console.log('[TPEx Field Check]', json.aaData[0]);
            const row = json.aaData.find((r: any[]) => clean(r[0]) === cleanSymbol);
            if (row) {
              const f = safeNum(row[4]);
              const t = safeNum(row[7]);
              const d = safeNum(row[10]);
              const total = safeNum(row[11]);
              return { 
                foreign: Math.round(f / 1000), 
                trust: Math.round(t / 1000), 
                dealer: Math.round(d / 1000), 
                total: Math.round(total / 1000), 
                found: true, 
                noActivity: false 
              };
            }
          }
        }
      }
      
      return { foreign: 0, trust: 0, dealer: 0, total: 0, found: true, noActivity: true, reason: 'notInList' as const };
    } catch (e) {
      console.warn(`[Inst] ${targetSuffix} fetch failed for ${symbol}`, e);
      return { foreign: 0, trust: 0, dealer: 0, total: 0, found: false, reason: 'apiError' as const };
    }
  };

  // 1. Primary Attempt
  let result = await performFetch(suffix);
  if (result && result.found && !result.noActivity) return result;
  if (result && result.reason === ('apiError' as const)) return result;

  // 2. Cross-market retry
  const otherSuffix = suffix === ".TW" ? ".TWO" : ".TW";
  console.log(`[Inst] ${symbol} Primary ${suffix} not found/no-activity, trying ${otherSuffix}`);
  const otherResult = await performFetch(otherSuffix);
  
  if (otherResult && otherResult.found && !otherResult.noActivity) return otherResult;
  if (otherResult && otherResult.reason === ('apiError' as const)) return otherResult;

  // 3. Ultimate Fallback: FinMind (Try even if scraper said "noActivity")
  console.log(`[Inst] ${symbol} Scrapers failed or said no activity, trying FinMind...`);
  const finmindResult = await fetchFinMindInstitutional(symbol, date);
  if (finmindResult && finmindResult.found) {
    return { ...finmindResult, noActivity: false };
  }

  // 4. Final conclusion if both scrapers said "notInList"
  if (result?.noActivity || otherResult?.noActivity) {
    return { foreign: 0, trust: 0, dealer: 0, total: 0, found: true, noActivity: true, reason: 'notInList' as const };
  }

  return { foreign: 0, trust: 0, dealer: 0, total: 0, found: false, reason: 'apiError' as const };
}

async function fetchFinMindMargin(symbol: string, date: string) {
  // FinMind data often lags. We fetch the last 5 days to ensure we get the latest available point.
  const d = new Date(date);
  d.setDate(d.getDate() - 5);
  const startDate = d.toISOString().split('T')[0];

  const url = `/api/finmind?dataset=TaiwanStockMarginPurchaseShortSale&data_id=${symbol}&start_date=${startDate}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 200 && json.data?.length > 0) {
      // Find the record closest to our target date (or simply the last one available)
      return json.data[json.data.length - 1];
    }
  } catch (e) {
    console.warn("FinMind Margin fetch failed", e);
  }
  return null;
}

async function fetchIndicesFallback() {
  const defaultIndices = {
    taiex: { close: 0, change: 0, percent: 0 },
    otc: { close: 0, change: 0, percent: 0 }
  };

  try {
    // 1. Try TWSE Market Summary (MI_INDEX MS) for TAIEX
    let current = new Date();
    current.setTime(current.getTime() + 8 * 3600 * 1000); // TW Time
    
    let taiexData = defaultIndices.taiex;
    for (let i = 0; i < 5; i++) {
      const y = current.getUTCFullYear();
      const m = String(current.getUTCMonth() + 1).padStart(2, "0");
      const d = String(current.getUTCDate()).padStart(2, "0");
      const dateStr = `${y}${m}${d}`;
      
      const res = await fetch(`/api/twse?path=/exchangeReport/MI_INDEX&response=json&date=${dateStr}&type=MS`);
      const json = await res.json();
      
      if (json.stat === "OK" && json.data7) {
        const taiexRow = json.data7[0];
        if (taiexRow) {
          const close = safeNum(taiexRow[1]);
          const changeVal = safeNum(taiexRow[3]);
          const sign = (taiexRow[2] || "").includes("color:red") || (taiexRow[2] || "").includes("+") ? 1 : -1;
          const change = changeVal * sign;
          const prev = close - change;
          taiexData = { close, change, percent: (change / prev) * 100 };
          break;
        }
      }
      current.setTime(current.getTime() - 86400000);
    }

    // 2. Try TPEx Market Summary for OTC
    let otcData = defaultIndices.otc;
    const resO = await fetch(`/api/tpex?path=/web/stock/aftertrading/otc_trading_summary/result.php&l=zh-tw&o=json`);
    const jsonO = await resO.json();
    if (jsonO.reportDate) {
      // Find "櫃買指數" row usually in some data field, or just use the first row if it matches
      // TPEx API is a bit complex for summary, but often it has aggregate data.
      // Alternatively, just try to get it from historical if today fails.
      const url = `/api/tpex?path=/web/stock/aftertrading/daily_trading_index/stk_index_result.php&l=zh-tw&o=json`;
      const resIdx = await fetch(url);
      const jsonIdx = await resIdx.json();
      if (jsonIdx.iTotalRecords > 0) {
        const last = jsonIdx.aaData[jsonIdx.aaData.length - 1];
        // 1: Index, 2: Change
        const close = safeNum(last[1]);
        const change = safeNum(last[2]);
        const prev = close - change;
        otcData = { close, change, percent: (change / prev) * 100 };
      }
    }

    return { taiex: taiexData, otc: otcData };
  } catch (e) {
    console.warn("Index fallback failed", e);
  }
  return defaultIndices;
}

async function fetchMarketIndices() {
  const cacheKey = `market_indices`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data, expiry } = JSON.parse(cached);
      if (Date.now() < expiry) {
        console.log(`[CACHE] Using cached market indices`);
        return data;
      }
    } catch(e) { 
      sessionStorage.removeItem(cacheKey);
    }
  }

  try {
    // Skip Yahoo, go straight to official APIs
    const finalIndices = await fetchIndicesFallback();
    
    // Cache for 5 minutes
    sessionStorage.setItem(cacheKey, JSON.stringify({ data: finalIndices, expiry: Date.now() + 300000 }));
    
    return finalIndices;
  } catch (e) {
    console.warn("Indices fetch failed, using fallback", e);
    const fallback = await fetchIndicesFallback();
    sessionStorage.setItem(cacheKey, JSON.stringify({ data: fallback, expiry: Date.now() + 300000 }));
    return fallback;
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
    
    if (data.found) {
      return { ...data, actualDate: currentDateStr };
    }

    if (data.reason === 'notInList') {
      // Confirmed no activity today, stop fallback and return zeros
      console.log(`[Inst] ${symbol} no activity on ${currentDateStr} (confirmed by empty search in T86 list)`);
      return { ...data, actualDate: currentDateStr, noActivity: true, found: true };
    }

    console.log(`[Inst] ${symbol} fetch failed (apiError) on ${currentDateStr}, retrying previous day...`);
    currentDateStr = getPrevTradingDay(currentDateStr);
  }
  return { foreign: 0, trust: 0, dealer: 0, total: 0, found: false, actualDate: initialDate, noActivity: false };
}

export async function fetchAllStockData(symbol: string): Promise<StockData> {
  // 1. Get Price via Official APIs
  const stockPriceData = await fetchStockPrice(symbol);
  if (!stockPriceData) {
    throw new Error(`找不到股票 ${symbol} 的資產資料。請確認代碼是否正確。`);
  }

  const tradingDate = stockPriceData.date;

  // 2. Parallel fetches (Initial inst fetch or wait? Let's keep parallel but handle inst delay)
  // Actually, breadths (Gemini) might also need date adjustment if it's too early.
  const results = await Promise.allSettled([
    fetchInstitutionalWithFallback(symbol, tradingDate, stockPriceData.suffix),
    fetchFinMindMargin(symbol, tradingDate),
    fetchMarketIndices(),
    withTimeout(fetchMarketBreadthViaGemini(tradingDate), 15000, {
      advance: 0,
      decline: 0,
      note: "搜尋超時"
    })
  ]);

  const instResult = results[0].status === 'fulfilled' ? results[0].value : { foreign: 0, trust: 0, dealer: 0, total: 0, found: false, actualDate: tradingDate, noActivity: false };
  const margin = results[1].status === 'fulfilled' ? results[1].value : null;
  const indices = results[2].status === 'fulfilled' ? results[2].value : { taiex: { close: 0, change: 0, percent: 0 }, otc: { close: 0, change: 0, percent: 0 } };
  const breadths = results[3].status === 'fulfilled' ? results[3].value : { advance: 0, decline: 0, note: "資料獲取失敗" };

  console.log("[DEBUG] Institutional Data:", instResult);

  const foreign = safeNum(instResult.foreign);
  const trust = safeNum(instResult.trust);
  const dealer = safeNum(instResult.dealer);
  const total = safeNum(instResult.total);
  
  const marginBalance = margin ? safeNum(margin.MarginPurchaseTodayBalance) : 0;
  const marginYest = margin ? safeNum(margin.MarginPurchaseYesterdayBalance) : marginBalance;
  const marginChange = marginBalance - marginYest;

  const turnoverRatio = (stockPriceData.volume / (stockPriceData.avgVol5D || 1)) * 100;

  return {
    symbol,
    name: symbol, // Could fetch name from Yahoo result if needed
    price: stockPriceData.close,
    change: stockPriceData.change,
    changePercent: stockPriceData.changePercent,
    volume: stockPriceData.volume,
    avgVolume5D: stockPriceData.avgVol5D,
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
      institutionDataFound: instResult.found,
      institutionNoActivity: (instResult as any).noActivity || false,
      latestPrice: { close: stockPriceData.close, spread: stockPriceData.change, Trading_Volume: stockPriceData.volume },
      marginData: margin ? [margin] : [],
      geminiNote: breadths.note,
      taiex: indices.taiex,
      otc: indices.otc,
      note: `大盤今日${indices.taiex.change > 0 ? "漲" : "跌"} ${Math.abs(indices.taiex.change).toFixed(2)} 點 (${indices.taiex.percent.toFixed(2)}%)，櫃買指數 ${indices.otc.percent.toFixed(2)}%。` + 
            (breadths.advance > 0 ? ` 漲跌家數：${breadths.advance}/${breadths.decline}。` : "")
    }
  };
}
