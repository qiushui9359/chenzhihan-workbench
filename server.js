/**
 * 陈至涵工作台 — 零依赖 Node.js 后端服务
 * 真实数据源：黄金价格来自 huilvbiao.com API
 * 抖音/小红书/基金模块：模板数据生成 + 预留真实API接入点
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3456;
const HTML_FILE = path.join(__dirname, 'chenzhihan-workbench.html');

/* ========== 工具函数 ========== */
function fetchPage(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...options.headers
      },
      timeout: 10000
    };
    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function sendJSON(res, data, status = 200) {
  const json = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(json);
}

function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ========== 黄金价格：真实数据源 ========== */
async function fetchGoldData() {
  // 1) 获取实时三品种价格（国内/纽约/伦敦）
  const apiUrl = 'https://www.huilvbiao.com/api/gold_indexApi?t=' + Date.now();
  const apiRes = await fetchPage(apiUrl);
  const apiText = apiRes.body;

  const parseVars = (text) => {
    const result = {};
    const patterns = [
      ['autd', /hq_str_gds_AUTD="([^"]*)"/],
      ['gc', /hq_str_hf_GC="([^"]*)"/],
      ['xau', /hq_str_hf_XAU="([^"]*)"/]
    ];
    patterns.forEach(([key, re]) => {
      const m = text.match(re);
      if (m) result[key] = m[1].split(',');
    });
    return result;
  };

  const vars = parseVars(apiText);

  const domestic = vars.autd ? {
    name: '国内黄金（上海黄金交易所）',
    unit: '元/克',
    price: parseFloat(vars.autd[0]),
    high: parseFloat(vars.autd[4]),
    low: parseFloat(vars.autd[5]),
    open: parseFloat(vars.autd[8]),
    prev: parseFloat(vars.autd[7]),
    time: (vars.autd[12] || '') + ' ' + (vars.autd[6] || '')
  } : null;

  const ny = vars.gc ? {
    name: '纽约期货国际金价',
    unit: '美元/盎司',
    price: parseFloat(vars.gc[0]),
    high: parseFloat(vars.gc[4]),
    low: parseFloat(vars.gc[5]),
    open: parseFloat(vars.gc[8]),
    prev: parseFloat(vars.gc[7]),
    time: (vars.gc[12] || '') + ' ' + (vars.gc[6] || '')
  } : null;

  const london = vars.xau ? {
    name: '伦敦现货黄金',
    unit: '美元/盎司',
    price: parseFloat(vars.xau[0]),
    high: parseFloat(vars.xau[4]),
    low: parseFloat(vars.xau[5]),
    open: parseFloat(vars.xau[8]),
    prev: parseFloat(vars.xau[7]),
    time: (vars.xau[12] || '') + ' ' + (vars.xau[6] || '')
  } : null;

  // 计算涨跌
  const calc = (g) => {
    if (!g) return null;
    g.change = +(g.price - g.prev).toFixed(3);
    g.pct = +(g.change / g.prev * 100).toFixed(2);
    return g;
  };
  [domestic, ny, london].forEach(calc);

  // 2) 获取静态表格数据（品牌金价、银行金条、回收价格）
  let brands = [], banks = [], recycles = [], goldDate = '';
  try {
    const htmlRes = await fetchPage('https://www.huilvbiao.com/gold');
    const html = htmlRes.body;
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    if (rows) {
      rows.forEach(row => {
        const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
        if (!cells) return;
        const clean = cells.map(c => c.replace(/<[^>]*>/g, '').trim());
        // 品牌金价表：品牌 | 黄金价 | 铂金价 | 金条价 | 单位 | 更新日期
        if (clean.length === 6 && clean[0] && clean[0] !== '品牌' && /元\/克/.test(clean[4])) {
          brands.push({ name: clean[0], gold: clean[1], platinum: clean[2], bar: clean[3], date: clean[5] });
          goldDate = clean[5];
        }
        // 银行金条表：名称 | 价格
        else if (clean.length === 2 && clean[0] && /金条/.test(clean[0]) && /^\d+\.?\d*$/.test(clean[1])) {
          banks.push({ name: clean[0], price: parseFloat(clean[1]) });
        }
        // 回收价格表：品种 | 价格 | 单位 | 日期
        else if (clean.length === 4 && clean[0] && /回收/.test(clean[0]) && /^\d+\.?\d*$/.test(clean[1])) {
          recycles.push({ name: clean[0], price: parseFloat(clean[1]), unit: clean[2], date: clean[3] });
        }
      });
    }
  } catch (e) {
    console.log('HTML table parse error:', e.message);
  }

  return {
    domestic, ny, london,
    brands, banks, recycles,
    fetchedAt: new Date().toISOString()
  };
}

