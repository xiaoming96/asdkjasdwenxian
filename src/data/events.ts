/**
 * 奇遇事件（策划案 §10，30 条）
 * 后果用数据 DSL 描述，复杂事件走 special 脚本（run.ts 中实现）。
 * actPool：1 = 1-14 通用；2 = 幕二起；23-30 = 幕二/三。
 */

export interface EventOutcome {
  weight?: number; // 概率分支权重
  text: string; // 后果文案
  gold?: number;
  hp?: number; // 正回负失（失血）
  maxHp?: number;
  heal?: 'full' | 'half' | number;
  gainCardRarity?: 'common' | 'rare' | 'epic' | 'legendary';
  gainCardElement?: string;
  gainCardId?: string;
  gainCardUpgraded?: boolean;
  gainCurse?: string;
  gainPotion?: number; // 随机丹药数量
  gainRelicGrade?: 'fan' | 'ling' | 'xian' | 'jie';
  gainRelicId?: string;
  removeCards?: number; // 进入删牌选择
  upgradeCards?: number; // 进入参悟选择
  upgradeRandom?: number; // 随机升级
  battle?: string; // 进入战斗（敌人 id）
  battleElite?: boolean; // 当幕精英池随机
  special?: string; // 脚本 id
  flag?: string; // 设置 run.flags
  flagValue?: number;
}

export interface EventOption {
  label: string;
  risky?: boolean; // ⚠ 朱砂点
  requireGold?: number; // 需要灵石
  requireRelic?: boolean; // 需要至少 1 件法宝（忘川）
  outcomes: EventOutcome[]; // 多条按 weight 掷骰；单条必然
}

export interface EventDef {
  id: string;
  name: string;
  scene: string;
  actPool: 1 | 2 | 23; // 1=通用 2=幕二起 23=幕二/三
  options: EventOption[];
}

export const EVENTS: Record<string, EventDef> = {};
function def(e: EventDef) {
  EVENTS[e.id] = e;
}

