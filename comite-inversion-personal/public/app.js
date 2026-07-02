const currencyCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const currencyUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

let state = null;

function byId(id) {
  return document.getElementById(id);
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString("es-CO", { maximumFractionDigits: digits });
}

function signed(value) {
  if (!Number.isFinite(Number(value))) return "-";
  const cls = value >= 0 ? "positive" : "negative";
  return `<span class="${cls}">${percent.format(value)}%</span>`;
}

async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

function fillForm(position) {
  const form = byId("positionForm");
  for (const [key, value] of Object.entries(position)) {
    const input = form.elements[key];
    if (input) input.value = value ?? 0;
  }
  const portfolio = position.portfolio || [];
  byId("holdingsInputs").innerHTML = portfolio.map((asset, index) => `
    <div class="holdings-grid" data-index="${index}">
      <span class="holding-ticker">${asset.ticker}</span>
      <input name="portfolio_${index}_quantity" type="number" min="0" step="0.000001" value="${asset.quantity || 0}" aria-label="Cantidad ${asset.ticker}">
      <input name="portfolio_${index}_average_price_usd" type="number" min="0" step="0.01" value="${asset.average_price_usd || 0}" aria-label="Precio promedio ${asset.ticker}">
      <input name="portfolio_${index}_target_weight" type="number" min="0" step="0.1" value="${asset.target_weight || 0}" aria-label="Peso objetivo ${asset.ticker}">
    </div>
  `).join("");
}

function readForm() {
  const form = byId("positionForm");
  const data = { ...state.position };
  for (const input of form.querySelectorAll("input")) {
    if (!input.name.startsWith("portfolio_")) {
      data[input.name] = Number(input.value || 0);
    }
  }
  data.portfolio = (data.portfolio || []).map((asset, index) => ({
    ...asset,
    quantity: Number(form.elements[`portfolio_${index}_quantity`]?.value || 0),
    average_price_usd: Number(form.elements[`portfolio_${index}_average_price_usd`]?.value || 0),
    target_weight: Number(form.elements[`portfolio_${index}_target_weight`]?.value || 0)
  }));
  return data;
}

function renderHeader(decision, market) {
  const voo = market.find((item) => item.ticker === "VOO") || {};
  byId("action").textContent = decision.action;
  byId("confidence").textContent = `Nivel de confianza: ${decision.confidence}`;
  byId("surplus").textContent = currencyCop.format(decision.investable_surplus || 0);
  byId("liquidityAfter").textContent = `Caja despues: ${currencyCop.format(decision.liquidity_after || 0)}`;
  byId("vooPrice").textContent = voo.current_price ? currencyUsd.format(voo.current_price) : "-";
  byId("vooDrawdown").textContent = `Caida desde maximo: ${formatNumber(voo.drawdown_from_ath)}%`;
  byId("riskLevel").textContent = `${decision.risk_level_1_to_10} / 10`;
  byId("dataQuality").textContent = `Datos: ${decision.data_quality}`;
}

function renderAnalysis(payload) {
  const { position, decision, marketData } = payload;
  const voo = marketData.market.find((item) => item.ticker === "VOO") || {};
  const usdCop = marketData.market.find((item) => item.ticker === "USD/COP") || {};
  const hardStops = decision.hardStops.length
    ? decision.hardStops.map((item) => `<li>${item}</li>`).join("")
    : "<li>No hay bloqueos criticos de liquidez detectados con los datos ingresados.</li>";

  byId("analysis").innerHTML = `
    <div class="analysis-block">
      <h3>Datos</h3>
      <p>Generado: ${new Date(marketData.generated_at).toLocaleString("es-CO")}. VOO: ${voo.current_price ? currencyUsd.format(voo.current_price) : "-"}, caida desde maximo ${formatNumber(voo.drawdown_from_ath)}%. USD/COP: ${usdCop.current_price ? formatNumber(usdCop.current_price) : "-"}. Caja COP: ${currencyCop.format(position.cash_cop || 0)}. Fuente de mercado: Yahoo Finance sin llave; macro: FRED CSV publico; TRM: Datos Abiertos Colombia cuando responde.</p>
    </div>
    <div class="analysis-block">
      <h3>Interpretacion</h3>
      <p>${decision.opportunity}. La prioridad sigue siendo proteger caja antes de acelerar compras. Calidad de datos: ${decision.data_quality}.</p>
      <ul>${hardStops}</ul>
    </div>
    <div class="analysis-block">
      <h3>Decision</h3>
      <p>Accion unica: <strong>${decision.action}</strong>. Monto sugerido: <strong>${currencyCop.format(decision.suggested_amount_cop || 0)}</strong> (${currencyUsd.format(decision.suggested_amount_usd || 0)}). Existe oportunidad solo si requiere confirmacion manual antes de ejecutar.</p>
    </div>
    <div class="analysis-block">
      <h3>Escenarios probabilisticos</h3>
      <p>Alcista: ${decision.scenarios.bullish}%. Lateral: ${decision.scenarios.sideways}%. Bajista: ${decision.scenarios.bearish}%. Son estimaciones operativas, no certezas.</p>
    </div>
    <div class="analysis-block">
      <h3>Riesgos</h3>
      <ul>${decision.risks.map((item) => `<li>${item}</li>`).join("")}</ul>
    </div>
  `;
}

