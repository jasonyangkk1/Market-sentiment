import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AnalysisResult {
  symbol: string;
  recommendation: "強力買進" | "分批布局" | "觀望" | "絕對觀望";
  confidence: number;
  indicators: {
    sentiment: string;
    retest: string;
    marketBreadth: string;
    overnightTrap: string;
    insiderShadow: string;
    retailWeight: string;
  };
  scores: {
    sentiment: number;
    retest: number;
    marketBreadth: number;
    overnightTrap: number;
    insiderShadow: number;
    retailWeight: number;
    total: number;
  };
  summary: string;
}

export async function analyzeStock(symbol: string): Promise<AnalysisResult> {
  // 1. 用 UTC+8 計算今天的真實日期
  const now = new Date();
  const utc8Time = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (8 * 3600000));
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/');
  };

  const today = formatDate(utc8Time);
  const dayOfWeek = utc8Time.getDay(); // 0: 日, 1: 一, ..., 6: 六

  // 2. 判斷交易日邏輯
  let lastTradingDayTime = new Date(utc8Time);
  if (dayOfWeek === 6) { // 週六
    lastTradingDayTime.setDate(utc8Time.getDate() - 1);
  } else if (dayOfWeek === 0) { // 週日
    lastTradingDayTime.setDate(utc8Time.getDate() - 2);
  }
  const lastTradingDay = formatDate(lastTradingDayTime);
  
  const prompt = `你是一位專業的台股籌碼大師。
今日為 ${today}，最近交易日為 ${lastTradingDay}，以下分析以 ${lastTradingDay} 盤後資料為基準。

請針對股票「${symbol}」進行「最近交易日 (${lastTradingDay})」的即時籌碼判讀。

任務指令：
1. **數據蒐集與嚴禁捏造**：
   - 請使用 googleSearch 執行以下搜尋：
     1. 「${symbol} 籌碼面 ${lastTradingDay} 融資餘額 週轉率」
     2. 「台股 今日 ADL 上漲家數 下跌家數」
     3. 「${symbol} ${lastTradingDay} 成交量 5日均量」
     4. 「${symbol} ${lastTradingDay} 主力買賣超」
   - **嚴禁** 使用紀錄不存在的假設數據。若搜尋不到某項具體數據，該項評分 **直接給 0 分**。

2. **指標說明**：每個 indicators 欄位格式：「[具體數據]。[判讀邏輯]。[因此評為看多/看空/資料不足]。」

3. **硬性評分門檻** (看多 +1, 看空 0, 資料不足 0)：
   - **情緒指標 (Sentiment)**: 週轉率 > 15% 則為 0分，≤ 15% 則為 +1。
   - **量縮回測 (Retest)**: 今日成交量 < (5日均量 * 0.7) 則為 +1，否則為 0分。
   - **大盤環境 (Market Breadth)**: ADL 上漲家數 > 下跌家數 則為 +1，否則為 0分。
   - **隔日沖 (Overnight Trap)**: 分點買超則為 +1，賣超或無數據則為 0分。
   - **關鍵分點 (Insider Shadow)**: 主力吸籌則為 +1，出貨則為 0分。
   - **散戶融資 (Retail Weight)**: 融資減少則為 +1，增加則為 0分。

4. **結論級距決定**：
   - 總分 5-6: 「強力買進」
   - 總分 4: 「分批布局」
   - 總分 3: 「觀望」
   - 總分 0-2: 「絕對觀望」

請以 JSON 格式回傳，必須包含 symbol, recommendation, confidence, indicators, scores, summary。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        temperature: 0,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            symbol: { type: Type.STRING },
            recommendation: { type: Type.STRING, enum: ["強力買進", "分批布局", "觀望", "絕對觀望"] },
            confidence: { type: Type.NUMBER },
            indicators: {
              type: Type.OBJECT,
              properties: {
                sentiment: { type: Type.STRING },
                retest: { type: Type.STRING },
                marketBreadth: { type: Type.STRING },
                overnightTrap: { type: Type.STRING },
                insiderShadow: { type: Type.STRING },
                retailWeight: { type: Type.STRING },
              },
              required: ["sentiment", "retest", "marketBreadth", "overnightTrap", "insiderShadow", "retailWeight"],
            },
            scores: {
              type: Type.OBJECT,
              properties: {
                sentiment: { type: Type.NUMBER },
                retest: { type: Type.NUMBER },
                marketBreadth: { type: Type.NUMBER },
                overnightTrap: { type: Type.NUMBER },
                insiderShadow: { type: Type.NUMBER },
                retailWeight: { type: Type.NUMBER },
                total: { type: Type.NUMBER },
              },
              required: ["sentiment", "retest", "marketBreadth", "overnightTrap", "insiderShadow", "retailWeight", "total"],
            },
            summary: { type: Type.STRING },
          },
          required: ["symbol", "recommendation", "confidence", "indicators", "scores", "summary"],
        },
      },
    });

    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (error) {
    console.error("Analysis failed:", error);
    throw new Error("無法完成分析，可能由於數據抓取超時，請稍後再試。");
  }
}
