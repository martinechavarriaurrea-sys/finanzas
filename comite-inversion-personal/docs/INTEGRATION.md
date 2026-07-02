# Integracion con app de control de dinero

## Flujo recomendado

1. Tu app calcula caja, gastos, deuda, fondo de emergencia y cartera.
2. Tu app envia esos datos a `POST /api/financial-position`.
3. El Comite consulta mercado gratuito y calcula la decision.
4. Tu app consume `GET /api/analysis`.
5. Si el usuario decide actuar, tu app registra la decision con `POST /api/decision-log`.

## Contrato minimo desde tu app

Tu app debe enviar al menos:

```json
{
  "cash_cop": 0,
  "cash_usd": 0,
  "emergency_fund_current": 0,
  "emergency_fund_target": 0,
  "monthly_income": 0,
  "monthly_expenses_fixed": 0,
  "monthly_expenses_variable": 0,
  "monthly_expenses_pending": 0,
  "debt_balance": 0,
  "debt_interest_rate": 0,
  "projected_monthly_savings": 0,
  "actual_monthly_savings": 0,
  "minimum_liquidity_required": 0,
  "monthly_investment_goal": 0,
  "portfolio": []
}
```

## Regla de seguridad

Esta app no ejecuta operaciones de compra o venta. Solo analiza, recomienda, alerta y registra decisiones.

Toda compra debe requerir confirmacion manual del usuario.
