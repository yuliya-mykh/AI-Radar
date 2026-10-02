// Vercel serverless function: посередник між браузером і публічним API freeserp.ai.
// Навіщо: API віддає заголовок Access-Control-Allow-Origin двічі ("*, *"),
// і браузери блокують такі відповіді. Функція пересилає запит на сервері
// та повертає ту саму відповідь з одним коректним CORS-заголовком.
const UPSTREAM = 'https://freeserp.ai/api.php';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');

  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }

  // Пересилаємо лише рядок параметрів; адреса призначення зафіксована — це не відкритий проксі.
  const i = req.url.indexOf('?');
  const query = i === -1 ? '' : req.url.slice(i);
  if (query.length > 2000) {
    res.statusCode = 414;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'query_too_long' }));
  }

  try {
    const upstream = await fetch(UPSTREAM + query, { headers: { Accept: 'application/json' } });
    const body = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Кеш на боці Vercel: менше навантаження на API й швидші повторні запити.
    if (upstream.ok) res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.end(body);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'upstream', detail: 'FreeSerp API недоступний' }));
  }
};
