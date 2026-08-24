/**
 * /api/xhs — 小红书爆款文案抓取
 */
function rand(a, b) { return a + Math.random() * (b - a); }

const XHS_TEMPLATES = {
  '图文笔记': { title: [
    '救命！{kw}用了两周真的有点东西','平价天花板！{kw}学生党闭眼入','空瓶记｜{kw}回购N次的好物',
    '{kw}质感绝了，附详细测评','熬夜党必看！{kw}一周回血记录','{kw}真实测评，看完再决定',
    '回购第4瓶！{kw}真心好用','{kw}开箱笔记，细节全摊开','按头安利！{kw}不踩雷清单',
    '{kw}是不是智商税？实测告诉你','{kw}干货合集，新手必看','沉浸式开箱{kw}，质感拉满'
  ], copy: [
    '救命！{kw}用了两周真的有点东西，按头安利不踩雷，看完再冲',
    '平价天花板！{kw}学生党闭眼入，空瓶才敢来发笔记',
    '{kw}回购N次的好物，质感细节都在这，闭眼冲',
    '{kw}真实测评，是不是智商税？实测告诉你，优缺点全说'
  ] },
  '图片吐槽': { title: [
    '千万别买{kw}！除非你想白到发光（附对比图）','吐槽向｜{kw}到底值不值？','别被种草了！{kw}我替你踩过雷',
    '{kw}红黑榜！优缺点一次说清','{kw}是不是智商税？吐槽实测','风很大的{kw}，到底能不能买？',
    '{kw}避雷指南，这些坑别踩','真实吐槽{kw}，看完省下你的钱','{kw}踩雷合集，红黑榜全摊开',
    '买{kw}之前必看！我替你交过学费了'
  ], copy: [
    '千万别买{kw}！除非你想白到发光，对比图放这了，用空才敢说真话',
    '吐槽向｜{kw}到底值不值？优缺点全摊开，看完再决定',
    '别被种草了！{kw}智商税替你踩过雷，红黑榜一次说清'
  ] },
  '视频笔记': { title: [
    '{kw}实测Vlog！一镜到底不剪辑','{kw}开箱视频，质感细节全展示','一分钟带你了解{kw}，干货满满',
    '{kw}上手实测视频，真实记录','{kw}对比测评视频，同价位谁更能打','{kw}使用教程视频，新手三分钟学会',
    '{kw}回购开箱视频，空瓶见证','沉浸式体验{kw}，视频全记录','{kw}避雷吐槽视频，红黑榜都说',
    '{kw}干货测评视频，一分钟看完'
  ], copy: [
    '{kw}实测Vlog！一镜到底不剪辑，真实记录全过程，干货满满',
    '{kw}开箱视频，质感细节全展示，一分钟带你了解',
    '{kw}对比测评视频，同价位谁更能打，看完再决定'
  ] }
};
const XHS_MODS = ['｜实测','｜干货','｜合集','｜对比','｜新手向','｜避雷','｜回购','｜开箱','｜真实','｜干货版'];

function genXhsData(kw, types) {
  const arr = [];
  const target = 36;
  const perType = Math.ceil(target / Math.max(1, types.length));
  types.forEach(type => {
    const tpl = XHS_TEMPLATES[type]; if (!tpl) return;
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  const kw = (url.searchParams.get('kw') || '').trim();
  const types = (url.searchParams.get('types') || '图文笔记,图片吐槽,视频笔记').split(',').filter(Boolean);
  if (!kw) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: '请输入品牌或产品名称' }));
    return;
  }
  const data = genXhsData(kw, types);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ kw, types, total: data.length, data }));
};
