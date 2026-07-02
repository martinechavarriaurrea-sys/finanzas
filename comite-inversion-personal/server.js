const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const POSITION_FILE = path.join(DATA_DIR, "financial-position.json");
const LOG_FILE = path.join(DATA_DIR, "decision-log.json");

const MARKET_SYMBOLS = [
  { ticker: "VOO", yahoo: "VOO", name: "Vanguard S&P 500 ETF" },
  { ticker: "VTI", yahoo: "VTI", name: "Vanguard Total Stock Market ETF" },
  { ticker: "VXUS", yahoo: "VXUS", name: "Vanguard Total International ETF" },
  { ticker: "QQQM", yahoo: "QQQM", name: "Invesco NASDAQ 100 ETF" },
  { ticker: "SCHD", yahoo: "SCHD", name: "Schwab US Dividend Equity ETF" },
  { ticker: "BND", yahoo: "BND", name: "Vanguard Total Bond Market ETF" },
  { ticker: "S&P 500", yahoo: "^GSPC", name: "S&P 500" },
  { ticker: "Nasdaq 100", yahoo: "^NDX", name: "Nasdaq 100" },
  { ticker: "Russell 2000", yahoo: "^RUT", name: "Russell 2000" },
  { ticker: "Dow Jones", yahoo: "^DJI", name: "Dow Jones Industrial Average" },
  { ticker: "VIX", yahoo: "^VIX", name: "CBOE Volatility Index" },
  { ticker: "DXY", yahoo: "DX-Y.NYB", name: "US Dollar Index" },
  { ticker: "USD/COP", yahoo: "COP=X", name: "US Dollar / Colombian Peso" },
  { ticker: "Oro", yahoo: "GC=F", name: "Gold Futures" },
  { ticker: "WTI", yahoo: "CL=F", name: "WTI Crude Oil Futures" }
];

const FRED_SERIES = [
  { id: "DGS2", label: "US Treasury 2Y" },
  { id: "DGS10", label: "US Treasury 10Y" },
  { id: "DGS30", label: "US Treasury 30Y" },
  { id: "FEDFUNDS", label: "Fed Funds Rate" },
  { id: "CPIAUCSL", label: "CPI EE.UU." },
  { id: "UNRATE", label: "Desempleo EE.UU." }
];

const DEFAULT_POSITION = {
  cash_cop: 0,
  cash_usd: 0,
  emergency_fund_current: 0,
  emergency_fund_target: 0,
  monthly_income: 0,
  monthly_expenses_fixed: 0,
  monthly_expenses_variable: 0,
  monthly_expenses_pending: 0,
  debt_balance: 0,
  debt_interest_rate: 0,
  upcoming_payments: 0,
  projected_monthly_savings: 0,
  actual_monthly_savings: 0,
  minimum_liquidity_required: 0,
  monthly_investment_goal: 0,
  portfolio: [
    { ticker: "VOO", quantity: 0, average_price_usd: 0, target_weight: 70, total_contributions_usd: 0 },
    { ticker: "VXUS", quantity: 0, average_price_usd: 0, target_weight: 15, total_contributions_usd: 0 },
    { ticker: "BND", quantity: 0, average_price_usd: 0, target_weight: 10, total_contributions_usd: 0 },
    { ticker: "QQQM", quantity: 0, average_price_usd: 0, target_weight: 5, total_contributions_usd: 0 }
  ]
};

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(POSITION_FILE);
  } catch {
    await fs.writeFile(POSITION_FILE, JSON.stringify(DEFAULT_POSITION, null, 2));
  }
  try {
    await fs.access(LOG_FILE);
  } catch {
    await fs.writeFile(LOG_FILE, "[]");
  }
}

