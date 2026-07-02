# API

## `GET /api/financial-position`

Devuelve la posicion financiera local.

Campos principales:

- `cash_cop`
- `cash_usd`
- `emergency_fund_current`
- `emergency_fund_target`
- `monthly_income`
- `monthly_expenses_fixed`
- `monthly_expenses_variable`
- `monthly_expenses_pending`
- `debt_balance`
- `debt_interest_rate`
- `upcoming_payments`
- `projected_monthly_savings`
- `actual_monthly_savings`
- `minimum_liquidity_required`
- `monthly_investment_goal`
- `portfolio`

## `POST /api/financial-position`

Reemplaza la posicion financiera local.

Ejemplo:

```json
{
  "cash_cop": 5000000,
  "cash_usd": 100,
  "emergency_fund_current": 3000000,
  "emergency_fund_target": 6000000,
  "monthly_income": 4000000,
  "monthly_expenses_fixed": 1800000,
  "monthly_expenses_variable": 800000,
  "monthly_expenses_pending": 0,
  "debt_balance": 0,
  "debt_interest_rate": 0,
  "upcoming_payments": 0,
  "projected_monthly_savings": 1000000,
  "actual_monthly_savings": 1000000,
  "minimum_liquidity_required": 2500000,
  "monthly_investment_goal": 500000,
  "portfolio": [
    {
      "ticker": "VOO",
      "quantity": 1,
      "average_price_usd": 500,
      "target_weight": 70,
      "total_contributions_usd": 500
    }
  ]
}
```

## `GET /api/portfolio`

Devuelve la cartera enriquecida con precios actuales cuando las fuentes gratuitas responden.

Campos calculados por activo:

- `current_price_usd`
- `market_value_usd`
- `market_value_cop`
- `unrealized_gain_usd`
- `unrealized_gain_cop`
- `unrealized_gain_percentage`
- `current_weight`
- `deviation_from_target`

## `GET /api/market-data`

Devuelve datos gratuitos de mercado:

- VOO
- VTI
- VXUS
- QQQM
- SCHD
- BND
- S&P 500
- Nasdaq 100
- Russell 2000
- Dow Jones
- VIX
- DXY
- USD/COP
- Oro
- WTI
- Tasas y macro FRED
- TRM Colombia cuando esta disponible

Campos por activo:

- `current_price`
- `daily_change_percentage`
- `weekly_change_percentage`
- `monthly_change_percentage`
- `drawdown_from_ath`
- `moving_average_20`
- `moving_average_50`
- `moving_average_100`
- `moving_average_200`
- `RSI`
- `MACD`
- `ATR`
- `bollinger`
- `volume`
- `data_timestamp`
- `data_source`

## `GET /api/analysis`

Devuelve el analisis consolidado:

- `position`
- `marketData`
- `portfolio`
- `decision`

La decision incluye:

- `action`
- `opportunity`
- `confidence`
- `hardStops`
- `suggested_amount_cop`
- `suggested_amount_usd`
- `investable_surplus`
- `liquidity_after`
- `risk_level_1_to_10`
- `scenarios`
- `risks`
- `opportunities`

Acciones posibles:

- `Compra normal DCA`
- `Compra acelerada parcial`
- `Compra acelerada fuerte`
- `Mantener liquidez`
- `No hacer nada`
- `Reducir exposicion`

## `GET /api/decision-log`

Devuelve la bitacora local.

## `POST /api/decision-log`

Guarda una decision en la bitacora.

Ejemplo:

```json
{
  "recommendation": "Mantener liquidez",
  "reasoning": "Fondo de emergencia incompleto",
  "confidence_level": "Alta",
  "suggested_amount_cop": 0,
  "suggested_amount_usd": 0,
  "risk_level": 7,
  "user_decision": "Pendiente",
  "execution_status": "No ejecutado"
}
```
