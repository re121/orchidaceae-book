# ORCHIDACEAE — a PayPal-powered shop and AI distribution agent for an independent photographer

Re1 (Renato Taboas Hidalgo) photographs tropical orchids under glass in Basel. This project sells his book, digital edition and postcards with PayPal Checkout, and adds an **AI distribution agent**: describe any shop in the world and the agent writes a consignment proposal in that shop's language, chooses an opening order and wholesale terms, and issues a **PayPal invoice** for it.

- `public/index.html` — storefront, PayPal JS SDK (Smart Buttons, CHF, itemised orders)
- `public/agent.html` — agent UI
- `netlify/functions/agent.mjs` — Gemini (structured JSON) + PayPal Invoicing API v2 (sandbox)

## Run
Deploy on Netlify with environment variables `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `GEMINI_API_KEY` (optional `GEMINI_MODEL`). All payments run in the PayPal sandbox.

## License
MIT
