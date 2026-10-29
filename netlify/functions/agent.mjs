// Consignment agent: Gemini drafts the proposal + structured order, PayPal (sandbox) issues the invoice.
const PP = 'https://api-m.sandbox.paypal.com';
const CATALOG = {
  book: { name: 'ORCHIDACEAE — printed book', retail: 26 },
  ebook: { name: 'ORCHIDACEAE — digital edition', retail: 12 },
  set70: { name: 'ORCHIDACEAE — complete postcard series (70)', retail: 79 },
  postcard: { name: 'ORCHIDACEAE — single postcard', retail: 2 },
};

async function gemini(prompt) {
  const models = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', ...(process.env.GEMINI_FALLBACK || 'gemini-flash-lite-latest,gemini-3.8-flash-lite,gemini-flash-latest').split(',').map(x => x.trim()).filter(Boolean)];
  const errs = [];
  for (const model of [...new Set(models)]) {
    try { const o = await geminiOnce(model, prompt); o._model = model; return o; }
    catch (e) { errs.push(model + ': ' + String(e.message || e).slice(0, 120)); }
  }
  const err = new Error(errs.join(' | ')); err.allFailed = true; throw err;
}
// Demo answer used only if every model is out of quota, clearly labelled in the UI.
function demoOrder(brief) {
  return { demo: true, shop_name: 'Photobook shop (demo)', city: 'Berlin', language: 'German', discount_percent: 40,
    subject: 'ORCHIDACEAE – Fotobuch und Postkarten in Kommission',
    email_body: 'Liebes Team,\n\nich bin Renato Taboas Hidalgo (Re1), Fotograf in Basel. ORCHIDACEAE zeigt 17 tropische Orchideenarten, fotografiert unter Glas im Botanischen Garten Basel – als kleines Hardcover-Fotobuch und als Serie von 70 Postkarten.\n\nIch würde Ihnen gerne eine kleine Erstbestellung in Kommission anbieten: 5 Bücher und 40 Postkarten, mit 40 % Händlerrabatt. Die PayPal-Rechnung liegt bei und kann online bezahlt werden.\n\nHerzliche Grüsse\nRenato Taboas Hidalgo (Re1), Basel',
    items: [{ sku: 'book', quantity: 5 }, { sku: 'postcard', quantity: 40 }],
    reasoning: 'Demo answer shown because the free AI quota is exhausted for today (brief: ' + String(brief).slice(0, 60) + ').' };
}
async function geminiOnce(model, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6 } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Gemini: ' + (j.error?.message || r.status));
  const parts = j.candidates?.[0]?.content?.parts || [];
  const txt = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
  if (!txt) throw new Error('Gemini returned no text: ' + JSON.stringify(j).slice(0, 300));
  let o = JSON.parse(txt.replace(/^```(json)?|```$/g, ''));
  if (Array.isArray(o)) o = o[0];
  if (o && !o.items) o = o.order || o.proposal || Object.values(o).find(v => v && v.items) || o;
  if (!o || !Array.isArray(o.items)) throw new Error('Unexpected AI answer: ' + txt.slice(0, 300));
  return o;
}

async function ppToken() {
  const r = await fetch(PP + '/v1/oauth2/token', { method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  const j = await r.json(); if (!r.ok) throw new Error('PayPal auth: ' + (j.error_description || r.status));
  return j.access_token;
}

async function ppInvoice(order, email, note) {
  const t = await ppToken(); const h = { Authorization: 'Bearer ' + t, 'content-type': 'application/json' };
  const disc = order.discount_percent;
  const body = {
    detail: { currency_code: 'CHF', note, terms_and_conditions: 'Consignment / wholesale order. Payment due on receipt.', payment_term: { term_type: 'NET_30' } },
    invoicer: { name: { given_name: 'Renato', surname: 'Taboas Hidalgo' }, website: 'https://orchidaceae-showcase.lovable.app' },
    primary_recipients: [{ billing_info: { email_address: email, business_name: order.shop_name } }],
    items: order.items.filter(i => CATALOG[i.sku] && i.quantity > 0).map(i => ({
      name: CATALOG[i.sku].name, quantity: String(i.quantity),
      unit_amount: { currency_code: 'CHF', value: (CATALOG[i.sku].retail * (1 - disc / 100)).toFixed(2) }, unit_of_measure: 'QUANTITY' })),
  };
  let r = await fetch(PP + '/v2/invoicing/invoices', { method: 'POST', headers: h, body: JSON.stringify(body) });
  let j = await r.json(); if (!r.ok) throw new Error('PayPal invoice: ' + JSON.stringify(j.details || j.message));
  const id = j.href ? j.href.split('/').pop() : j.id;
  r = await fetch(`${PP}/v2/invoicing/invoices/${id}/send`, { method: 'POST', headers: h, body: JSON.stringify({ send_to_recipient: false }) });
  j = await r.json().catch(() => ({}));
  const pay = (j.links || []).find(l => l.rel === 'payer-view')?.href || j.href || `https://www.sandbox.paypal.com/invoice/p/#${id}`;
  return { id, pay_url: pay };
}

export default async (req) => {
  try {
    const body = await req.json();
    if (body.order) {
      const inv = await ppInvoice(body.order, body.email || 'sb-o4361i53529575@personal.example.com', body.order.subject);
      return Response.json({ invoice: inv });
    }
    const { brief } = body;
    const prompt = `You are the distribution assistant of Re1 (Renato Taboas Hidalgo), an independent photographer in Basel, Switzerland.
His project ORCHIDACEAE: photographs of 17 tropical orchid species shot under glass at the Basel Botanical Garden; a small hardcover photobook (ISBN 978-3-9075-1032-2), a digital edition and a series of 70 postcards.
Catalogue (retail CHF): book 26, ebook 12, set70 79, postcard 2.
The user describes a shop/venue. Decide: the language of the venue's city, a sensible opening order for consignment/wholesale (small: typically 5-10 books and 20-60 postcards; never ebooks for physical shops), and a wholesale discount (40% for bookshops/museum shops, 35% for florists/garden shops).
Write a short, warm, specific proposal email IN THE VENUE'S LANGUAGE (max 160 words), signed "Renato Taboas Hidalgo (Re1), Basel", mentioning that a PayPal invoice for the opening order is attached and can be paid online.
Return JSON: {"shop_name": str, "city": str, "language": str, "subject": str, "email_body": str, "discount_percent": number, "items": [{"sku": "book"|"ebook"|"set70"|"postcard", "quantity": int}], "reasoning": str (one sentence in English on why this order)}.
Venue: ${brief}`;
    let order;
    try { order = await gemini(prompt); }
    catch (e) { if (e.allFailed && /quota|exceeded|429|demand|overload/i.test(e.message)) order = demoOrder(brief); else throw e; }
    return Response.json({ order });
  } catch (e) { return Response.json({ error: String(e.message || e) }, { status: 500 }); }
};