/* ========== 抖音模块：模板数据生成 ========== */
const DY_TEMPLATES = {
  '真人出镜实拍': {
    title: [
      '{kw}到底值不值得买？真人实测告诉你',
      '姐妹们！{kw}用了一周，真实反馈来了',
      '涂上{kw}秒变氛围感，真人出镜实测',
      '{kw}新手必看，手残也能轻松上手',
      '{kw}真人测评，优缺点一次性说清',
      '空瓶两瓶才敢来说！{kw}真的有点东西',
      '{kw}开箱实录，质感细节全摊开',
      '真人实测{kw}，看完再决定要不要冲',
      '{kw}回购第N次，真心好用不踩雷',
      '新手第一次用{kw}，真实体验分享',
      '{kw}到底是不是智商税？实测见真章',
      '黄皮油皮干皮亲妈？{kw}真人实测'
    ],
    copy: [
      '{kw}真人实测！用了一周真实反馈，优缺点全摊开，看完再决定不踩雷',
      '空瓶两瓶才敢来说，{kw}真的有点东西，新手也能轻松上手',
      '{kw}回购N次的好物，质感细节都在这，闭眼冲不踩雷',
      '{kw}到底是不是智商税？真人出镜实测，优缺点一次说清'
    ]
  },
  '大字报挂车': {
    title: [
      '{kw}39.9带走！工厂直发手慢无',
      '直播间炸福利！{kw}原价199现在59',
      '{kw}爆款清仓！买一送一最后200单',
      '9.9包邮！{kw}大字报秒杀合集',
      '{kw}大字报挂车！库存告急抢完下架',
      '今天最后一天！{kw}清仓不赚差价',
      '{kw}大字报福利！拍下今天就发',
      '亏本冲量！{kw}大字报秒杀仅限今天',
      '{kw}清仓大字报！最后库存不补',
      '老板疯了！{kw}大字报价格打骨折',
      '{kw}限时大字报！错过恢复原价',
      '{kw}大字报挂车！数量有限先到先得'
    ],
    copy: [
      '{kw}大字报秒杀！工厂直发不赚差价，拍下今天就发，手慢无',
      '原价199今天带走！{kw}限时大字报，错过恢复原价',
      '{kw}清仓买一送一！大字报挂车最后库存，抢完不补',
      '亏本冲量！{kw}大字报价格打骨折，仅限今天手慢无'
    ]
  },
  '桌拍': {
    title: [
      '{kw}桌拍实测！细节质感全解析',
      '平价天花板？{kw}桌拍见真章',
      '{kw}桌拍开箱，配置成分一次看全',
      '油皮干皮必看！{kw}桌拍实测',
      '{kw}桌拍对比！同价位谁更能打',
      '{kw}桌拍真实体验，优缺点全说了',
      '{kw}桌拍测评，性价比到底高不高',
      '{kw}桌拍试用一周，效果记录在这',
      '成分党看过来！{kw}桌拍全拆解',
      '{kw}桌拍实测，到底值不值这个价',
      '{kw}桌拍细节控，每一处都摊开',
      '学生党福音！{kw}桌拍平价好物'
    ],
    copy: [
      '{kw}桌拍实测！细节质感全解析，平价也能打，看完再决定',
      '{kw}桌拍开箱，配置成分一次看全，性价比到底高不高',
      '成分党必看！{kw}桌拍全拆解，优缺点都说了，不踩雷',
      '{kw}桌拍真实体验，用了一周效果记录，平价好物闭眼入'
    ]
  }
};
const DY_TAGS = ['#好物推荐', '#平价好物', '#学生党必备', '#测评', '#回购好物', '#闭眼冲', '#国货之光', '#性价比', '#开箱实测', '#真实测评', '#种草', '#避雷指南'];
const DY_MODS = ['｜实测', '｜干货', '｜合集', '｜对比', '｜新手向', '｜避雷', '｜回购', '｜开箱', '｜Day7', '｜真实体验', '｜干货版', '｜进阶版'];