function send(res, status, data, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(type === "application/json" ? JSON.stringify(data) : data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, item) => sum + item, 0) / period;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  const slice = values.slice(-period - 1);
  for (let index = 1; index < slice.length; index += 1) {
    const diff = slice[index] - slice[index - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function ema(values, period) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let result = sma(values.slice(0, period), period);
  for (const value of values.slice(period)) {
    result = (value - result) * multiplier + result;
  }
  return result;
}

function atr(quotes, period = 14) {
  if (quotes.length <= period) return null;
  const ranges = [];
  for (let index = 1; index < quotes.length; index += 1) {
    const quote = quotes[index];
    const previous = quotes[index - 1];
    ranges.push(Math.max(
      quote.high - quote.low,
      Math.abs(quote.high - previous.close),
      Math.abs(quote.low - previous.close)
    ));
  }
  return sma(ranges, period);
}

function bollinger(values, period = 20) {
  if (values.length < period) return null;
  const middle = sma(values, period);
  const slice = values.slice(-period);
  const variance = slice.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
  const deviation = Math.sqrt(variance);
  return { lower: middle - 2 * deviation, middle, upper: middle + 2 * deviation };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 comite-inversion-personal"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 comite-inversion-personal"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const payload = await fetchJson(url);
  const result = payload.chart?.result?.[0];
  if (!result) throw new Error("Yahoo Finance no devolvio datos");
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || quote.close || [];
  const rows = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: safeNumber(adjusted[index] ?? quote.close?.[index]),
    open: safeNumber(quote.open?.[index]),
    high: safeNumber(quote.high?.[index]),
    low: safeNumber(quote.low?.[index]),
    volume: safeNumber(quote.volume?.[index])
  })).filter((row) => row.close && row.high && row.low);
  if (!rows.length) throw new Error("Serie vacia");
  const closes = rows.map((row) => row.close);
  const latest = rows.at(-1);
  const previous = rows.at(-2) || latest;
  const week = rows.at(-6) || rows[0];
  const month = rows.at(-22) || rows[0];
  const ath = Math.max(...closes);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = ema12 !== null && ema26 !== null ? ema12 - ema26 : null;
  return {
    current_price: latest.close,
    daily_change_percentage: ((latest.close / previous.close) - 1) * 100,
    weekly_change_percentage: ((latest.close / week.close) - 1) * 100,
    monthly_change_percentage: ((latest.close / month.close) - 1) * 100,
    drawdown_from_ath: ((latest.close / ath) - 1) * 100,
    moving_average_20: sma(closes, 20),
    moving_average_50: sma(closes, 50),
    moving_average_100: sma(closes, 100),
    moving_average_200: sma(closes, 200),
    RSI: rsi(closes),
    MACD: macd,
    ATR: atr(rows),
    bollinger: bollinger(closes),
    volume: latest.volume,
    data_timestamp: latest.date,
    data_source: "Yahoo Finance chart API, sin llave, uso gratuito/no oficial"
  };
}

