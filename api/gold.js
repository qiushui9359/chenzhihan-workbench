/**
 * /api/gold — 实时黄金价格（真实数据源：huilvbiao.com）
 */
const https = require('https');

function fetchPage(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchGoldData() {
  const apiUrl = 'https://www.huilvbiao.com/api/gold_indexApi?t=' + Date.now();
  const apiRes = await fetchPage(apiUrl);
  const apiText = apiRes.body;
  const vars = {};
  [['autd', /hq_str_gds_AUTD="([^"]*)"/], ['gc', /hq_str_hf_GC="([^"]*)"/], ['xau', /hq_str_hf_XAU="([^"]*)"/]].forEach(([key, re]) => {
    const m = apiText.match(re);
    if (m) vars[key] = m[1].split(',');
  });

  const calc = (g) => { if (!g) return null; g.change = +(g.price - g.prev).toFixed(3); g.pct = +(g.change / g.prev * 100).toFixed(2); return g; };
  const domestic = vars.autd ? { name: '国内黄金（上海黄金交易所）', unit: '元/克', price: parseFloat(vars.autd[0]), high: parseFloat(vars.autd[4]), low: parseFloat(vars.autd[5]), open: parseFloat(vars.autd[8]), prev: parseFloat(vars.autd[7]), time: (vars.autd[12] || '') + ' ' + (vars.autd[6] || '') } : null;
  const ny = vars.gc ? { name: '纽约期货国际金价', unit: '美元/盎司', price: parseFloat(vars.gc[0]), high: parseFloat(vars.gc[4]), low: parseFloat(vars.gc[5]), open: parseFloat(vars.gc[8]), prev: parseFloat(vars.gc[7]), time: (vars.gc[12] || '') + ' ' + (vars.gc[6] || '') } : null;
  const london = vars.xau ? { name: '伦敦现货黄金', unit: '美元/盎司', price: parseFloat(vars.xau[0]), high: parseFloat(vars.xau[4]), low: parseFloat(vars.xau[5]), open: parseFloat(vars.xau[8]), prev: parseFloat(vars.xau[7]), time: (vars.xau[12] || '') + ' ' + (vars.xau[6] || '') } : null;
  [domestic, ny, london].forEach(calc);

  let brands = [], banks = [], recycles = [];
  try {
    const htmlRes = await fetchPage('https://www.huilvbiao.com/gold');
    const html = htmlRes.body;
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    if (rows) {
      rows.forEach(row => {
        const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
        if (!cells) return;
        const clean = cells.map(c => c.replace(/<[^>]*>/g, '').trim());
        if (clean.length === 6 && clean[0] && clean[0] !== '品牌' && /元\/克/.test(clean[4])) {
          brands.push({ name: clean[0], gold: clean[1], platinum: clean[2], bar: clean[3], date: clean[5] });
        } else if (clean.length === 2 && clean[0] && /金条/.test(clean[0]) && /^\d+\.?\d*$/.test(clean[1])) {
          banks.push({ name: clean[0], price: parseFloat(clean[1]) });
        } else if (clean.length === 4 && clean[0] && /回收/.test(clean[0]) && /^\d+\.?\d*$/.test(clean[1])) {
          recycles.push({ name: clean[0], price: parseFloat(clean[1]), unit: clean[2], date: clean[3] });
        }
      });
    }
  } catch (e) {}

  return { domestic, ny, london, brands, banks, recycles, fetchedAt: new Date().toISOString() };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  try {
    const data = await fetchGoldData();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: e.message }));
  }
};
