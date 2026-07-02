# Comite de Inversion Personal

App local para operar un Comite de Inversion Personal/CIO con foco en liquidez, control de riesgo y decisiones disciplinadas de largo plazo.

La app expone una API HTTP para conectarla con una app de control de dinero y una interfaz web para revisar mercado, cartera, liquidez, alertas y decision recomendada.

## Principios

- Primero liquidez.
- Luego deuda cara.
- Luego fondo de emergencia.
- Luego inversion.
- VOO es el nucleo de renta variable internacional.
- Nunca ejecuta compras automaticamente.
- Si no hay datos suficientes, no recomienda compra.

## Fuentes gratuitas

La primera version evita APIs pagas:

- Yahoo Finance chart API no oficial para precios de ETFs, indices, VIX, DXY, USD/COP, oro y WTI.
- FRED CSV publico para tasas y macro de Estados Unidos.
- Datos Abiertos Colombia para TRM cuando el recurso esta disponible.
- Datos financieros personales guardados localmente en `data/financial-position.json`.

## Ejecutar localmente

Requisitos:

- Node.js 18 o superior.

Comandos:

```bash
npm start
```

Abrir:

```text
http://localhost:4173
```

## API

Base local:

```text
http://localhost:4173/api
```

Endpoints principales:

- `GET /api/financial-position`
- `POST /api/financial-position`
- `GET /api/portfolio`
- `GET /api/market-data`
- `GET /api/analysis`
- `GET /api/decision-log`
- `POST /api/decision-log`

Ver el contrato completo en [docs/API.md](docs/API.md).

## Privacidad

Los archivos reales dentro de `data/*.json` no se suben a GitHub. Solo se versiona un ejemplo sin datos personales.

## Integracion recomendada con tu app de dinero

Tu app puede actualizar la posicion financiera mediante:

```http
POST /api/financial-position
Content-Type: application/json
```

Luego puede pedir la decision consolidada:

```http
GET /api/analysis
```

La respuesta incluye posicion financiera, mercado, cartera enriquecida y decision CIO.