async function fetchFredSeries(series) {
  const text = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series.id}`);
  const lines = text.trim().split(/\r?\n/).slice(1).filter(Boolean);
  const latest = [...lines].reverse().find((line) => {
    const value = line.split(",")[1];
    return value && value !== ".";
  });
  if (!latest) throw new Error("Serie FRED vacia");
  const [date, value] = latest.split(",");
  return {
    id: series.id,
    label: series.label,
    value: Number(value),
    date,
    data_source: "FRED CSV publico"
  };
}

async function fetchColombiaTrm() {
  const url = "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC";
  const payload = await fetchJson(url);
  const row = payload?.[0];
  if (!row) throw new Error("TRM no disponible");
  return {
    value: Number(row.valor),
    date: row.vigenciadesde || row.vigenciahasta,
    data_source: "Datos Abiertos Colombia, recurso 32sa-8pi3"
  };
}

async function getMarketData() {
  const market = await Promise.all(MARKET_SYMBOLS.map(async (item) => {
    try {
      return { ...item, ...(await fetchYahoo(item.yahoo)), status: "ok" };
    } catch (error) {
      return { ...item, status: "error", error: error.message };
    }
  }));
  const macro = await Promise.all(FRED_SERIES.map(async (series) => {
    try {
      return { ...(await fetchFredSeries(series)), status: "ok" };
    } catch (error) {
      return { ...series, status: "error", error: error.message };
    }
  }));
  let trm = null;
  try {
    trm = await fetchColombiaTrm();
  } catch (error) {
    trm = { status: "error", error: error.message };
  }
  return {
    generated_at: new Date().toISOString(),
    market,
    macro,
    colombia: { trm },
    free_sources: [
      "Yahoo Finance chart API: precios historicos y actuales aproximados sin llave oficial.",
      "FRED CSV publico: tasas y macro de EE.UU. sin llave.",
      "Datos Abiertos Colombia: TRM oficial publicada por entidades colombianas."
    ]
  };
}

function enrichPortfolio(position, marketData) {
  const usdCop = marketData.market.find((item) => item.ticker === "USD/COP")?.current_price || 0;
  const prices = new Map(marketData.market.map((item) => [item.ticker, item.current_price || 0]));
  const rows = (position.portfolio || []).map((asset) => {
    const price = prices.get(asset.ticker) || 0;
    const quantity = Number(asset.quantity || 0);
    const average = Number(asset.average_price_usd || 0);
    const marketValueUsd = quantity * price;
    const costUsd = quantity * average;
    return {
      ...asset,
      current_price_usd: price,
      market_value_usd: marketValueUsd,
      market_value_cop: marketValueUsd * usdCop,
      unrealized_gain_usd: marketValueUsd - costUsd,
      unrealized_gain_cop: (marketValueUsd - costUsd) * usdCop,
      unrealized_gain_percentage: costUsd > 0 ? ((marketValueUsd / costUsd) - 1) * 100 : 0
    };
  });
  const total = rows.reduce((sum, row) => sum + row.market_value_usd, 0);
  return rows.map((row) => ({
    ...row,
    current_weight: total > 0 ? (row.market_value_usd / total) * 100 : 0,
    deviation_from_target: total > 0 ? (row.market_value_usd / total) * 100 - Number(row.target_weight || 0) : 0
  }));
}

function buildDecision(position, marketData, portfolio) {
  const voo = marketData.market.find((item) => item.ticker === "VOO");
  const vix = marketData.market.find((item) => item.ticker === "VIX");
  const usdCop = marketData.market.find((item) => item.ticker === "USD/COP");
  const pending = Number(position.monthly_expenses_pending || 0);
  const cashCop = Number(position.cash_cop || 0);
  const minLiquidity = Number(position.minimum_liquidity_required || 0);
  const emergencyCurrent = Number(position.emergency_fund_current || 0);
  const emergencyTarget = Number(position.emergency_fund_target || 0);
  const debtBalance = Number(position.debt_balance || 0);
  const debtRate = Number(position.debt_interest_rate || 0);
  const projectedSavings = Number(position.projected_monthly_savings || 0);
  const actualSavings = Number(position.actual_monthly_savings || 0);
  const hardStops = [];
  if (cashCop < minLiquidity) hardStops.push("Caja disponible por debajo de liquidez minima");
  if (emergencyCurrent < emergencyTarget) hardStops.push("Fondo de emergencia incompleto");
  if (pending > 0 && cashCop - pending < minLiquidity) hardStops.push("Pagos proximos no cubiertos sin tocar liquidez minima");
  if (debtBalance > 0 && debtRate >= 15) hardStops.push("Deuda cara activa");
  if (actualSavings < projectedSavings) hardStops.push("Ahorro real por debajo del proyectado");

  const investableSurplus = Math.max(0, cashCop - minLiquidity - pending);
  const drawdown = voo?.drawdown_from_ath ?? 0;
  let action = "No hacer nada";
  let opportunity = "Sin oportunidad clara";
  let suggestedPercent = 0;
  let confidence = "Media";

  if (hardStops.length) {
    action = "Mantener liquidez";
    confidence = "Alta";
  } else if (investableSurplus <= 0) {
    action = "Mantener liquidez";
    confidence = "Alta";
    hardStops.push("No hay caja excedente real");
  } else if (drawdown <= -15 && (vix?.current_price || 0) >= 25) {
    action = "Compra acelerada fuerte";
    opportunity = "VOO en correccion profunda con volatilidad elevada";
    suggestedPercent = 45;
  } else if (drawdown <= -10) {
    action = "Compra acelerada parcial";
    opportunity = "VOO en correccion relevante";
    suggestedPercent = 30;
  } else if (drawdown <= -5) {
    action = "Compra acelerada parcial";
    opportunity = "VOO en correccion moderada";
    suggestedPercent = 15;
  } else if (Number(position.monthly_investment_goal || 0) > 0) {
    action = "Compra normal DCA";
    opportunity = "Plan periodico sin correccion extraordinaria";
    suggestedPercent = 0;
  }

  const dcaAmount = Math.min(Number(position.monthly_investment_goal || 0), investableSurplus);
  const suggestedCop = action === "Compra normal DCA"
    ? dcaAmount
    : Math.round(investableSurplus * (suggestedPercent / 100));
  const riskScore = hardStops.length ? 7 : drawdown <= -15 ? 6 : drawdown <= -10 ? 5 : 4;
  const scenarios = {
    bullish: drawdown <= -10 ? 50 : 45,
    sideways: drawdown <= -10 ? 30 : 35,
    bearish: drawdown <= -10 ? 20 : 20
  };
  const usdCopValue = usdCop?.current_price || 0;
  return {
    data_quality: marketData.market.some((item) => item.status === "error") ? "Parciales" : "Actualizados",
    action,
    opportunity,
    confidence,
    hardStops,
    suggested_amount_cop: suggestedCop,
    suggested_amount_usd: usdCopValue > 0 ? suggestedCop / usdCopValue : 0,
    investable_surplus: investableSurplus,
    liquidity_after: cashCop - suggestedCop,
    risk_level_1_to_10: riskScore,
    scenarios,
    risks: [
      "El mercado puede caer otro 10% despues de comprar.",
      "El USD/COP puede moverse contra la posicion.",
      "Los datos gratuitos pueden tener retrasos o fallos temporales.",
      "La cartera depende de la precision de los datos ingresados manualmente."
    ],
    opportunities: [
      opportunity,
      "Mantener DCA reduce riesgo de mala sincronizacion del mercado.",
      "Rebalancear con nuevos aportes evita ventas e impuestos innecesarios."
    ],
    portfolio
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC, pathname));
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[ext] || "application/octet-stream";
    send(res, 200, content, type);
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return send(res, 204, {});

  if (url.pathname === "/api/financial-position" && req.method === "GET") {
    return send(res, 200, await readJson(POSITION_FILE, DEFAULT_POSITION));
  }

  if (url.pathname === "/api/financial-position" && req.method === "POST") {
    const payload = JSON.parse(await readBody(req));
    await fs.writeFile(POSITION_FILE, JSON.stringify(payload, null, 2));
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/market-data" && req.method === "GET") {
    return send(res, 200, await getMarketData());
  }

  if (url.pathname === "/api/portfolio" && req.method === "GET") {
    const position = await readJson(POSITION_FILE, DEFAULT_POSITION);
    const marketData = await getMarketData();
    return send(res, 200, enrichPortfolio(position, marketData));
  }

  if (url.pathname === "/api/analysis" && req.method === "GET") {
    const position = await readJson(POSITION_FILE, DEFAULT_POSITION);
    const marketData = await getMarketData();
    const portfolio = enrichPortfolio(position, marketData);
    return send(res, 200, { position, marketData, portfolio, decision: buildDecision(position, marketData, portfolio) });
  }

  if (url.pathname === "/api/decision-log" && req.method === "GET") {
    return send(res, 200, await readJson(LOG_FILE, []));
  }

  if (url.pathname === "/api/decision-log" && req.method === "POST") {
    const payload = JSON.parse(await readBody(req));
    const log = await readJson(LOG_FILE, []);
    log.unshift({ ...payload, saved_at: new Date().toISOString() });
    await fs.writeFile(LOG_FILE, JSON.stringify(log.slice(0, 200), null, 2));
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: "Endpoint no encontrado" });
}

ensureDataFiles().then(() => {
  http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      handleApi(req, res).catch((error) => send(res, 500, { error: error.message }));
    } else {
      serveStatic(req, res).catch((error) => send(res, 500, error.message, "text/plain"));
    }
  }).listen(PORT, () => {
    console.log(`Comite de Inversion Personal listo en http://localhost:${PORT}`);
  });
});
