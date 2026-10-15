// Owner-provided jiuceng(2).zip, 2026-09-23. MIT (RuoYi). Data only; no SQL or executable attachment instructions.
export const TOWER_WORKSHOP_SOURCE = {
  "SLOTS": [
    {
      "key": "head",
      "name": "头部"
    },
    {
      "key": "chest",
      "name": "胸甲"
    },
    {
      "key": "wrist",
      "name": "护腕"
    },
    {
      "key": "pants",
      "name": "裤子"
    },
    {
      "key": "shoes",
      "name": "鞋子"
    },
    {
      "key": "necklace",
      "name": "项链"
    },
    {
      "key": "weapon",
      "name": "武器"
    }
  ],
  "QUAL": {
    "白": {
      "name": "白",
      "affixes": 1,
      "req": 1,
      "color": "#d8d8d8",
      "mul": 1
    },
    "绿": {
      "name": "绿",
      "affixes": 2,
      "req": 10,
      "color": "#7bd97b",
      "mul": 1.4
    },
    "蓝": {
      "name": "蓝",
      "affixes": 3,
      "req": 25,
      "color": "#5fa8d9",
      "mul": 2
    },
    "紫": {
      "name": "紫",
      "affixes": 4,
      "req": 45,
      "color": "#c98cd9",
      "mul": 2.8
    },
    "橙": {
      "name": "橙",
      "affixes": 5,
      "req": 65,
      "color": "#e8a23a",
      "mul": 3.8
    },
    "红": {
      "name": "红",
      "affixes": 4,
      "req": 90,
      "color": "#e0533f",
      "mul": 5
    }
  },
  "MATS": {
    "ht": {
      "name": "黑铁精",
      "tier": 1,
      "color": "#b9b9b9"
    },
    "qw": {
      "name": "青纹钢",
      "tier": 1,
      "color": "#cfcfcf"
    },
    "lm": {
      "name": "灵麻布",
      "tier": 1,
      "color": "#cdbfa0"
    },
    "sh": {
      "name": "兽魂皮",
      "tier": 1,
      "color": "#a98c6b"
    },
    "py": {
      "name": "普通灵玉",
      "tier": 1,
      "color": "#bcd9c0"
    },
    "ct": {
      "name": "赤铜精金",
      "tier": 2,
      "color": "#7bd97b"
    },
    "bl": {
      "name": "百炼陨铁",
      "tier": 2,
      "color": "#6f9e6f"
    },
    "yw": {
      "name": "云纹兽革",
      "tier": 2,
      "color": "#7bae6b"
    },
    "yl": {
      "name": "云麟皮甲料",
      "tier": 2,
      "color": "#5f9e8f"
    },
    "yh": {
      "name": "月华玉髓",
      "tier": 2,
      "color": "#5fa8d9"
    },
    "sl": {
      "name": "碎星灵玉",
      "tier": 2,
      "color": "#6fb0c0"
    },
    "wj": {
      "name": "万劫灵玉",
      "tier": 2,
      "color": "#a23ad9"
    },
    "xlg": {
      "name": "仙泪绿金",
      "tier": 4,
      "color": "#3ad99e"
    },
    "yhs": {
      "name": "羽化神金",
      "tier": 4,
      "color": "#9e3ad9"
    },
    "kong": {
      "name": "虚空神晶",
      "tier": 4,
      "color": "#3a6fd9"
    },
    "zs": {
      "name": "至尊兽皮",
      "tier": 4,
      "color": "#b06b3a"
    },
    "lh": {
      "name": "龙纹黑金",
      "tier": 5,
      "color": "#e8a23a"
    },
    "hx": {
      "name": "凰血赤金",
      "tier": 5,
      "color": "#e8533a"
    },
    "dj": {
      "name": "道劫黄金",
      "tier": 5,
      "color": "#d9b53a"
    },
    "hy": {
      "name": "永恒蓝金",
      "tier": 5,
      "color": "#3a8fd9"
    },
    "cuijl": {
      "name": "淬炼精粹",
      "tier": 0,
      "color": "#9fd9d9"
    },
    "ningz": {
      "name": "凝紫精粹",
      "tier": 0,
      "color": "#c98cd9"
    },
    "daoyg": {
      "name": "道源凝果",
      "tier": 0,
      "color": "#7bd97b"
    },
    "mt": {
      "name": "木炭",
      "tier": 0,
      "color": "#5a5a5a"
    }
  },
  "JINCHI": {
    "name": "烬赤源核·帝血残源",
    "color": "#e83a3a"
  },
  "SLOT_CAT": {
    "head": "metal",
    "wrist": "metal",
    "weapon": "metal",
    "chest": "leather",
    "pants": "leather",
    "shoes": "leather",
    "necklace": "jade"
  },
  "RECIPE": {
    "metal": {
      "白": {
        "ht": 2
      },
      "绿": {
        "qw": 2
      },
      "蓝": {
        "ct": 2
      },
      "紫": {
        "bl": 2
      },
      "橙": {
        "bl": 2
      }
    },
    "leather": {
      "白": {
        "lm": 2
      },
      "绿": {
        "sh": 2
      },
      "蓝": {
        "yw": 2
      },
      "紫": {
        "yl": 2
      },
      "橙": {
        "yl": 2
      }
    },
    "jade": {
      "白": {
        "py": 2
      },
      "绿": {
        "yh": 2
      },
      "蓝": {
        "sl": 2
      },
      "紫": {
        "wj": 2
      },
      "橙": {
        "wj": 2
      }
    }
  },
  "MAT_GRADE": {
    "原矿": {
      "name": "原矿",
      "countMul": 1.5,
      "succ": 0,
      "cap": 0,
      "qy": 0
    },
    "粗炼": {
      "name": "粗炼",
      "countMul": 1.15,
      "succ": 8,
      "cap": 0,
      "qy": 3
    },
    "精炼": {
      "name": "精炼",
      "countMul": 0.85,
      "succ": 16,
      "cap": 1,
      "qy": 8
    },
    "纯净": {
      "name": "纯净",
      "countMul": 0.55,
      "succ": 26,
      "cap": 1,
      "qy": 18
    }
  },
  "GRADE_ORDER": [
    "原矿",
    "粗炼",
    "精炼",
    "纯净"
  ],
  "REFINE": {
    "ores": [
      "ht",
      "qw",
      "lm",
      "sh",
      "py",
      "ct",
      "bl",
      "yw",
      "yl",
      "yh",
      "sl",
      "wj"
    ],
    "tiers": [
      {
        "grade": "粗炼",
        "fromGrade": "原矿",
        "need": 3,
        "reagent": "mt",
        "reagentName": "木炭",
        "rneed": 6,
        "yield": 3
      },
      {
        "grade": "精炼",
        "fromGrade": "粗炼",
        "need": 3,
        "reagent": "mt",
        "reagentName": "木炭",
        "rneed": 9,
        "yield": 3
      },
      {
        "grade": "纯净",
        "fromGrade": "精炼",
        "need": 3,
        "reagent": "mt",
        "reagentName": "木炭",
        "rneed": 12,
        "yield": 3
      }
    ]
  },
  "FORGE_BASE_CAP": {
    "白": 0,
    "绿": 1,
    "蓝": 2,
    "紫": 3,
    "橙": 4
  },
  "FORGE_BASE_SUCC": {
    "白": 100,
    "绿": 70,
    "蓝": 50,
    "紫": 35,
    "橙": 10
  },
  "FORGE_AUX": {
    "cuijl": {
      "name": "淬炼精粹",
      "succ": 3,
      "cap": 0,
      "q": [
        "绿",
        "蓝"
      ]
    },
    "ningz": {
      "name": "凝紫精粹",
      "succ": 2,
      "cap": 0,
      "q": [
        "紫"
      ]
    },
    "daoyg": {
      "name": "道源凝果",
      "succ": 5,
      "cap": 1,
      "q": [
        "蓝",
        "紫",
        "橙",
        "红"
      ],
      "ex": true
    },
    "yhs": {
      "name": "羽化神金",
      "succ": 4,
      "cap": 1,
      "q": [
        "橙",
        "红"
      ]
    },
    "xlg": {
      "name": "仙泪绿金",
      "succ": 2,
      "cap": 1,
      "q": [
        "橙",
        "红"
      ]
    },
    "zs": {
      "name": "至尊兽皮",
      "succ": 2,
      "cap": 1,
      "q": [
        "橙"
      ]
    }
  },
  "QUAL_ORDER": [
    "白",
    "绿",
    "蓝",
    "紫",
    "橙"
  ],
  "FORGE_MAT_LABEL": {
    "白": "凡铁·白材",
    "绿": "凡铁·绿材",
    "蓝": "灵金·蓝材",
    "紫": "灵金·紫材",
    "橙": "灵金·橙材"
  },
  "SECT_ELEMENTS": {
    "metal": {
      "name": "金",
      "attr": "金属性",
      "icon": "⚔",
      "color": "#e8c34a",
      "desc": "锐金肃杀，擅长攻击类功法，出师攻伐凌厉。",
      "bonus": {
        "atkPct": 0.15
      },
      "daily": {
        "type": "stone",
        "n": 60,
        "label": "帮派贡献·办公币"
      },
      "talent": "霸皇开山劲",
      "gongfa": "gf_bahuang"
    },
    "wood": {
      "name": "木",
      "attr": "木属性",
      "icon": "🌿",
      "color": "#5fae6b",
      "desc": "青木长生，擅长种植灵草与治疗类功法，疗伤续命无双。",
      "bonus": {
        "healPct": 0.2
      },
      "daily": {
        "type": "spirit",
        "n": 90,
        "label": "灵草变现·灵石"
      },
      "talent": "清心御道录",
      "gongfa": "gf_qingxin"
    },
    "water": {
      "name": "水",
      "attr": "水属性",
      "icon": "💧",
      "color": "#5fa8d9",
      "desc": "流波无定，擅长速度兼治疗类功法，身法飘逸、回春有术。",
      "bonus": {
        "spdPct": 0.15,
        "healPct": 0.12
      },
      "daily": {
        "type": "spirit",
        "n": 70,
        "label": "灵液·灵石"
      },
      "talent": "疾风追猎录",
      "gongfa": "gf_jifeng"
    },
    "fire": {
      "name": "火",
      "attr": "火属性",
      "icon": "🔥",
      "color": "#e8533a",
      "desc": "焚天控火，擅长炼丹，丹成则事半功倍、资质飞涨。",
      "bonus": {
        "pillMul": 1
      },
      "daily": {
        "type": "pill",
        "n": 2,
        "label": "炼丹·资质丹"
      },
      "talent": "焚天离火章",
      "gongfa": "gf_fentian"
    },
    "earth": {
      "name": "土",
      "attr": "土属性",
      "icon": "⛰",
      "color": "#b06b3a",
      "desc": "厚土载物，擅长挖矿，神材产量更丰。",
      "bonus": {
        "mineMul": 0.5
      },
      "daily": {
        "type": "mat",
        "n": 3,
        "label": "矿脉·神材"
      },
      "talent": "玄龟守道经",
      "gongfa": "gf_xuangui"
    }
  },
  "DISMANTLE": {
    "白": {
      "ht": 1,
      "lm": 1
    },
    "绿": {
      "qw": 1,
      "sh": 1
    },
    "蓝": {
      "ct": 1,
      "yw": 1
    },
    "紫": {
      "bl": 1,
      "yl": 1
    },
    "橙": {
      "bl": 1,
      "yl": 1
    }
  },
  "RECAST_COST": {
    "ht": 1,
    "lm": 1
  },
  "AFFIX_LIB": {
    "common": [
      {
        "id": "duangu",
        "name": "锻骨",
        "tier": "common",
        "stat": "dimPct",
        "key": "str",
        "val": 0.04,
        "desc": "力量 +4%"
      },
      {
        "id": "jiying",
        "name": "疾影",
        "tier": "common",
        "stat": "dimPct",
        "key": "agi",
        "val": 0.04,
        "desc": "敏捷 +4%"
      },
      {
        "id": "guyuan",
        "name": "固元",
        "tier": "common",
        "stat": "dimPct",
        "key": "def",
        "val": 0.04,
        "desc": "体质 +4%"
      },
      {
        "id": "yunling",
        "name": "蕴灵",
        "tier": "common",
        "stat": "dimPct",
        "key": "luc",
        "val": 0.04,
        "desc": "灵力 +4%"
      },
      {
        "id": "tafeng",
        "name": "踏风",
        "tier": "common",
        "stat": "dimPct",
        "key": "spd",
        "val": 0.04,
        "desc": "速度 +4%"
      },
      {
        "id": "cuifeng",
        "name": "淬锋",
        "tier": "common",
        "stat": "atkPct",
        "val": 0.03,
        "desc": "普攻伤害 +3%"
      },
      {
        "id": "yujia",
        "name": "御甲",
        "tier": "common",
        "stat": "redu",
        "val": 0.03,
        "desc": "受到物理伤害 -3%"
      },
      {
        "id": "shoushen",
        "name": "守神",
        "tier": "common",
        "stat": "reduMagic",
        "val": 0.03,
        "desc": "受到法术道则伤害 -3%"
      }
    ],
    "rare": [
      {
        "id": "cuixue",
        "name": "淬血",
        "tier": "rare",
        "stat": "lifesteal",
        "val": 0.02,
        "desc": "攻击命中，吸取 2% 伤害值作为生命"
      },
      {
        "id": "qingshen",
        "name": "轻身",
        "tier": "rare",
        "stat": "dodge",
        "val": 0.04,
        "desc": "闪避概率 +4%"
      },
      {
        "id": "pojia",
        "name": "破甲",
        "tier": "rare",
        "stat": "ignoreDefHit",
        "val": 0.05,
        "desc": "攻击命中，降低敌方 5% 防御"
      },
      {
        "id": "xuangu",
        "name": "玄骨",
        "tier": "rare",
        "stat": "reflect",
        "val": 0.05,
        "desc": "被攻击，反弹 5% 伤害"
      },
      {
        "id": "fengxing",
        "name": "风行",
        "tier": "rare",
        "stat": "atkStack",
        "val": 0.03,
        "max": 3,
        "desc": "每回合攻击 +3%，最多叠 3 层，回合结束重置"
      },
      {
        "id": "yuling",
        "name": "御灵",
        "tier": "rare",
        "stat": "survive1",
        "desc": "首次致命伤害保留 1 点生命，一局 1 次"
      }
    ],
    "ultimate": [
      {
        "id": "tunyuan",
        "name": "吞元",
        "tier": "ultimate",
        "stat": "lifesteal",
        "val": 0.04,
        "killHeal": 0.1,
        "desc": "攻击吸取 4% 伤害生命值；击杀额外回 10% 生命"
      },
      {
        "id": "zhenyue",
        "name": "镇岳",
        "tier": "ultimate",
        "stat": "defPct",
        "val": 0.08,
        "enemyAtkDown": 0.04,
        "desc": "防御提升 8%；敌人攻击你时，敌方攻击降 4%"
      },
      {
        "id": "xukongdun",
        "name": "虚空遁",
        "tier": "ultimate",
        "stat": "dodge",
        "val": 0.1,
        "dodgeFollowup": 0.15,
        "desc": "闪避 +10%；闪避成功，下一击伤害 +15%"
      }
    ]
  },
  "AFFIX_CAP": 3,
  "QUAL_AFFIX_COUNT": {
    "白": 1,
    "绿": 2,
    "蓝": 2,
    "紫": 3,
    "橙": 3,
    "红": 4
  },
  "AFFIX_BY_ID": {
    "duangu": {
      "id": "duangu",
      "name": "锻骨",
      "tier": "common",
      "stat": "dimPct",
      "key": "str",
      "val": 0.04,
      "desc": "力量 +4%"
    },
    "jiying": {
      "id": "jiying",
      "name": "疾影",
      "tier": "common",
      "stat": "dimPct",
      "key": "agi",
      "val": 0.04,
      "desc": "敏捷 +4%"
    },
    "guyuan": {
      "id": "guyuan",
      "name": "固元",
      "tier": "common",
      "stat": "dimPct",
      "key": "def",
      "val": 0.04,
      "desc": "体质 +4%"
    },
    "yunling": {
      "id": "yunling",
      "name": "蕴灵",
      "tier": "common",
      "stat": "dimPct",
      "key": "luc",
      "val": 0.04,
      "desc": "灵力 +4%"
    },
    "tafeng": {
      "id": "tafeng",
      "name": "踏风",
      "tier": "common",
      "stat": "dimPct",
      "key": "spd",
      "val": 0.04,
      "desc": "速度 +4%"
    },
    "cuifeng": {
      "id": "cuifeng",
      "name": "淬锋",
      "tier": "common",
      "stat": "atkPct",
      "val": 0.03,
      "desc": "普攻伤害 +3%"
    },
    "yujia": {
      "id": "yujia",
      "name": "御甲",
      "tier": "common",
      "stat": "redu",
      "val": 0.03,
      "desc": "受到物理伤害 -3%"
    },
    "shoushen": {
      "id": "shoushen",
      "name": "守神",
      "tier": "common",
      "stat": "reduMagic",
      "val": 0.03,
      "desc": "受到法术道则伤害 -3%"
    },
    "cuixue": {
      "id": "cuixue",
      "name": "淬血",
      "tier": "rare",
      "stat": "lifesteal",
      "val": 0.02,
      "desc": "攻击命中，吸取 2% 伤害值作为生命"
    },
    "qingshen": {
      "id": "qingshen",
      "name": "轻身",
      "tier": "rare",
      "stat": "dodge",
      "val": 0.04,
      "desc": "闪避概率 +4%"
    },
    "pojia": {
      "id": "pojia",
      "name": "破甲",
      "tier": "rare",
      "stat": "ignoreDefHit",
      "val": 0.05,
      "desc": "攻击命中，降低敌方 5% 防御"
    },
    "xuangu": {
      "id": "xuangu",
      "name": "玄骨",
      "tier": "rare",
      "stat": "reflect",
      "val": 0.05,
      "desc": "被攻击，反弹 5% 伤害"
    },
    "fengxing": {
      "id": "fengxing",
      "name": "风行",
      "tier": "rare",
      "stat": "atkStack",
      "val": 0.03,
      "max": 3,
      "desc": "每回合攻击 +3%，最多叠 3 层，回合结束重置"
    },
    "yuling": {
      "id": "yuling",
      "name": "御灵",
      "tier": "rare",
      "stat": "survive1",
      "desc": "首次致命伤害保留 1 点生命，一局 1 次"
    },
    "tunyuan": {
      "id": "tunyuan",
      "name": "吞元",
      "tier": "ultimate",
      "stat": "lifesteal",
      "val": 0.04,
      "killHeal": 0.1,
      "desc": "攻击吸取 4% 伤害生命值；击杀额外回 10% 生命"
    },
    "zhenyue": {
      "id": "zhenyue",
      "name": "镇岳",
      "tier": "ultimate",
      "stat": "defPct",
      "val": 0.08,
      "enemyAtkDown": 0.04,
      "desc": "防御提升 8%；敌人攻击你时，敌方攻击降 4%"
    },
    "xukongdun": {
      "id": "xukongdun",
      "name": "虚空遁",
      "tier": "ultimate",
      "stat": "dodge",
      "val": 0.1,
      "dodgeFollowup": 0.15,
      "desc": "闪避 +10%；闪避成功，下一击伤害 +15%"
    }
  },
  "SETS": {
    "xuejia": {
      "name": "荒古血甲套",
      "dao": "续航吸血",
      "color": "#e0533f",
      "quality": "蓝~紫",
      "slots": [
        "head",
        "chest",
        "wrist",
        "pants",
        "shoes"
      ],
      "t3": {
        "desc": "攻击命中获得 5% 吸血",
        "bonus": {
          "lifesteal": 0.05
        }
      },
      "t5": {
        "desc": "吸血提升至 12%；击杀目标后，本回合攻击力 +8%（仅本回合）",
        "bonus": {
          "lifesteal": 0.12,
          "killAtkUp": 0.08
        }
      }
    },
    "yufeng": {
      "name": "云踪御风套",
      "dao": "闪避机动",
      "color": "#5fa8d9",
      "quality": "紫",
      "slots": [
        "head",
        "wrist",
        "pants",
        "shoes",
        "necklace"
      ],
      "t3": {
        "desc": "闪避概率 +12%",
        "bonus": {
          "dodge": 0.12
        }
      },
      "t5": {
        "desc": "闪避概率 +20%；成功闪避后，下一次攻击伤害 +20%",
        "bonus": {
          "dodge": 0.2,
          "dodgeFollowup": 0.2
        }
      }
    },
    "zhenshan": {
      "name": "万钧镇山套",
      "dao": "坦克反伤",
      "color": "#b06b3a",
      "quality": "紫~橙",
      "slots": [
        "head",
        "chest",
        "pants",
        "wrist",
        "shoes"
      ],
      "t3": {
        "desc": "防御 +15%，受到所有伤害降低 8%",
        "bonus": {
          "defPct": 0.15,
          "reduAll": 0.08
        }
      },
      "t5": {
        "desc": "受到伤害减免 18%；敌方对你造成伤害时，反弹 8% 伤害",
        "bonus": {
          "reduAll": 0.18,
          "reflect": 0.08
        }
      }
    },
    "fentian": {
      "name": "焚天战魂套",
      "dao": "爆发强攻",
      "color": "#e8533a",
      "quality": "橙",
      "slots": [
        "head",
        "chest",
        "wrist",
        "necklace",
        "weapon"
      ],
      "t3": {
        "desc": "攻击力 +18%",
        "bonus": {
          "atkPct": 0.18
        }
      },
      "t5": {
        "desc": "每次攻击 15% 概率触发【焚击】，对普通敌人附加其当前生命值 10% 额外伤害；世界首领不生效",
        "bonus": {
          "fenjiProc": 0.15,
          "fenjiMul": 0.1
        }
      }
    },
    "daoti": {
      "name": "不灭道体套",
      "dao": "保命坚韧",
      "color": "#9e3ad9",
      "quality": "橙",
      "slots": [
        "head",
        "chest",
        "wrist",
        "pants",
        "necklace"
      ],
      "t3": {
        "desc": "战斗开局获得护盾，护盾值 = 自身最大生命值 10%",
        "bonus": {
          "shieldStart": 0.1
        }
      },
      "t5": {
        "desc": "第一次受到致命伤害时，保留 30% 血量（单局战斗仅触发 1 次）",
        "bonus": {
          "surviveThreshold": 0.3
        }
      }
    },
    "dizun": {
      "name": "帝尊道装",
      "dao": "均衡道则",
      "color": "#e8c34a",
      "quality": "红·毕业",
      "slots": [
        "head",
        "chest",
        "wrist",
        "pants",
        "shoes",
        "necklace"
      ],
      "t3": {
        "desc": "吸血 +10%，闪避 +8%，攻击 +12%，防御 +12%",
        "bonus": {
          "lifesteal": 0.1,
          "dodge": 0.08,
          "atkPct": 0.12,
          "defPct": 0.12
        }
      },
      "t5": {
        "desc": "自身受到负面效果持续时间减半；每次攻击附带固定道则伤害（基于五维总值）",
        "bonus": {
          "debuffHalf": 0.5,
          "daozheDmg": 0.4
        }
      }
    }
  },
  "SET_LIST": [
    "xuejia",
    "yufeng",
    "zhenshan",
    "fentian",
    "daoti",
    "dizun"
  ],
  "SLOT_SET_DEFAULT": {
    "head": "xuejia",
    "chest": "xuejia",
    "wrist": "xuejia",
    "pants": "xuejia",
    "shoes": "xuejia",
    "necklace": "yufeng",
    "weapon": null
  },
  "AFFIX_INSCRIPTION": [
    {
      "id": "m1",
      "name": "破妄铭文",
      "cat": "atk"
    },
    {
      "id": "m2",
      "name": "固元铭文",
      "cat": "hp"
    },
    {
      "id": "m3",
      "name": "锐金铭文",
      "cat": "crit"
    },
    {
      "id": "m4",
      "name": "御灵铭文",
      "cat": "redu"
    },
    {
      "id": "m5",
      "name": "疾影铭文",
      "cat": "dodge"
    },
    {
      "id": "m6",
      "name": "镇魂铭文",
      "cat": "dim",
      "key": "str"
    }
  ],
  "AFFIX_RANGE": {
    "dim": [
      [
        1,
        3
      ],
      [
        2,
        5
      ],
      [
        4,
        8
      ],
      [
        6,
        12
      ],
      [
        9,
        16
      ]
    ],
    "atk": [
      [
        2,
        5
      ],
      [
        4,
        8
      ],
      [
        7,
        12
      ],
      [
        10,
        18
      ],
      [
        14,
        26
      ]
    ],
    "crit": [
      [
        1,
        3
      ],
      [
        2,
        4
      ],
      [
        3,
        6
      ],
      [
        4,
        8
      ],
      [
        6,
        10
      ]
    ],
    "dodge": [
      [
        1,
        3
      ],
      [
        2,
        4
      ],
      [
        3,
        6
      ],
      [
        4,
        8
      ],
      [
        6,
        10
      ]
    ],
    "hp": [
      [
        20,
        50
      ],
      [
        40,
        90
      ],
      [
        80,
        150
      ],
      [
        140,
        240
      ],
      [
        220,
        380
      ]
    ],
    "redu": [
      [
        1,
        3
      ],
      [
        2,
        5
      ],
      [
        4,
        8
      ],
      [
        6,
        12
      ],
      [
        10,
        18
      ]
    ]
  },
  "GROWTH": {
    "jinchiCost": 1,
    "bySlot": {
      "head": {
        "lh": 2
      },
      "chest": {
        "hy": 2
      },
      "wrist": {
        "hx": 2
      },
      "pants": {
        "dj": 2
      },
      "shoes": {
        "dj": 2
      },
      "necklace": {
        "lh": 2
      }
    },
    "feed": {
      "1": {
        "ht": 3
      },
      "2": {
        "qw": 5
      },
      "3": {
        "ct": 4
      },
      "4": {
        "bl": 4
      },
      "5": {
        "yw": 5
      },
      "6": {
        "yl": 6
      }
    },
    "maxLv": 6
  },
  "ZHENGDAO": {
    "openLv": 15,
    "boundLv": 30,
    "resonanceLv": 45,
    "spiritLv": 90,
    "emperorLv": 120,
    "openCost": {
      "bl": 4,
      "xlg": 2
    },
    "reshapeCost": {
      "kong": 2
    },
    "engraveCost": {
      "xlg": 1,
      "yhs": 1
    }
  },
  "WTYPES": {
    "zhong": {
      "name": "重械",
      "dao": "圣体道",
      "combat": "str"
    },
    "qing": {
      "name": "轻刃",
      "dao": "妖影道",
      "combat": "agi"
    },
    "chang": {
      "name": "长兵",
      "dao": "帝皇杀伐道",
      "combat": "spd"
    },
    "dun": {
      "name": "盾械",
      "dao": "不灭王道",
      "combat": "def"
    },
    "fa": {
      "name": "法器",
      "dao": "符文仙道",
      "combat": "luc"
    }
  },
  "NAME_PREFIX": {
    "白": [
      "粗制",
      "凡铁",
      "寻常"
    ],
    "绿": [
      "精良",
      "青锋",
      "素纹"
    ],
    "蓝": [
      "玄纹",
      "碧落",
      "寒铁"
    ],
    "紫": [
      "紫宸",
      "幽冥",
      "星陨"
    ],
    "橙": [
      "赤焰",
      "龙鳞",
      "乾坤"
    ]
  },
  "NAME_SLOT": {
    "head": [
      "头盔",
      "兜鍪",
      "冠"
    ],
    "chest": [
      "胸甲",
      "战袍",
      "护心镜"
    ],
    "wrist": [
      "护腕",
      "臂甲",
      "腕轮"
    ],
    "pants": [
      "战裤",
      "缚腿",
      "裙甲"
    ],
    "shoes": [
      "战靴",
      "疾风履",
      "踏云靴"
    ],
    "necklace": [
      "灵佩",
      "玉坠",
      "链"
    ],
    "weapon": [
      "兵刃",
      "长兵",
      "短兵"
    ]
  }
} as const;
