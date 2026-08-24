/**
 * /api/fund — 每日基金推荐操作
 */
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const FUND_NAMES = ['猫姐投研','小林理财笔记','阿牛哥说基','稳健姐的基金账本','基民老王','养基日记','基金挖掘机','投基取巧','韭菜修炼手册','基市观察猿','财经小师妹','老张说基金','投资理基','基场老司机','理财小当家','基金定投哥','散户的基会','基金百晓生','财基通','慢牛笔记','基金情报站','稳稳的基','复利小姐','基民阿强','定投十年','基金老炮儿','理基青年','财富基线','基海无涯','投基有道','蓝筹守望者','指数定投君'];
const FUND_STYLES = ['稳健型','进取型','均衡型','指数定投','波段操作','价值投资'];
const FUND_SECTORS = ['半导体ETF','人工智能ETF','新能源车ETF','军工ETF','科创50ETF','消费ETF','医药ETF','白酒ETF','地产ETF','创业板ETF','红利ETF','黄金ETF','证券ETF','银行ETF','光伏ETF','芯片ETF'];
const FUND_VIEWS_ADD = ['逢回调加仓，看好主线','景气度持续，中线持有','拐点信号出现，分批布局','估值修复，弹性较大','订单交付加速，确定性强','主题热度高，小仓位试水','国产替代加速，逢低布局','资金回流，右侧信号明确'];
const FUND_VIEWS_RED = ['集采扰动，先止盈观望','动销偏弱，等待催化','政策效果待观察，先撤','估值偏高，止盈部分','催化不足，暂避','板块走弱，控制风险','拥挤度高，降低敞口'];
const FUND_VIEWS_HOLD = ['待数据转好再动','等右侧信号','维持仓位观望','数据验证期，暂不动'];
const FUND_TIPS = ['当前结构性行情为主，建议逢低布局科技成长主线，控制仓位七成以内。','建议分批定投不追高，留两成现金应对波动，进攻聚焦科技主线。','均衡配置为主，科技仓位不超过四成，等右侧信号，定投+止盈纪律执行。','进攻用科技，防御用债基，地产短期不碰，逢大跌加仓科技主线。','主线轮动快，建议均衡配置，不重仓单一板块，控制回撤为主。','指数定投+行业波段结合，宽基打底、行业增强，纪律执行不择时。','价值与成长均衡，低估值板块逢低布局，高拥挤方向逐步止盈。'];

function genFundData() {
  const arr = [];
  for (let i = 0; i < FUND_NAMES.length; i++) {
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
    arr.push({ name, meta: '粉丝 ' + fans + ' · ' + style, ops, tip: name.slice(0, 2) + '观点：' + FUND_TIPS[i % FUND_TIPS.length] });
  }
  return arr;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const data = genFundData();
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
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ total: data.length, sectors: sectorList, data }));
};
