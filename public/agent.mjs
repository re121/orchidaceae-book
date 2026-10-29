// Consignment agent: Gemini drafts the proposal + structured order, PayPal (sandbox) issues the invoice.
const PP = 'https://api-m.sandbox.paypal.com';
const CATALOG = {
  book: { name: 'ORCHIDACEAE — printed book', retail: 26 },
  ebook: { name: 'ORCHIDACEAE — digital edition', retail: 12 },
  set70: { name: 'ORCHIDACEAE — complete postcard series (70)', retail: 79 },
  postcard: { name: 'ORCHIDACEAE — single postcard', retail: 2 },
};

async function gemini(prompt) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6 } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Gemini: ' + (j.error?.message || r.status));
  return JSON.parse(j.candidates[0].content.parts[0].text);
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
    const { brief, email } = await req.json();
    const prompt = `You are the distribution assistant of Re1 (Renato Taboas Hidalgo), an independent photographer in Basel, Switzerland.
His project ORCHIDACEAE: photographs of 17 tropical orchid species shot under glass at the Basel Botanical Garden; a small hardcover photobook (ISBN 978-3-9075-1032-2), a digital edition and a series of 70 postcards.
Catalogue (retail CHF): book 26, ebook 12, set70 79, postcard 2.
The user describes a shop/venue. Decide: the language of the venue's city, a sensible opening order for consignment/wholesale (small: typically 5-10 books and 20-60 postcards; never ebooks for physical shops), and a wholesale discount (40% for bookshops/museum shops, 35% for florists/garden shops).
Write a short, warm, specific proposal email IN THE VENUE'S LANGUAGE (max 160 words), signed "Renato Taboas Hidalgo (Re1), Basel", mentioning that a PayPal invoice for the opening order is attached and can be paid online.
Return JSON: {"shop_name": str, "city": str, "language": str, "subject": str, "email_body": str, "discount_percent": number, "items": [{"sku": "book"|"ebook"|"set70"|"postcard", "quantity": int}], "reasoning": str (one sentence in English on why this order)}.
Venue: ${brief}`;
    const order = await gemini(prompt);
    const inv = await ppInvoice(order, email || 'sb-o4361i53529575@personal.example.com', order.subject);
    return Response.json({ order, invoice: inv });
  } catch (e) { return Response.json({ error: String(e.message || e) }, { status: 500 }); }
};