function genDouyinData(kw, types, timeRange) {
  const arr = [];
  const target = 108;
  const perType = Math.ceil(target / Math.max(1, types.length));
  types.forEach(type => {
    const tpl = DY_TEMPLATES[type];
    if (!tpl) return;
    const T = tpl.title, C = tpl.copy;
    for (let i = 0; i < perType; i++) {
      const k = i % T.length;
      const m = Math.floor(i / T.length);
      let title = T[k].replace(/\{kw\}/g, kw);
      if (m > 0) title += ' ' + DY_MODS[m % DY_MODS.length];
      title += ' ' + DY_TAGS[m % DY_TAGS.length];
      const copy = C[(k + m) % C.length].replace(/\{kw\}/g, kw);
      const plays = Math.floor(rand(120000, 9800000));
      const likes = Math.floor(rand(8000, 880000));
      const cmts = Math.floor(rand(300, 52000));
      const shares = Math.floor(rand(100, 12000));
      arr.push({ title, copy, type, plays, likes, cmts, shares, score: plays + likes * 8 + cmts * 40 + shares * 120 });
    }
  });
  arr.sort((a, b) => b.score - a.score);
  return arr;
}

/* ========== 小红书模块：模板数据生成 ========== */
const XHS_TEMPLATES = {
  '图文笔记': {
    title: [
      '救命！{kw}用了两周真的有点东西',
      '平价天花板！{kw}学生党闭眼入',
      '空瓶记｜{kw}回购N次的好物',
      '{kw}质感绝了，附详细测评',
      '熬夜党必看！{kw}一周回血记录',
      '{kw}真实测评，看完再决定',
      '回购第4瓶！{kw}真心好用',
      '{kw}开箱笔记，细节全摊开',
      '按头安利！{kw}不踩雷清单',
      '{kw}是不是智商税？实测告诉你',
      '{kw}干货合集，新手必看',
      '沉浸式开箱{kw}，质感拉满'
    ],
    copy: [
      '救命！{kw}用了两周真的有点东西，按头安利不踩雷，看完再冲',
      '平价天花板！{kw}学生党闭眼入，空瓶才敢来发笔记',
      '{kw}回购N次的好物，质感细节都在这，闭眼冲',
      '{kw}真实测评，是不是智商税？实测告诉你，优缺点全说'
    ]
  },
  '图片吐槽': {
    title: [
      '千万别买{kw}！除非你想白到发光（附对比图）',
      '吐槽向｜{kw}到底值不值？',
      '别被种草了！{kw}我替你踩过雷',
      '{kw}红黑榜！优缺点一次说清',
      '{kw}是不是智商税？吐槽实测',
      '风很大的{kw}，到底能不能买？',
      '{kw}避雷指南，这些坑别踩',
      '真实吐槽{kw}，看完省下你的钱',
      '{kw}踩雷合集，红黑榜全摊开',
      '买{kw}之前必看！我替你交过学费了'
    ],
    copy: [
      '千万别买{kw}！除非你想白到发光，对比图放这了，用空才敢说真话',
      '吐槽向｜{kw}到底值不值？优缺点全摊开，看完再决定',
      '别被种草了！{kw}智商税替你踩过雷，红黑榜一次说清'
    ]
  },
  '视频笔记': {
    title: [
      '{kw}实测Vlog！一镜到底不剪辑',
      '{kw}开箱视频，质感细节全展示',
      '一分钟带你了解{kw}，干货满满',
      '{kw}上手实测视频，真实记录',
      '{kw}对比测评视频，同价位谁更能打',
      '{kw}使用教程视频，新手三分钟学会',
      '{kw}回购开箱视频，空瓶见证',
      '沉浸式体验{kw}，视频全记录',
      '{kw}避雷吐槽视频，红黑榜都说',
      '{kw}干货测评视频，一分钟看完'
    ],
    copy: [
      '{kw}实测Vlog！一镜到底不剪辑，真实记录全过程，干货满满',
      '{kw}开箱视频，质感细节全展示，一分钟带你了解',
      '{kw}对比测评视频，同价位谁更能打，看完再决定'
    ]
  }
};
const XHS_MODS = ['｜实测', '｜干货', '｜合集', '｜对比', '｜新手向', '｜避雷', '｜回购', '｜开箱', '｜真实', '｜干货版'];

