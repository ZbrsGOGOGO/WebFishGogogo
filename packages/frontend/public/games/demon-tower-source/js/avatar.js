/* =========================================================================
 * 九层妖塔 · 捏脸 (avatar.js)  §8.1 八部位自由捏脸（分层 SVG）
 * ========================================================================= */
(function (global) {
  'use strict';

  const PARTS = {
    hat:   ['无', '斗笠', '官帽', '草帽', '头盔'],
    hair:  ['短发', '长发', '光头', '马尾', '卷发'],
    face:  ['圆', '方', '尖', '娃娃'],
    glass: ['无', '圆框', '方框', '墨镜'],
    top:   ['布衣', '战甲', '道袍', '锦衣'],
    pant:  ['麻裤', '皮甲裤', '长袍下摆', '战裤'],
    shoe:  ['草鞋', '布鞋', '战靴', '云履'],
    hand:  ['无', '剑', '刀', '法杖', '扇', '葫芦']
  };

  function svg(av) {
    av = av || {};
    const pick = k => (av[k] || 0);
    let s = '<svg viewBox="0 0 120 200" width="120" height="200" xmlns="http://www.w3.org/2000/svg">';
    // 背景
    s += '<rect width="120" height="200" fill="#efe7d6"/>';
    // 腿/裤
    const pantColor = ['#7a6a55','#5a4a3a','#caa','#3a3a4a'][pick('pant') % 4];
    s += '<rect x="44" y="140" width="14" height="40" fill="'+pantColor+'"/>';
    s += '<rect x="62" y="140" width="14" height="40" fill="'+pantColor+'"/>';
    // 鞋
    const shoeColor = ['#8a6','#555','#333','#777'][pick('shoe') % 4];
    s += '<rect x="40" y="178" width="22" height="10" rx="3" fill="'+shoeColor+'"/>';
    s += '<rect x="60" y="178" width="22" height="10" rx="3" fill="'+shoeColor+'"/>';
    // 上衣
    const topColor = ['#b9a', '#900', '#ddd', '#b00'][pick('top') % 4];
    s += '<rect x="38" y="96" width="44" height="50" rx="6" fill="'+topColor+'"/>';
    // 颈/脸
    const faceShape = pick('face') % 4;
    const faceColor = '#f3c8a0';
    if (faceShape === 0) s += '<ellipse cx="60" cy="74" rx="22" ry="24" fill="'+faceColor+'"/>';
    else if (faceShape === 1) s += '<rect x="38" y="52" width="44" height="48" rx="6" fill="'+faceColor+'"/>';
    else if (faceShape === 2) s += '<polygon points="38,96 60,48 82,96" fill="'+faceColor+'"/>';
    else s += '<ellipse cx="60" cy="74" rx="24" ry="22" fill="'+faceColor+'"/>';
    // 发
    const hairColor = ['#3a2a1a','#2a2a2a','#eee','#5a3a2a','#888'][pick('hair') % 5];
    if (pick('hair') !== 2) s += '<path d="M36 70 Q60 36 84 70 Q60 56 36 70" fill="'+hairColor+'"/>';
    if (pick('hair') === 1) s += '<path d="M36 90 Q30 60 44 52 L44 92 Z" fill="'+hairColor+'"/>';
    if (pick('hair') === 3) s += '<path d="M40 56 L50 100 L56 56 Z" fill="'+hairColor+'"/>';
    // 眼
    s += '<circle cx="52" cy="74" r="2.5" fill="#333"/><circle cx="68" cy="74" r="2.5" fill="#333"/>';
    // 眼镜
    if (pick('glass') === 1) s += '<circle cx="52" cy="74" r="5" fill="none" stroke="#333"/><circle cx="68" cy="74" r="5" fill="none" stroke="#333"/>';
    if (pick('glass') === 2) s += '<rect x="46" y="70" width="12" height="8" fill="none" stroke="#333"/><rect x="62" y="70" width="12" height="8" fill="none" stroke="#333"/>';
    if (pick('glass') === 3) s += '<rect x="44" y="68" width="34" height="12" rx="3" fill="#222"/>';
    // 帽
    const hat = pick('hat');
    if (hat === 1) s += '<path d="M30 56 Q60 30 90 56 Z" fill="#a87"/>';
    if (hat === 2) s += '<rect x="44" y="44" width="32" height="10" fill="#900"/><rect x="38" y="54" width="44" height="6" fill="#700"/>';
    if (hat === 3) s += '<ellipse cx="60" cy="56" rx="34" ry="8" fill="#caa"/><path d="M40 56 Q60 40 80 56 Z" fill="#caa"/>';
    if (hat === 4) s += '<path d="M40 54 L60 38 L80 54 Z" fill="#666"/><rect x="40" y="54" width="40" height="5" fill="#444"/>';
    // 手持
    const hand = pick('hand');
    if (hand === 1) s += '<rect x="84" y="100" width="6" height="44" fill="#ccc"/><rect x="80" y="96" width="14" height="6" fill="#ddd"/>';
    if (hand === 2) s += '<rect x="84" y="100" width="5" height="44" fill="#888"/><path d="M82 96 L91 96 L86 90 Z" fill="#aaa"/>';
    if (hand === 3) s += '<rect x="84" y="104" width="4" height="44" fill="#8a5"/><circle cx="86" cy="100" r="6" fill="#8a5"/>';
    if (hand === 4) s += '<path d="M84 100 L92 100 L88 144 Z" fill="#c33"/>';
    if (hand === 5) s += '<ellipse cx="87" cy="120" rx="8" ry="12" fill="#9a6"/>';
    s += '</svg>';
    return s;
  }

  global.Avatar = { PARTS, svg };
})(window);