function renderMarket(marketData) {
  byId("updatedAt").textContent = new Date(marketData.generated_at).toLocaleString("es-CO");
  byId("marketRows").innerHTML = marketData.market.map((item) => `
    <tr>
      <td><strong>${item.ticker}</strong><br><span class="muted">${item.name}</span></td>
      <td>${item.current_price ? formatNumber(item.current_price, item.ticker === "USD/COP" ? 0 : 2) : "Error"}</td>
      <td>${signed(item.daily_change_percentage)}</td>
      <td>${signed(item.weekly_change_percentage)}</td>
      <td>${signed(item.monthly_change_percentage)}</td>
      <td>${signed(item.drawdown_from_ath)}</td>
      <td>${formatNumber(item.RSI)}</td>
      <td>${formatNumber(item.moving_average_200, item.ticker === "USD/COP" ? 0 : 2)}</td>
    </tr>
  `).join("");
}

function renderPortfolio(portfolio) {
  if (!portfolio.length) {
    byId("portfolioRows").innerHTML = `<p class="muted">Todavia no hay posiciones registradas.</p>`;
    return;
  }
  byId("portfolioRows").innerHTML = portfolio.map((asset) => {
    const width = Math.min(100, Math.max(0, asset.current_weight || 0));
    return `
      <div class="asset-row">
        <div class="asset-head">
          <strong>${asset.ticker}</strong>
          <span class="muted">${formatNumber(asset.current_weight)}% actual / ${formatNumber(asset.target_weight)}% objetivo</span>
        </div>
        <div class="bar"><span style="width:${width}%"></span></div>
        <span class="muted">Valor: ${currencyUsd.format(asset.market_value_usd || 0)} | P&G: ${currencyUsd.format(asset.unrealized_gain_usd || 0)} (${formatNumber(asset.unrealized_gain_percentage)}%) | Desviacion: ${formatNumber(asset.deviation_from_target)} pp</span>
      </div>
    `;
  }).join("");
}

async function renderLog() {
  const rows = await api("/api/decision-log");
  byId("decisionLog").innerHTML = rows.length
    ? rows.slice(0, 8).map((row) => `
      <div class="log-row">
        <div class="log-head">
          <strong>${row.recommendation}</strong>
          <span class="muted">${new Date(row.saved_at).toLocaleString("es-CO")}</span>
        </div>
        <span class="muted">Monto: ${currencyCop.format(row.suggested_amount_cop || 0)} | Riesgo: ${row.risk_level}/10 | ${row.reasoning}</span>
      </div>
    `).join("")
    : `<p class="muted">Sin decisiones registradas todavia.</p>`;
}

async function refresh() {
  byId("action").textContent = "Actualizando...";
  state = await api("/api/analysis");
  fillForm(state.position);
  renderHeader(state.decision, state.marketData.market);
  renderAnalysis(state);
  renderMarket(state.marketData);
  renderPortfolio(state.portfolio);
  await renderLog();
}

async function savePosition(event) {
  event.preventDefault();
  const payload = readForm();
  await api("/api/financial-position", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await refresh();
}

async function saveDecision() {
  if (!state) return;
  await api("/api/decision-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 8),
      data_used: "Posicion financiera local + fuentes gratuitas de mercado",
      data_sources: state.marketData.free_sources,
      recommendation: state.decision.action,
      reasoning: state.decision.opportunity,
      confidence_level: state.decision.confidence,
      suggested_action: state.decision.action,
      suggested_amount_cop: state.decision.suggested_amount_cop,
      suggested_amount_usd: state.decision.suggested_amount_usd,
      liquidity_impact: state.decision.liquidity_after,
      portfolio_impact: state.decision.portfolio,
      risk_level: state.decision.risk_level_1_to_10,
      user_decision: "Pendiente",
      execution_status: "No ejecutado"
    })
  });
  await renderLog();
}

byId("refreshBtn").addEventListener("click", refresh);
byId("positionForm").addEventListener("submit", savePosition);
byId("logBtn").addEventListener("click", saveDecision);

refresh().catch((error) => {
  byId("action").textContent = "Error de conexion";
  byId("analysis").innerHTML = `<div class="analysis-block"><h3>Error</h3><p>${error.message}</p></div>`;
});