function genXhsData(kw, types) {
  const arr = [];
  const target = 36;
  const perType = Math.ceil(target / Math.max(1, types.length));
  types.forEach(type => {
    const tpl = XHS_TEMPLATES[type];
    if (!tpl) return;
    const T = tpl.title, C = tpl.copy;
    for (let i = 0; i < perType; i++) {
      const k = i % T.length;
      const m = Math.floor(i / T.length);
      let title = T[k].replace(/\{kw\}/g, kw);
      if (m > 0) title += ' ' + XHS_MODS[m % XHS_MODS.length];
      const copy = C[(k + m) % C.length].replace(/\{kw\}/g, kw);
      const views = Math.floor(rand(20000, 820000));
      const likes = Math.floor(rand(3000, 180000));
      const cmts = Math.floor(rand(50, 12000));
      arr.push({ title, copy, type, views, likes, cmts, score: views + likes * 6 + cmts * 30 });
    }
  });
  arr.sort((a, b) => b.score - a.score);
  return arr;
}

/* ========== 基金模块：模板数据生成 ========== */
const FUND_NAMES = ['猫姐投研', '小林理财笔记', '阿牛哥说基', '稳健姐的基金账本', '基民老王', '养基日记', '基金挖掘机', '投基取巧', '韭菜修炼手册', '基市观察猿', '财经小师妹', '老张说基金', '投资理基', '基场老司机', '理财小当家', '基金定投哥', '散户的基会', '基金百晓生', '财基通', '慢牛笔记', '基金情报站', '稳稳的基', '复利小姐', '基民阿强', '定投十年', '基金老炮儿', '理基青年', '财富基线', '基海无涯', '投基有道', '蓝筹守望者', '指数定投君'];
const FUND_STYLES = ['稳健型', '进取型', '均衡型', '指数定投', '波段操作', '价值投资'];
const FUND_SECTORS = ['半导体ETF', '人工智能ETF', '新能源车ETF', '军工ETF', '科创50ETF', '消费ETF', '医药ETF', '白酒ETF', '地产ETF', '创业板ETF', '红利ETF', '黄金ETF', '证券ETF', '银行ETF', '光伏ETF', '芯片ETF'];
const FUND_VIEWS_ADD = ['逢回调加仓，看好主线', '景气度持续，中线持有', '拐点信号出现，分批布局', '估值修复，弹性较大', '订单交付加速，确定性强', '主题热度高，小仓位试水', '国产替代加速，逢低布局', '资金回流，右侧信号明确'];
const FUND_VIEWS_RED = ['集采扰动，先止盈观望', '动销偏弱，等待催化', '政策效果待观察，先撤', '估值偏高，止盈部分', '催化不足，暂避', '板块走弱，控制风险', '拥挤度高，降低敞口'];
const FUND_VIEWS_HOLD = ['待数据转好再动', '等右侧信号', '维持仓位观望', '数据验证期，暂不动'];
const FUND_TIPS = [
  '当前结构性行情为主，建议逢低布局科技成长主线，控制仓位七成以内。',
  '建议分批定投不追高，留两成现金应对波动，进攻聚焦科技主线。',
  '均衡配置为主，科技仓位不超过四成，等右侧信号，定投+止盈纪律执行。',
  '进攻用科技，防御用债基，地产短期不碰，逢大跌加仓科技主线。',
  '主线轮动快，建议均衡配置，不重仓单一板块，控制回撤为主。',
  '指数定投+行业波段结合，宽基打底、行业增强，纪律执行不择时。',
  '价值与成长均衡，低估值板块逢低布局，高拥挤方向逐步止盈。'
];
const FUND_COLORS = ['#ff2442', '#fe9500', '#2563eb', '#16a34a', '#7c3aed', '#0891b2'];