def({
  id: 'shanzhongduiyi', name: '山中对弈', actPool: 1,
  scene: '深山之中，两位老者于青石上对弈，棋盘之上隐有风雷之声。斧柯已烂，二老浑然未觉。',
  options: [
    { label: '观棋不语', outcomes: [{ text: '你静观一局，若有所悟。获得一张稀有功法。', gainCardRarity: 'rare' }] },
    {
      label: '贸然支招', risky: true,
      outcomes: [
        { weight: 50, text: '老者抚掌大笑："妙手！"赠你一卷传世功法。', gainCardRarity: 'legendary' },
        { weight: 50, text: '老者皱眉，棋风骤变，你只觉道基一震。气血上限 −10。', maxHp: -10 },
      ],
    },
  ],
});
def({
  id: 'linghubaoen', name: '灵狐报恩', actPool: 1,
  scene: '一只通体雪白的灵狐困于猎户铁夹，目露哀求之色。',
  options: [
    { label: '救它（失 12 血）', outcomes: [{ text: '你掰开铁夹，指尖染血。白狐化虹而去，两幕之后或有报答。', hp: -12, flag: 'linghu', flagValue: 1 }] },
    { label: '无视', outcomes: [{ text: '你转身离去，山风萧瑟。', }] },
  ],
});
def({
  id: 'zouhuorumo', name: '走火入魔', actPool: 1,
  scene: '行功之际丹田灵气忽然暴走，识海中隐有魔影狞笑。',
  options: [
    { label: '强压（战心魔分身）', risky: true, outcomes: [{ text: '你以神识入内景，与心魔分身相搏！', battle: 'zhinian_x2', special: 'zouhuoReward' }] },
    { label: '散功保命', outcomes: [{ text: '你散去周天灵气，道行受损。删除 2 张牌，失 6 血。', hp: -6, removeCards: 2 }] },
  ],
});
def({
  id: 'fangshidushi', name: '坊市赌石', actPool: 1,
  scene: '坊市角落，一名蛇眼商人守着几块斑驳原石："仙缘一刀切，五十灵石。"',
  options: [
    {
      label: '切一刀（50 灵石）', risky: true, requireGold: 50,
      outcomes: [
        { weight: 40, text: '石屑纷飞，空空如也。商人摊手："仙缘未至。"', gold: -50 },
        { weight: 40, text: '石中灵光乍现！内有灵石一窝。', gold: 30 },
        { weight: 20, text: '刀落石开，一件法宝静卧其中！', gold: -50, gainRelicGrade: 'fan' },
      ],
    },
    { label: '离开', outcomes: [{ text: '你摇了摇头，转身离去。' }] },
  ],
});
def({
  id: 'kumiaolaoseng', name: '枯庙老僧', actPool: 1,
  scene: '荒山枯庙，一名老僧闭目趺坐，周身尘埃不染。',
  options: [
    { label: '听禅', outcomes: [{ text: '禅音入耳，尘垢自落。移除 1 张牌。', removeCards: 1 }] },
    {
      label: '施舍全部灵石', requireGold: 30,
      outcomes: [{ text: '老僧睁眼一笑："善。"你只觉灵台清明，功德加身。下 3 场战斗开局 +1 灵气。', special: 'gongde' }],
    },
  ],
});
def({
  id: 'yesuyizhuang', name: '夜宿义庄', actPool: 1,
  scene: '夜宿义庄，三更时分，棺木之中传来轻响。',
  options: [
    { label: '掀棺', risky: true, outcomes: [{ text: '棺盖掀开，两具跳尸破棺而出！', battle: 'tiaoshi_x2', special: 'yizhuangReward' }] },
    { label: '烧香跪拜', outcomes: [{ text: '你焚香三炷，叩首而拜。棺中掷出一串铜钱，額角却撞上供桌。失 5 血，得 25 灵石。', hp: -5, gold: 25 }] },
  ],
});
def({
  id: 'jingdizhisheng', name: '井底之声', actPool: 1,
  scene: '荒村枯井，井底传来若有若无的呼救声。',
  options: [
    {
      label: '下井', risky: true,
      outcomes: [
        { weight: 60, text: '你救出一名被妖风卷落的童子，他以一卷功法相谢。', gainCardRarity: 'rare' },
        { weight: 40, text: '井底冰冷的手骤然扣住你的脚踝！', hp: -10, battle: 'shuigui' },
      ],
    },
    { label: '封井离去', outcomes: [{ text: '你搬石封井。声音戛然而止，你的心头却蒙上一层阴影。', gainCurse: 'xinmo_curse' }] },
  ],
});
def({
  id: 'wangchuanbaiduren', name: '忘川摆渡人', actPool: 1,
  scene: '雾锁河面，一叶扁舟无桨自行。蓑衣船夫伸出枯手："渡资，一件重要之物。"',
  options: [
    { label: '付 1 件法宝', requireRelic: true, outcomes: [{ text: '船夫收起法宝，扁舟破雾疾行。', special: 'baidu_relic' }] },
    { label: '付 15 血', outcomes: [{ text: '船夫收起你的一缕精血，扁舟破雾疾行。', hp: -15, special: 'baidu' }] },
    { label: '不渡', outcomes: [{ text: '你退回岸上，雾中传来一声轻叹。' }] },
  ],
});
def({
  id: 'yaoyuanyizhi', name: '药园遗址', actPool: 1,
  scene: '断垣之内灵草丛生，然瘴气弥漫，隐见白骨。',
  options: [
    { label: '尽数采药', risky: true, outcomes: [{ text: '你冒瘴采药，满载而归，瘴毒却入了肺腑。得 2 丹药，3 层瘴毒带入下场战斗。', gainPotion: 2, flag: 'zhangqi', flagValue: 3 }] },
    { label: '只采一株', outcomes: [{ text: '你掠取近处一株灵芝，全身而退。', gainPotion: 1 }] },
  ],
});
def({
  id: 'duanbeikezi', name: '断碑刻字', actPool: 1,
  scene: '古道旁一方断碑，碑文残缺，然笔画间剑意纵横。',
  options: [
    { label: '拓印', outcomes: [{ text: '你以宣纸拓下残文，剑意入心。获得"御剑术+"。', gainCardId: 'yujianshu', gainCardUpgraded: true }] },
    { label: '以血续字', risky: true, outcomes: [{ text: '你咬破指尖补全碑文，剑意轰然灌顶！失 8 血。', hp: -8, special: 'jinEpic' }] },
  ],
});
def({
  id: 'huazhongxian', name: '画中仙', actPool: 1,
  scene: '破庙墙上悬一幅古画，画中美人眉目含情，似欲开口。',
  options: [
    {
      label: '入画', risky: true,
      outcomes: [
        { weight: 34, text: '画中一梦百年，醒来神完气足。回满气血。', heal: 'full' },
        { weight: 33, text: '画中艳骨森森，你夺路而逃！失去一半气血。', heal: 'half' },
        { weight: 33, text: '美人赠你一面古镜，倏然梦醒。获得"镜花水月"。', gainCardId: 'jinghuashuiyue' },
      ],
    },
    { label: '焚画', outcomes: [{ text: '画轴焚尽，灰烬中滚出几枚灵石，你耳边却响起一声呜咽。得 30 灵石。', gold: 30, gainCurse: 'yinguozhai' }] },
  ],
});
def({
  id: 'zuidaoren', name: '醉道人', actPool: 1,
  scene: '一名酒气熏天的道人拦住去路："小友，陪贫道饮三碗，便有造化。"',
  options: [
    { label: '喝', risky: true, outcomes: [{ text: '三碗下肚，天旋地转。', special: 'zuidao' }] },
    { label: '不喝', outcomes: [{ text: '道人摇头踉跄而去，怀中滚落 10 灵石。', gold: 10 }] },
  ],
});
def({
  id: 'xianghuoyuanli', name: '香火愿力', actPool: 1,
  scene: '破庙神像无人供奉，香炉冷灰之中犹存一点愿力微光。',
  options: [
    { label: '供奉 20 灵石', requireGold: 20, outcomes: [{ text: '神像目光似有微动。本幕 Boss 战开局 +10 护体。', gold: -20, flag: 'xianghuo', flagValue: 10 }] },
    { label: '砸神像', risky: true, outcomes: [{ text: '泥胎崩裂，内藏灵石滚落一地。你隐约听见一声冷哼。得 40 灵石，下个未知节点必为精英。', gold: 40, flag: 'zashen', flagValue: 1 }] },
  ],
});
def({
  id: 'shenlouhuanshi', name: '蜃楼幻市', actPool: 1,
  scene: '半空之中浮现一座市集，灯火通明，人影憧憧，全场八折。',
  options: [
    { label: '入市购物', risky: true, outcomes: [{ text: '你踏入幻市。', special: 'shenlou' }] },
    { label: '绕行', outcomes: [{ text: '海市蜃楼，看看便罢。' }] },
  ],
});
def({
  id: 'leijigumu', name: '雷击古木', actPool: 1,
  scene: '一株遭雷火劈过的古树焦黑矗立，树心之中雷光隐现。',
  options: [
    { label: '取雷种', risky: true, outcomes: [{ text: '雷光入体，剧痛钻心，你却将雷种炼入法宝。受 10 雷伤，得"雷击木"。', hp: -10, gainRelicId: 'leijimu' }] },
    { label: '取木心', outcomes: [{ text: '你剖出两截坚逾金铁的木心。获得 2 张"落石+"。', special: 'muxin' }] },
  ],
});
def({
  id: 'wumingjianzhong', name: '无名剑冢', actPool: 1,
  scene: '万剑插土，嗡鸣不止，剑气冲霄。冢前无碑无名。',
  options: [
    { label: '拔剑', risky: true, outcomes: [{ text: '你握住剑柄的刹那，剑冢遗灵拔地而起！', battle: 'jianzhongyiling', special: 'jianzhongReward' }] },
    { label: '祭拜', outcomes: [{ text: '你焚香三拜，万剑齐鸣如应。你的全部金牌本局 +1 伤。', flag: 'jianji', flagValue: 1 }] },
  ],
});
def({
  id: 'fangshengchi', name: '放生池', actPool: 1,
  scene: '古寺放生池中，一尾金鳞锦鲤浮首吐泡，似有灵性。',
  options: [
    { label: '放生（失 15 灵石买下）', requireGold: 15, outcomes: [{ text: '锦鲤入江，回首三顾而去。', gold: -15, flag: 'fangsheng', flagValue: 1 }] },
    { label: '捞鱼', risky: true, outcomes: [{ text: '你捞起锦鲤烤了，肉香四溢，心头却隐有戾气滋生。得 1 丹药。', gainPotion: 1, gainCurse: 'tanchen' }] },
  ],
});
def({
  id: 'huangliangyimeng', name: '黄粱一梦', actPool: 1,
  scene: '道旁一方青草枕，睡意莫名袭来。',
  options: [
    {
      label: '小憩', risky: true,
      outcomes: [
        { weight: 80, text: '一梦黄粱，恍如隔世，醒来只觉神清气爽。回 25% 血，下场战斗首回合抽 +2。', special: 'huangliang' },
        { weight: 20, text: '梦中魔影缠身，惊醒时冷汗涔涔。', gainCurse: 'xinmo_curse' },
      ],
    },
    { label: '赶路', outcomes: [{ text: '修行之人，岂可贪睡。' }] },
  ],
});
def({
  id: 'shanshenqiuqian', name: '山神求签', actPool: 1,
  scene: '山神祠中签筒轻晃，三支竹签露头，似在相邀。',
  options: [
    {
      label: '抽签', risky: true,
      outcomes: [
        { weight: 25, text: '上上签："紫气东来。"气血上限 +8。', maxHp: 8 },
        { weight: 50, text: '中签："财帛小聚。"得 20 灵石。', gold: 20 },
        { weight: 25, text: '下下签："出师不利。"下场战斗开局 −1 灵气。', flag: 'xiaqian', flagValue: 1 },
      ],
    },
    { label: '不抽', outcomes: [{ text: '命数天定，何必问签。' }] },
  ],
});
def({
  id: 'yiluochuwudai', name: '遗落储物袋', actPool: 1,
  scene: '一具枯坐百年的前辈遗蜕旁，静静躺着一只乾坤袋。',
  options: [
    {
      label: '直接拿', risky: true,
      outcomes: [
        { weight: 60, text: '袋中灵石丹药俱全，你收获颇丰。得 50 灵石与 1 枚丹药。', gold: 50, gainPotion: 1 },
        { weight: 40, text: '禁制触发，一道罡气将你掀飞！受 12 伤。', hp: -12 },
      ],
    },
    { label: '先超度再拿', outcomes: [{ text: '你诵经超度，遗蜕化尘。乾坤袋中所获与心中安宁俱全，只是耽搁了路程。', gold: 50, gainPotion: 1, flag: 'chaodu', flagValue: 1 }] },
  ],
});
def({
  id: 'shangyuandenghui', name: '上元灯会', actPool: 1,
  scene: '山下小镇恰逢上元灯会，一盏走马灯前悬着灯谜："五行有一缺，猜一字。"',
  options: [
    { label: '答"水到渠成"', outcomes: [{ text: '灯主抚掌："答对了！"赠你一卷图册。获得"观想五行+"。', gainCardId: 'guanxiangwuxing', gainCardUpgraded: true }] },
    { label: '胡乱作答', outcomes: [{ text: '灯主笑而不语，塞给你 5 枚灵石作安慰。', gold: 5 }] },
  ],
});
def({
  id: 'shibiankezhan', name: '尸变客栈', actPool: 2,
  scene: '荒野客栈，入夜灯灭，四下里响起指甲挠地之声。',
  options: [
    { label: '点起火把', risky: true, outcomes: [{ text: '火光亮起，满堂皆尸！', battle: 'shiqun', special: 'kezhanReward' }] },
    { label: '破窗而逃', outcomes: [{ text: '你破窗夺路，玻璃碎片划伤了手臂。失 6 血。', hp: -6 }] },
  ],
});
def({
  id: 'laoguiwenshou', name: '老龟问寿', actPool: 2,
  scene: '千年老龟浮出湖面，口吐人言："小修士，长生何用？"',
  options: [
    { label: '答"守护"', outcomes: [{ text: '老龟颔首："善。"赠你一片龟甲。获得"玄龟甲"。', gainRelicId: 'xuanguijia' }] },
    { label: '答"逍遥"', risky: true, outcomes: [{ text: '老龟大笑三声："痴儿，逍遥无价！"赠你吞天之法，却也添了一缕尘缘。', special: 'beiming' }] },
    { label: '答"不知"', outcomes: [{ text: '老龟笑了："不知即知。"湖水温润，涤荡周身。回满气血。', heal: 'full' }] },
  ],
});
def({
  id: 'tianshucanye', name: '天书残页', actPool: 2,
  scene: '崖壁石匣中一页天书拓片，其上文字如活物游动。',
  options: [
    { label: '参悟', outcomes: [{ text: '你观字入定，一夜之间道行大进。随机升级 2 张牌。', upgradeRandom: 2 }] },
    { label: '撕下带走', risky: true, outcomes: [{ text: '拓片入手即化金光没入眉心，你只觉业力缠身。', special: 'tianshu' }] },
  ],
});
def({
  id: 'xinmolaifang', name: '心魔来访', actPool: 23,
  scene: '夜半入定，心魔于识海现身，笑意温和："给你力量，飞升时再算。"',
  options: [
    { label: '接受', risky: true, outcomes: [{ text: '一粒漆黑种子没入丹田，力量与隐患俱来。获得"心魔种"。', gainRelicId: 'xinmozhong' }] },
    { label: '拒绝', outcomes: [{ text: '你一声冷哼，心魔悻悻而去。道心愈坚，天劫为之减威。最终"道雷"气血 −20。', flag: 'jujuexinmo', flagValue: 20 }] },
  ],
});
def({
  id: 'shiyuezhiye', name: '蚀月之夜', actPool: 23,
  scene: '天狗食月，四野妖力大盛，嗥叫此起彼伏。',
  options: [
    { label: '连夜赶路', risky: true, outcomes: [{ text: '妖气最盛之地，妖丹也最肥。本幕后续敌人 +1 罡气，战斗灵石 +50%。', flag: 'shiyue', flagValue: 1 }] },
    { label: '寻地躲避', outcomes: [{ text: '你寻了处山洞蛰伏一夜，平安无事，只是误了路程。', hp: -0 }] },
  ],
});
def({
  id: 'kongzhidongfu', name: '空置洞府', actPool: 23,
  scene: '一座前人洞府，主人早已坐化，阵法犹自运转。',
  options: [
    { label: '炼化阵法', outcomes: [{ text: '阵法认主，洞府为你所用。', special: 'freeCave' }] },
    {
      label: '搜刮而去', risky: true,
      outcomes: [
        { weight: 80, text: '你搜出一袋灵石，扬长而去。得 35 灵石。', gold: 35 },
        { weight: 20, text: '你刚动手，护府傀儡破土而出！', gold: 35, battle: 'jinjiakuilei' },
      ],
    },
  ],
});
def({
  id: 'youfanghuolang', name: '游方货郎', actPool: 23,
  scene: '一名货郎摇着拨浪鼓迎面而来，担子里全是"仙家小玩意"。',
  options: [
    { label: '看货', outcomes: [{ text: '货郎眉开眼笑地放下担子。', special: 'huolang' }] },
    { label: '还价', risky: true,
      outcomes: [
        { weight: 30, text: '货郎一拍大腿："成交！全场八折！"', special: 'huolang_cheap' },
        { weight: 70, text: '货郎冷下脸来："爱买不买。"全场涨价一成。', special: 'huolang_expensive' },
      ],
    },
  ],
});
def({
  id: 'tongziqiujiu', name: '童子求救', actPool: 23,
  scene: '一名道童连滚带爬地扑来："仙长救命！家师被妖物困住了！"',
  options: [
    { label: '随他去救', risky: true, outcomes: [{ text: '你随童子赶至山坳，妖气扑面而来！', battleElite: true, special: 'tongziReward' }] },
    { label: '摇头拒绝', outcomes: [{ text: '童子哭声渐远，你心头莫名一沉。', gainCurse: 'yinguozhai' }] },
  ],
});
def({
  id: 'zhalu_xianchang', name: '炸炉现场', actPool: 23,
  scene: '前方丹房轰然炸响，浓烟滚滚，遍地药渣，一名炼丹师埋在瓦砾中呻吟。',
  options: [
    { label: '捡丹渣', risky: true, outcomes: [{ text: '你在废墟里扒拉出两枚尚算完好的丹药。得 2 随机丹药（服用时 20% 失效）。', gainPotion: 2, flag: 'danzha', flagValue: 1 }] },
    { label: '救炼丹师', outcomes: [{ text: '你搬开瓦砾救出丹师，被余火燎伤。失 8 血，本局坊市丹药 6 折。', hp: -8, flag: 'danshi', flagValue: 1 }] },
  ],
});

// ---------- 池 ----------

export function eventPool(act: 1 | 2 | 3, used: string[]): EventDef[] {
  return Object.values(EVENTS).filter((e) => {
    if (used.includes(e.id)) return false;
    if (e.actPool === 1) return true;
    if (e.actPool === 2) return act >= 2;
    return act >= 2; // 23-30 幕二/三
  });
}

export function getEvent(id: string): EventDef {
  const e = EVENTS[id];
  if (!e) throw new Error(`未知事件: ${id}`);
  return e;
}
