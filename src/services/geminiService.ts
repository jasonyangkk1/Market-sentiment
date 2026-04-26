import { GoogleGenAI, Type } from "@google/genai";
import { StockData } from "./twseService";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AnalysisResult {
  symbol: string;
  tradingDate: string;
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

export async function analyzeStock(data: StockData): Promise<AnalysisResult> {
  const { symbol, name, price, change, volume, avgVolume5D, institutions, margin, marketBreadth } = data;

  const prompt = `你是一位專業的台股籌碼大師。
請針對以下實際抓取的數據進行專業判讀與評分。

【個股基本數據 - ${symbol} ${name}】
- 收盤價: ${price} (漲跌: ${change})
- 今日成交量: ${volume} 張
- 5日均量: ${avgVolume5D.toFixed(0)} 張
- 三大法人合計買賣超: ${institutions.total} 張 (外資: ${institutions.foreign}, 投信: ${institutions.trust}, 自營: ${institutions.dealer})
- 融資餘額: ${margin.balance} 張 (今日增減: ${margin.change} 張)

【市場環境】
- 加權指數 (TAIEX) 今天表現：${data.raw.taiex.percent.toFixed(2)}%
- 櫃買指數 (OTC) 今天表現：${data.raw.otc?.percent.toFixed(2) || "N/A"}%
- 漲跌家數：${marketBreadth.advance} 家上漲 / ${marketBreadth.decline} 家下跌
- 數據說明：當前漲跌家數資料由搜尋擷取，請綜合大盤與櫃買走勢判斷。

任務指令：
1. **詳盡指標說明**：每個 indicators 欄位格式：「[數據判讀]。[判讀邏輯]。[因此評為看多/看空]。」
   - 對於「大盤環境濾網」，請特別注意「加權指數」與「櫃買指數」的背離：
     - 若加權指數大漲但櫃買指數微漲或下跌，且漲跌家數顯示「跌多漲少」，這屬於典型的「拉積盤（拉大出小）」，對一般個股（特別是中小型股）不利，應給予【保守/看空】評價。
     - 若兩者同步上漲且上漲家數大於下跌家數，則為健康的「普漲環境」，給予【看多】評價。
   - 對於「隔日沖警報 (Overnight Trap)」，請根據「三大法人買賣超」與「融資變化」的背離程度進行推論。例如：法人大買但股價收長上影線且融資大增，可能存在隔日沖獲利了結壓力。
   - 對於「關鍵分點 (Insider Shadow)」，請分析投信與外資的同步性。

2. **硬性評分門檻** (看多 +1, 看空 0)：
   - **情緒指標 (Sentiment)**: 根據融資與成交量判斷，若融資明顯退潮或量能溫和則計 +1。
   - **量縮回測 (Retest)**: 今日成交量 < (5日均量 * 0.8) 且股價站穩支撐則計 +1。
   - **大盤環境 (Market Breadth)**: 多空比 > 1.2 或上漲家數多則計 +1。
   - **隔日沖 (Overnight Trap)**: 判斷隔日沖壓力的存在，壓力小則計 +1。
   - **關鍵分點 (Insider Shadow)**: 三大法人（尤其投信/外資）同步買超則計 +1。
   - **散戶融資 (Retail Weight)**: 融資減少則計 +1。

3. **結論級距決定**：
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
    const result = JSON.parse(text);
    return {
      ...result,
      tradingDate: data.raw.dateStr
    };
  } catch (error) {
    console.error("Analysis failed:", error);
    throw new Error("模型分析超時或失敗，請稍後再試。");
  }
}

export async function fetchMissingDataViaGemini(
  symbol: string,
  date: string
): Promise<{
  foreign: number; trust: number; dealer: number; instTotal: number;
  marginBalance: number; marginChange: number;
  advance: number; decline: number;
  note: string;
  source?: string;
}> {
  const fallback = {
    foreign: 0, trust: 0, dealer: 0, instTotal: 0,
    marginBalance: 0, marginChange: 0,
    advance: 0, decline: 0,
    note: "搜尋失敗，使用預設值"
  };

  const prompt = `你是台股資料擷取助理。請用 Google 搜尋以下資料，日期為 ${date}（若當日無資料請找最近一個交易日）。

需要搜尋的股票代號：${symbol}

【搜尋任務一】${symbol} 三大法人買賣超
搜尋建議：「${symbol} ${date} 三大法人」或「${symbol} 法人買賣超」
來源建議：goodinfo.tw、cnyes.com、cmoney.tw、mops.twse.com.tw

【搜尋任務二】${symbol} 融資餘額
搜尋建議：「${symbol} ${date} 融資餘額」
來源建議：goodinfo.tw、富邦、永豐

【搜尋任務三】台股大盤 ${date} 上漲家數與下跌家數
搜尋建議：「台股 ${date} 上漲家數 下跌家數」或「台股今日漲跌家數」
來源建議：twse.com.tw、cnyes.com、商業週刊股市

完成所有搜尋後，只回傳以下 JSON，數字全部用整數（張數），沒有找到的欄位填 0：
{
  "foreign": 外資買賣超張數,
  "trust": 投信買賣超張數,
  "dealer": 自營商買賣超張數,
  "instTotal": 三大法人合計張數,
  "marginBalance": 融資今日餘額張數,
  "marginChange": 融資增減張數（今日減昨日，增加為正）,
  "advance": 大盤今日上漲家數,
  "decline": 大盤今日下跌家數,
  "note": "說明找到哪些資料、來源為何"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0,
        responseMimeType: "application/json"
      }
    });

    const text = response.text?.trim() || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(clean);
    console.log("[Gemini 資料擷取]", data.note);
    return { ...fallback, ...data };
  } catch (e) {
    console.warn("[Gemini] 資料擷取失敗，使用預設值", e);
    return fallback;
  }
}