function genFundData() {
  const arr = [];
  const n = FUND_NAMES.length;
  for (let i = 0; i < n; i++) {
    const name = FUND_NAMES[i];
    const style = FUND_STYLES[i % FUND_STYLES.length];
    const fans = rand(8, 58).toFixed(1) + 'w';
    const nop = 2 + Math.floor(Math.random() * 2);
    const secs = [...FUND_SECTORS].sort(() => Math.random() - 0.5).slice(0, nop);
    const ops = secs.map(sec => {
      const r = Math.random();
      let dir, view, amount;
      if (r < 0.55) { dir = '加仓'; view = pick(FUND_VIEWS_ADD); amount = '+' + rand(0.8, 8).toFixed(1) + '万'; }
      else if (r < 0.85) { dir = '减仓'; view = pick(FUND_VIEWS_RED); amount = '-' + rand(0.5, 4).toFixed(1) + '万'; }
      else { dir = '观望'; view = pick(FUND_VIEWS_HOLD); amount = '持平'; }
      return { sector: sec, dir, view, amount };
    });
    arr.push({
      name, meta: '粉丝 ' + fans + ' · ' + style, ops,
      tip: name.slice(0, 2) + '观点：' + FUND_TIPS[i % FUND_TIPS.length],
      color: FUND_COLORS[i % FUND_COLORS.length]
    });
  }
  return arr;
}

/* ========== HTTP 路由 ========== */
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // ===== 静态首页 =====
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const html = fs.readFileSync(HTML_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      sendJSON(res, { error: 'HTML file not found: ' + e.message }, 500);
    }
    return;
  }

  // ===== API: 黄金价格（真实数据） =====
  if (pathname === '/api/gold') {
    try {
      const data = await fetchGoldData();
      sendJSON(res, data);
    } catch (e) {
      sendJSON(res, { error: 'Failed to fetch gold data: ' + e.message }, 500);
    }
    return;
  }

  // ===== API: 抖音爆款视频 =====
  if (pathname === '/api/douyin') {
    const kw = (query.kw || '').trim();
    const types = (query.types || '真人出镜实拍,大字报挂车,桌拍').split(',').filter(Boolean);
    const timeRange = query.time || '近一周';
    if (!kw) { sendJSON(res, { error: '请输入品牌或产品名称' }, 400); return; }
    const data = genDouyinData(kw, types, timeRange);
    sendJSON(res, { kw, types, timeRange, total: data.length, data });
    return;
  }

  // ===== API: 小红书爆款文案 =====
  if (pathname === '/api/xhs') {
    const kw = (query.kw || '').trim();
    const types = (query.types || '图文笔记,图片吐槽,视频笔记').split(',').filter(Boolean);
    if (!kw) { sendJSON(res, { error: '请输入品牌或产品名称' }, 400); return; }
    const data = genXhsData(kw, types);
    sendJSON(res, { kw, types, total: data.length, data });
    return;
  }

  // ===== API: 基金博主 =====
  if (pathname === '/api/fund') {
    const data = genFundData();
    // 板块热度统计
    const heat = {};
    data.forEach(b => b.ops.forEach(o => {
      if (!heat[o.sector]) heat[o.sector] = { add: 0, reduce: 0, hold: 0 };
      if (o.dir === '加仓') heat[o.sector].add++;
      else if (o.dir === '减仓') heat[o.sector].reduce++;
      else heat[o.sector].hold++;
    }));
    const sectorList = Object.entries(heat).map(([k, v]) => {
      const score = v.add * 2 + v.hold * 0.5 - v.reduce;
      return { name: k, score, add: v.add, reduce: v.reduce, hold: v.hold, dir: v.add > v.reduce ? '加仓' : (v.reduce > v.add ? '减仓' : '观望') };
    }).sort((a, b) => b.score - a.score);
    sendJSON(res, { total: data.length, sectors: sectorList, data });
    return;
  }

  // ===== 404 =====
  sendJSON(res, { error: 'Not found: ' + pathname }, 404);
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log('  陈至涵工作台后端服务已启动');
  console.log('  地址: http://localhost:' + PORT);
  console.log('  黄金价格: 真实数据 (huilvbiao.com)');
  console.log('  抖音/小红书/基金: 模板数据生成');
  console.log('========================================');
});
