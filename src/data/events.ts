/**
 * 奇遇事件（策划案 §10 v3：30 条，含 6 条因果链 ⚯）+ 内置事件 4 条（noPool）。
 *
 * - 类型契约：EventDef / EventOutcome 定义于 core/types.ts，本文件只填数据。
 * - 代价统一四币种：灵石 gold / 寿元 lifespan / 心魔 demon / 丹毒 toxin；
 *   v2 的 gainCurse（塞诅咒牌）一律废除，改记 demon（诅咒牌由心魔阈值投影，§5.5）。
 * - 随机分支：outcomes 按 weight 掷骰（单条即必然）；「随机灵材 ×N」契约无定值
 *   表达，以等权分支摊开（见 matBranch）。
 * - 复杂脚本走 outcome.special，由 core/run.ts 实现，清单见文件尾注释。
 * - 分幕入池：1–14 通用；15–22 幕二起；23–30 幕二/三（minAct: 2，与 §10 尾注一致）。
 *   noPool 事件不入随机池，由 run.ts 在时机到时插入（劫云压顶 / 因果链下集）。
 */
import type { EventDef, EventOutcome, MaterialId } from '../core/types';

export const EVENTS: Record<string, EventDef> = {};

function def(e: EventDef) {
  EVENTS[e.id] = e;
}

// ---------- 随机灵材工具 ----------

const MAT_NAME: Record<MaterialId, string> = {
  lingcao: '灵草', yusui: '玉髓', yaodan: '妖丹', leisha: '雷砂',
};

/** 灵材组合 → 文案（如「灵草 ×2、妖丹 ×1」） */
function matText(m: Partial<Record<MaterialId, number>>): string {
  return (Object.entries(m) as [MaterialId, number][])
    .map(([k, v]) => `${MAT_NAME[k]} ×${v}`).join('、');
}

/** 把「随机灵材」摊成若干等权分支，每支附带相同的基础后果 */
function matBranch(
  combos: Partial<Record<MaterialId, number>>[],
  weight: number,
  make: (m: Partial<Record<MaterialId, number>>) => EventOutcome,
): EventOutcome[] {
  return combos.map((m) => ({ weight, ...make(m) }));
}

/** 随机灵材 ×2 / ×3 的组合池 */
const MATS_X2: Partial<Record<MaterialId, number>>[] = [
  { lingcao: 2 }, { yusui: 2 }, { yaodan: 2 }, { leisha: 2 },
];
const MATS_X3: Partial<Record<MaterialId, number>>[] = [
  { lingcao: 3 }, { yusui: 3 }, { yaodan: 2, leisha: 1 }, { lingcao: 1, yusui: 1, yaodan: 1 },
];

// ==================== 1–14 通用（幕一起） ====================

// 1. 山中对弈（烂柯典故）
def({
  id: 'shanzhongduiyi', name: '山中对弈',
  scene: '深山古径尽头，两位鹤发老者于青石上对弈，落子声里隐有风雷。你倚树观望，腰间斧柯不知何时已烂了半截。',
  options: [
    {
      label: '观棋不语（耗 2 年寿元）', requireLifespan: 3,
      outcomes: [{
        text: '一局看罢，日月已换了几轮。你于纵横十九道间窥得一式功法，鬓角却悄然添了霜色。（寿元 −2，得随机稀有功法）',
        lifespan: -2, gainCardRarity: 'rare',
      }],
    },
    {
      label: '贸然支招',
      outcomes: [
        {
          weight: 50,
          text: '老者抚掌大笑："妙手！小友有仙缘！"袖中飞出一卷传世功法，径直落入你怀中。',
          gainCardRarity: 'legendary',
        },
        {
          weight: 50,
          text: '老者眉头一皱，棋盘上风雷骤起："俗手也敢多嘴？"那一眼看得你道心发虚，夜里总觉得有人在耳边复盘。（心魔 +2）',
          demon: 2,
        },
      ],
    },
  ],
});

// 2. 灵狐报恩 ⚯（chain_linghu → 两幕后「狐妖再会」）
def({
  id: 'linghubaoen', name: '灵狐报恩',
  scene: '一只通体雪白的灵狐困于猎户铁夹，血染霜毛，目露哀求之色。',
  options: [
    {
      label: '救它（失 12 血）',
      outcomes: [{
        text: '你掰开铁夹，锯齿反弹咬入掌心。白狐舔了舔你指间的血，回首三顾，化虹而去——这份因果，两幕之后或有回音。',
        hp: -12, flag: 'chain_linghu', flagValue: 1,
      }],
    },
    { label: '无视', outcomes: [{ text: '你转身离去，身后山风萧瑟，呜咽渐不可闻。' }] },
  ],
});

// 3. 走火入魔
def({
  id: 'zouhuorumo', name: '走火入魔',
  scene: '行功之际丹田灵气忽然暴走，经脉如遭火焚，识海深处隐有魔影狞笑。',
  options: [
    {
      label: '强压（战心魔分身）',
      outcomes: [{
        text: '你咬碎舌尖强提一口真元，神识沉入内景——魔影已候多时："来得好！"（胜可得史诗功法）',
        battle: 'zhinian_x2', special: 'zouhuoReward',
      }],
    },
    {
      label: '散功保命',
      outcomes: [{
        text: '你散去周天灵气，任其从百窍溢出。命是保住了，道行却生生折了一截。（斩去 2 张牌，失 6 血）',
        hp: -6, removeCards: 2,
      }],
    },
  ],
});

// 4. 坊市赌石（连切由 run.ts 的 dushi 脚本实现：每刀 50 灵石，
//    40% 落空 / 40% 得 80 灵石 / 20% 得随机法宝；第二刀起赌性滋魔，每多一刀心魔 +1）
def({
  id: 'fangshidushi', name: '坊市赌石',
  scene: '坊市角落，一名蛇眼商人守着几块斑驳原石，指节敲得笃笃响："仙缘一刀切，五十灵石。切出什么，算什么。"',
  options: [
    {
      label: '切一刀（50 灵石）', requireGold: 50,
      outcomes: [{
        text: '你接过灵刀，屏息落刃——四成落空、四成开出八十灵石、两成藏着法宝。切罢商人眯眼再问："再来一刀？"（可连切，第二刀起每多一刀心魔 +1）',
        special: 'dushi',
      }],
    },
    { label: '离开', outcomes: [{ text: '你摇了摇头。赌石赌石，赌的从来不是石头。' }] },
  ],
});

// 5. 枯庙老僧
def({
  id: 'kumiaolaoseng', name: '枯庙老僧',
  scene: '荒山枯庙，一名老僧闭目趺坐，衣衫褴褛却纤尘不染，檐外风声到他三尺之内便自止息。',
  options: [
    {
      label: '听禅',
      outcomes: [{ text: '禅音如水，一字一句漫过识海，心头两分躁郁竟被涤得干干净净。（心魔 −2）', demon: -2 }],
    },
    {
      label: '施舍全部灵石（需 ≥30）', requireGold: 30,
      outcomes: [{
        text: '你解囊倒尽灵石。老僧睁眼一笑："善。"囊中空空，灵台却一片澄明——功德加身，下 3 场战斗开局吐纳 +1。',
        special: 'gongde',
      }],
    },
  ],
});

// 6. 夜宿义庄
def({
  id: 'yesuyizhuang', name: '夜宿义庄',
  scene: '夜宿义庄，三更时分，头顶纸钱无风自动，棺木之中传来指甲抓挠的轻响。',
  options: [
    {
      label: '掀棺',
      outcomes: [{
        text: '棺盖掀飞，两具青面跳尸破棺而出，僵直的手指直取你咽喉！（胜可得法宝）',
        battle: 'tiaoshi_x2', special: 'yizhuangReward',
      }],
    },
    {
      label: '烧香跪拜',
      outcomes: [{
        text: '你焚香三炷，叩首而拜。棺中掷出一串铜钱，正中你额角——尸王赏钱，也是逐客。（失 5 血，得 25 灵石）',
        hp: -5, gold: 25,
      }],
    },
  ],
});

// 7. 井底之声 ⚯（chain_jingdi → 幕三「童子重逢」赠稀方）
def({
  id: 'jingdizhisheng', name: '井底之声',
  scene: '荒村枯井，井口结着蛛网，井底却传来若有若无的呼救，声音稚嫩，像个孩子。',
  options: [
    {
      label: '下井',
      outcomes: [
        {
          weight: 60,
          text: '你缒绳而下，救出一名被妖风卷落的童子。他咬破手指在你掌心按了个血印："仙长大恩，来日必报！"（得随机稀有功法）',
          gainCardRarity: 'rare', flag: 'chain_jingdi', flagValue: 1,
        },
        {
          weight: 40,
          text: '绳到一半，井水骤寒——一只惨白的手扣住你的脚踝，指甲抠进肉里，将你狠狠拽入水中！（失 10 血，遭水鬼袭击）',
          hp: -10, battle: 'shuigui',
        },
      ],
    },
    {
      label: '封井离去',
      outcomes: [{ text: '你搬石封井。呼救声戛然而止，可此后每逢夜雨，你总觉得耳边有水声滴答。（心魔 +1）', demon: 1 }],
    },
  ],
});

// 8. 忘川摆渡人（baidu：直接跳至本幕任意未达层；relic 版由 run.ts 先让玩家交出一件法宝）
def({
  id: 'wangchuanbaiduren', name: '忘川摆渡人',
  scene: '雾锁河面，一叶扁舟无桨自行。蓑衣船夫伸出枯瘦的手，声音像船底刮过河沙："渡资——一件重要之物。"',
  options: [
    {
      label: '付 8 年寿元', requireLifespan: 9,
      outcomes: [{
        text: '船夫五指一拢，你鬓边窜起一缕白。扁舟破雾疾行，两岸光阴倒退如流水。（寿元 −8，直渡本幕任意未达层）',
        lifespan: -8, special: 'baidu',
      }],
    },
    {
      label: '付 1 件法宝', requireRelic: true,
      outcomes: [{ text: '船夫收起法宝，藏入蓑衣深处。扁舟破雾疾行，快得连雾都追不上。（直渡本幕任意未达层）', special: 'baidu_relic' }],
    },
    { label: '不渡', outcomes: [{ text: '你退回岸上。雾中传来一声轻叹，似惋惜，又似庆幸。' }] },
  ],
});

// 9. 药园遗址
def({
  id: 'yaoyuanyizhi', name: '药园遗址',
  scene: '断垣之内灵草丛生，药香扑鼻，然青绿瘴气浮沉其间，草叶深处隐见一副白骨——多半也是个贪心的。',
  options: [
    {
      label: '采尽',
      outcomes: [{
        text: '你屏息冒瘴，连根带土采了个干净。满载而归，喉头却泛起一丝挥之不去的腥甜。（得灵草 ×4，丹毒 +1）',
        materials: { lingcao: 4 }, toxin: 1,
      }],
    },
    {
      label: '浅尝辄止',
      outcomes: [{ text: '你掠取外围两株灵草，全身而退。白骨无言，权当谢过前辈让路。（得灵草 ×2）', materials: { lingcao: 2 } }],
    },
  ],
});

// 10. 断碑刻字
def({
  id: 'duanbeikezi', name: '断碑刻字',
  scene: '古道旁一方断碑，碑文残缺过半，然残存笔画间剑意纵横，凝望稍久，眉心便隐隐作痛。',
  options: [
    {
      label: '拓印',
      outcomes: [{ text: '你以宣纸拓下残文，一笔一划临摹入心，剑意豁然贯通。（得「御剑术+」）', gainCardId: 'yujianshu', gainCardUpgraded: true }],
    },
    {
      label: '以血续字（失 8 血）',
      outcomes: [{
        text: '你咬破指尖，循着断处补全最后三划。血迹方干，碑中剑意轰然灌顶，你在剑鸣里站了整整一夜。（失 8 血，得随机金系史诗功法）',
        hp: -8, special: 'jinEpic',
      }],
    },
  ],
});

// 11. 画中仙
def({
  id: 'huazhongxian', name: '画中仙',
  scene: '破庙墙上悬一幅古画，画中美人临水照花，眉目含情，唇瓣微启，似欲唤你的名字。',
  options: [
    {
      label: '入画',
      outcomes: [
        { weight: 34, text: '画中一梦百年，有人为你焚香煮茶。醒来古画已成灰，你却神完气足。（回满气血）', heal: 'full' },
        { weight: 33, text: '入画三步，脂粉气尽褪——满目艳骨森森，美人的脸只剩半张。你夺路狂奔，撞破画纸滚落尘埃。（气血跌至一半）', heal: 'half' },
        { weight: 33, text: '美人不语，只将妆台古镜塞入你手，倏然梦醒，掌心犹温。（得「镜花水月」）', gainCardId: 'jinghuashuiyue' },
      ],
    },
    {
      label: '焚画',
      outcomes: [{
        text: '画轴焚尽，灰烬中滚出几枚灵石。火光将熄时，你分明听见一声极轻的呜咽。（得 30 灵石，心魔 +1）',
        gold: 30, demon: 1,
      }],
    },
  ],
});

// 12. 醉道人 ⚯（chain_zuidao → 幕三「醉道人再遇」赠大还丹方；
//     zuidao 脚本：随机 2 项——上限 +6 / 斩 1 牌 / 得丹方 / 下场战斗气滞 2）
def({
  id: 'zuidaoren', name: '醉道人',
  scene: '一名酒气熏天的道人横躺在路中央，葫芦一晃："小友，陪贫道饮三碗。喝了，便有造化；不喝，也不强求。"',
  options: [
    {
      label: '陪饮三碗',
      outcomes: [{
        text: '三碗下肚，天旋地转，那酒竟似有灵，顺着经脉乱窜。道人大笑着记下了你的名字。（随机两项造化或折磨）',
        special: 'zuidao', flag: 'chain_zuidao', flagValue: 1,
      }],
    },
    { label: '不喝', outcomes: [{ text: '道人摇头，踉跄而去，怀中滚落 10 灵石也浑然不觉。你喊了一声，他摆摆手："买酒钱，替贫道喝。"', gold: 10 }] },
  ],
});

// 13. 香火愿力 ⚯（chain_xianghuo=12 → 本幕 Boss 战开局 +12 土护体；
//     zashen → 本幕「山神残像/石精」必然出现在路径，run.ts 处理）
def({
  id: 'xianghuoyuanli', name: '香火愿力',
  scene: '破庙神像早已无人供奉，金漆剥落，然香炉冷灰之中，犹存一点愿力微光，明明灭灭。',
  options: [
    {
      label: '供奉 20 灵石', requireGold: 20,
      outcomes: [{
        text: '你摆上灵石，添了三炷香。神像的目光似有微动，一缕暖意落在你肩头。（本幕 Boss 战开局 +12 土护体）',
        gold: -20, flag: 'chain_xianghuo', flagValue: 12,
      }],
    },
    {
      label: '砸神像',
      outcomes: [{
        text: '泥胎轰然崩裂，内藏灵石滚落一地。你弯腰去捡，隐约听见一声冷哼自地脉深处传来——这笔账，山神记下了。（得 40 灵石，心魔 +2，本幕山神残像必然拦路）',
        gold: 40, demon: 2, flag: 'zashen', flagValue: 1,
      }],
    },
  ],
});

// 14. 蜃楼幻市（shenlou 脚本：8 折坊市，离开时 30% 幻醒——购得之物消失、灵石退还）
def({
  id: 'shenlouhuanshi', name: '蜃楼幻市',
  scene: '半空之中浮现一座市集，灯火通明，人影憧憧，吆喝声顺风飘来："全场八折——过时不候——"',
  options: [
    { label: '入市购物', outcomes: [{ text: '你踏云而上。货真价实与否，且待离开时分晓。', special: 'shenlou' }] },
    { label: '绕行', outcomes: [{ text: '海市蜃楼，看看便罢。买卖做进幻境里，钱货两空都寻不着人。' }] },
  ],
});

// ==================== 15–22 幕二起 ====================

// 15. 雷击古木
def({
  id: 'leijigumu', name: '雷击古木', minAct: 2,
  scene: '一株遭雷火劈过的古树焦黑矗立，裂口深处雷光隐现，噼啪作响，空气里满是灼木与硝石的气味。',
  options: [
    {
      label: '取雷种（受 10 伤）',
      outcomes: [{
        text: '你探手入裂口，雷光顺臂窜入四肢百骸，剧痛钻心。抽手时，三撮凝而不散的雷砂已握在掌中。（失 10 血，得雷砂 ×3）',
        hp: -10, materials: { leisha: 3 },
      }],
    },
    {
      label: '取木心',
      outcomes: [{ text: '你剖出两截坚逾金铁的木心，入手沉坠，隐有山岳之意。（得 2 张「落石+」）', special: 'muxin' }],
    },
  ],
});

// 16. 无名剑冢
def({
  id: 'wumingjianzhong', name: '无名剑冢', minAct: 2,
  scene: '万剑插土，锈者如林，利者如霜，嗡鸣不止，剑气冲霄。冢前无碑，亦无名。',
  options: [
    {
      label: '拔剑',
      outcomes: [{
        text: '你握住最深处那柄古剑的刹那，万剑齐颤——剑冢遗灵披着断剑残甲拔地而起，剑意如潮压顶！（胜可得「万剑诀」）',
        battle: 'jianzhongyiling', special: 'jianzhongReward',
      }],
    },
    {
      label: '祭拜',
      outcomes: [{ text: '你焚香三拜，万剑齐鸣如应。有一缕剑意随香火入你眉心，缠上你的每一式金行功法。（本局全部金牌 +1 伤）', flag: 'jianji', flagValue: 1 }],
    },
  ],
});

// 17. 放生池 ⚯（chain_fangsheng → 2 层后「鲤跃」：30% 仙品 / 70% 灵品法宝，run.ts 触发）
def({
  id: 'fangshengchi', name: '放生池', minAct: 2,
  scene: '古寺放生池中，一尾金鳞锦鲤浮首吐泡，尾鳍拍水，竟隐隐拍出三短两长——似有灵性，又似在求救。',
  options: [
    {
      label: '买下放生（付 15 灵石）', requireGold: 15,
      outcomes: [{
        text: '你付过香火钱，捧鲤入江。金鳞没入碧波，回首三顾而去——江里游的，未必只是鱼。',
        gold: -15, flag: 'chain_fangsheng', flagValue: 1,
      }],
    },
    {
      label: '捞鱼',
      outcomes: [{
        text: '你把锦鲤捞起烤了，肉香四溢，鱼腹中竟剖出两枚温润的妖丹。只是打那以后，你梦里总有水声绕梁。（得妖丹 ×2，心魔 +1）',
        materials: { yaodan: 2 }, demon: 1,
      }],
    },
  ],
});

// 18. 黄粱一梦
def({
  id: 'huangliangyimeng', name: '黄粱一梦', minAct: 2,
  scene: '道旁一方青草枕，枕畔黄粱将熟未熟，香气袅袅。睡意莫名袭来，眼皮重逾千斤。',
  options: [
    {
      label: '小憩（耗 1 年寿元）', requireLifespan: 2,
      outcomes: [
        {
          weight: 80,
          text: '一梦之中娶妻生子、拜相封侯，醒来黄粱未熟，唯余一身轻松。（寿元 −1，回 25% 气血，下场战斗首回合多抽 2 张）',
          lifespan: -1, special: 'huangliang',
        },
        {
          weight: 20,
          text: '梦到一半变了味——满堂宾客尽成白骨，有个影子坐在你的位置上冲你笑。惊醒时冷汗浸透衣背。（寿元 −1，心魔 +1）',
          lifespan: -1, demon: 1,
        },
      ],
    },
    { label: '赶路', outcomes: [{ text: '修行之人，岂可贪睡。你加快脚步，把那阵香气远远甩在身后。' }] },
  ],
});

// 19. 山神求签（下签：下场战斗开局吐纳 −1，run.ts 以 tunaDown 结算）
def({
  id: 'shanshenqiuqian', name: '山神求签', minAct: 2,
  scene: '山神祠中签筒轻晃，无人自动，三支竹签探头探脑，似在相邀。',
  options: [
    {
      label: '抽一签',
      outcomes: [
        { weight: 25, text: '上上签："紫气东来，福寿绵长。"签文入手即化清光没入眉心。（气血上限 +8）', maxHp: 8 },
        { weight: 50, text: '中签："财帛小聚，不喜不忧。"签筒底下滚出一小袋灵石。（得 20 灵石）', gold: 20 },
        { weight: 25, text: '下下签："出师不利，慎行。"你还没来得及求解，签筒已自己合上了。（下场战斗开局吐纳 −1）', flag: 'xiaqian', flagValue: 1 },
      ],
    },
    { label: '不抽', outcomes: [{ text: '命数天定，何必问签。你拱手一礼，转身出祠。' }] },
  ],
});

// 20. 遗落储物袋
def({
  id: 'yiluochuwudai', name: '遗落储物袋', minAct: 2,
  scene: '一具枯坐百年的前辈遗蜕旁，静静躺着一只乾坤袋，袋口禁制的符光明灭不定，像一只半睁的眼。',
  options: [
    {
      label: '直接拿',
      outcomes: [
        ...matBranch(MATS_X2, 15, (m) => ({
          text: `禁制早已朽了大半，你顺利解开袋口——灵石灵材俱全，收获颇丰。（得 50 灵石与${matText(m)}）`,
          gold: 50, materials: m,
        })),
        { weight: 40, text: '指尖方触袋口，符光暴涨——一道罡气将你掀飞三丈，撞得七荤八素。遗蜕的头，缓缓转向了你。（失 12 血）', hp: -12 },
      ],
    },
    {
      label: '先超度再拿（耗 2 年寿元）', requireLifespan: 3,
      outcomes: matBranch(MATS_X2, 25, (m) => ({
        text: `你趺坐诵经七日，遗蜕含笑化尘，禁制随之而散。乾坤袋中所获与心中安宁，两不相欠。（寿元 −2，得 50 灵石与${matText(m)}）`,
        lifespan: -2, gold: 50, materials: m,
      })),
    },
  ],
});

// 21. 上元灯会（限定皮肤事件；三选一灯谜，谜底「乔」）
def({
  id: 'shangyuandenghui', name: '上元灯会', minAct: 2,
  scene: '山下小镇恰逢上元灯会，人潮如织。一盏走马灯前悬着灯谜："有木便为桥，无木也念乔；去木添个女，娇娇惹人瞧——打一字。"',
  options: [
    {
      label: '答「桥」',
      outcomes: [{ text: '灯主摇头轻笑："谜面里现成的字，可作不得谜底。"塞给你 5 枚灵石作安慰彩头。', gold: 5 }],
    },
    {
      label: '答「乔」',
      outcomes: [{ text: '灯主抚掌："着啊！"从灯架顶上取下一卷压轴彩头，郑重递到你手中。（得「观想五行+」）', gainCardId: 'guanxiangwuxing', gainCardUpgraded: true }],
    },
    {
      label: '答「娇」',
      outcomes: [{ text: '灯主捋须直笑："小友心思，怕是没放在谜上。"塞给你 5 枚灵石作安慰彩头。', gold: 5 }],
    },
  ],
});

// 22. 尸变客栈
def({
  id: 'shibiankezhan', name: '尸变客栈', minAct: 2,
  scene: '荒野孤栈，入夜灯灭。黑暗里，四面八方响起指甲挠地之声，由远及近，不止一处。',
  options: [
    {
      label: '点起火把',
      outcomes: [{
        text: '火光"腾"地亮起——满堂皆尸！掌柜、伙计、邻桌客人，青面獠牙，齐刷刷向你转过头来。（胜可得灵品法宝）',
        battle: 'shiqun', special: 'kezhanReward',
      }],
    },
    {
      label: '破窗而逃',
      outcomes: [{ text: '你抱头撞破窗棂，滚落屋檐，碎木划得满臂血痕，连夜狂奔直入下一程，再不敢回头。（失 6 血）', hp: -6 }],
    },
  ],
});

// ==================== 23–30 幕二/三 ====================

// 23. 老龟问寿
def({
  id: 'laoguiwenshou', name: '老龟问寿', minAct: 2,
  scene: '千年老龟浮出湖面，甲上苔痕斑驳如碑文。它眨着浑浊的眼，口吐人言："小修士，长生——何用？"',
  options: [
    {
      label: '答「守护」',
      outcomes: [{ text: '老龟缓缓颔首："善。守得住的，才配活得久。"甲上剥落一片青玉般的龟甲，浮水送到你面前。（得「玄龟甲」）', gainRelicId: 'xuanguijia' }],
    },
    {
      label: '答「逍遥」',
      outcomes: [{
        text: '老龟大笑三声，湖水为之倒卷："痴儿！逍遥无价，代价也无价！"它吐出一篇吞天之法，你接得手软，心头却莫名多了一分躁动。（得「北冥吞天」入牌库，心魔 +1）',
        gainCardId: 'beimingtuntian', demon: 1,
      }],
    },
    {
      label: '答「不知」',
      outcomes: [{ text: '老龟笑了，皱纹里漾开涟漪："不知即知。老夫活了一千年，也不知。"湖水温润漫过脚踝，涤荡周身。（回满气血）', heal: 'full' }],
    },
  ],
});

// 24. 天书残页
def({
  id: 'tianshucanye', name: '天书残页', minAct: 2,
  scene: '崖壁石匣中供着一页天书拓片，其上文字如活物游动，你每看一眼，它们便换一种排法。',
  options: [
    {
      label: '就地参悟',
      outcomes: [{ text: '你观字入定，任凭文字在识海里游成周天。一夜之间，道行大进。（随机参悟 2 张牌）', upgradeRandom: 2 }],
    },
    {
      label: '撕下带走',
      outcomes: [
        {
          weight: 95,
          text: '拓片入手即化金光没入眉心，一部功法生生烙进识海。可自那以后，你总觉得头顶有什么在看着你记账。（得随机史诗功法，心魔 +2）',
          gainCardRarity: 'epic', demon: 2,
        },
        {
          weight: 5,
          text: '拓片入手即化金光没入眉心——竟是天书正文！传世之法轰然展开，同时有个冰冷的声音在识海深处笑了一声。（得随机传世功法，心魔 +2）',
          gainCardRarity: 'legendary', demon: 2,
        },
      ],
    },
  ],
});

// 25. 心魔来访 ⚯（拒绝 → daolei_minus30=30：最终 Boss 第九道「道雷」气血 −30；
//     接受的心魔 +3 由法宝「心魔种」纳取效果结算，此处不重复计）
def({
  id: 'xinmolaifang', name: '心魔来访', minAct: 2,
  scene: '夜半入定，心魔于识海现身。这一次它不狞笑，只搬了张凳子坐在你对面，笑意温和："给你力量。飞升的时候，咱们再算。"',
  options: [
    {
      label: '接受',
      outcomes: [{
        text: '一粒漆黑种子没入丹田，暖流与寒意同时炸开。心魔起身掸了掸衣角："爽快。到时候，别赖账。"（得劫宝「心魔种」，心魔 +3）',
        gainRelicId: 'xinmozhong',
      }],
    },
    {
      label: '拒绝',
      outcomes: [{
        text: '你一声冷哼："滚。"心魔耸肩隐去，识海霎时清朗如洗。道心愈坚者，天亦让三分——最终「道雷」气血 −30。',
        flag: 'daolei_minus30', flagValue: 30,
      }],
    },
  ],
});

// 26. 蚀月之夜
def({
  id: 'shiyuezhiye', name: '蚀月之夜', minAct: 2,
  scene: '天狗食月，夜色浓稠如墨。四野妖力大盛，嗥叫此起彼伏，连风里都腥了三分。',
  options: [
    {
      label: '连夜赶路',
      outcomes: [{
        text: '妖气最盛之地，妖丹也最肥。你紧了紧行囊，一头扎进这片沸腾的黑暗。（本幕后续敌人 +1 罡气，战斗灵石 +50%）',
        flag: 'shiyue', flagValue: 1,
      }],
    },
    {
      label: '寻地躲避（多耗 2 年寿元）', requireLifespan: 3,
      outcomes: [{
        text: '你寻了处背风山洞蛰伏，听着外头嗥叫渐歇，直到月轮重圆才敢动身。绕是绕开了，路也远了。（寿元 −2）',
        lifespan: -2,
      }],
    },
  ],
});

// 27. 空置洞府
def({
  id: 'kongzhidongfu', name: '空置洞府', minAct: 2,
  scene: '一座前人洞府，主人早已坐化，蒲团上只余一撮香灰，护府阵法却犹自运转，灵光流转如活物。',
  options: [
    {
      label: '炼化阵法',
      outcomes: [{ text: '你以自身灵息浸润阵眼，阵法认主，灵光温顺地缠上你的手腕。洞府为你所用。（免费执行一项洞府行动）', special: 'freeCave' }],
    },
    {
      label: '搜刮而去',
      outcomes: [
        { weight: 80, text: '你翻箱倒柜，搜出一袋灵石，扬长而去。蒲团上的香灰，被你的衣角带散了。（得 35 灵石）', gold: 35 },
        { weight: 20, text: '你刚揣起灵石袋，地砖轰然翻起——护府傀儡破土而出，独眼灯芯般亮起："窃、贼。"（得 35 灵石，遭傀儡截杀）', gold: 35, battle: 'jinjiakuilei' },
      ],
    },
  ],
});

// 28. 游方货郎（huolang 脚本：3 件随机凡品法宝 50–70 灵石 + 1 份丹方；
//     cheap = 全场 8 折 / expensive = 涨价 10%）
def({
  id: 'youfanghuolang', name: '游方货郎', minAct: 2,
  scene: '一名货郎摇着拨浪鼓迎面而来，扁担两头琳琅满目："仙家小玩意——件件有来历，个个能保命——"',
  options: [
    { label: '看货', outcomes: [{ text: '货郎眉开眼笑地放下担子，麻利地铺开一块蓝布。（三件凡品法宝与一份丹方待售）', special: 'huolang' }] },
    {
      label: '还价',
      outcomes: [
        { weight: 30, text: '货郎一拍大腿："成交！瞧您是行家，全场八折！"', special: 'huolang_cheap' },
        { weight: 70, text: '货郎脸一冷，拨浪鼓也不摇了："爱买不买。"抬手把价签统统翻了一成。', special: 'huolang_expensive' },
      ],
    },
  ],
});

// 29. 童子求救
def({
  id: 'tongziqiujiu', name: '童子求救', minAct: 2,
  scene: '一名道童连滚带爬地扑到你脚边，发髻散了半边，嗓子都喊哑了："仙长救命！家师被妖物困在山坳里了！"',
  options: [
    {
      label: '随他去救',
      outcomes: [{
        text: '你随童子赶至山坳，妖气扑面而来，浓得化不开——困住他师尊的，不是善茬。（精英战；胜后其师尊必有重谢）',
        battleElite: true, special: 'tongziReward',
      }],
    },
    {
      label: '摇头拒绝',
      outcomes: [{ text: '"仙长——仙长！"哭喊声在身后渐远。你脚步没停，心口却像压了块洗不掉的石头。（心魔 +2）', demon: 2 }],
    },
  ],
});

// 30. 炸炉现场
def({
  id: 'zhalu_xianchang', name: '炸炉现场', minAct: 2,
  scene: '前方丹房轰然炸响，屋顶掀上了天。浓烟滚滚，遍地药渣犹自冒着五色烟气，一名炼丹师埋在瓦砾中呻吟。',
  options: [
    {
      label: '捡丹渣',
      outcomes: matBranch(MATS_X3, 25, (m) => ({
        text: `你蹲在废墟里扒拉，捡出不少尚可入药的灵材，五色烟气也顺便吸了个饱。（得${matText(m)}，丹毒 +1）`,
        materials: m, toxin: 1,
      })),
    },
    {
      label: '救炼丹师（失 8 血）',
      outcomes: [{
        text: '你搬开滚烫的瓦砾，被余火燎了满手燎泡。丹师涕泪横流："恩公！日后天下坊市，丹方你只管报我的名号！"（失 8 血，本局坊市丹方 6 折）',
        hp: -8, flag: 'danshi', flagValue: 1,
      }],
    },
  ],
});

// ==================== 内置事件（noPool，由 run.ts 择机插入） ====================

// 31. 劫云压顶（§9.2：进入 Boss 节点前弹出，每幕限 1 次——限次由 run.ts 控制）
def({
  id: 'jieyun', name: '劫云压顶', noPool: true,
  scene: '前路尽头，劫云盘踞如山，电蛇在云腹里游走，压得群山噤声。此关一入，再无回头路。',
  options: [
    {
      label: '原地闭关（燃 2 年寿元，回 20 血）', requireLifespan: 3,
      outcomes: [{ text: '你就地趺坐，燃寿养伤。劫云在头顶滚了两年，你睁眼时，伤势已复了大半。（寿元 −2，回 20 血）', lifespan: -2, heal: 20 }],
    },
    {
      label: '直入劫云',
      outcomes: [{ text: '你整了整衣冠，一步踏入云影。既问长生，何惧一劫。' }],
    },
  ],
});

// 32. 狐妖再会（chain_linghu 下集：救狐两幕后触发）
def({
  id: 'linghu_return', name: '狐妖再会', noPool: true,
  scene: '月下一名白衣女子拦路而立，眉眼间三分狐媚，七分郑重。她抬起手腕，一道旧疤白如霜线："恩公，可还记得山中铁夹？"',
  options: [
    {
      label: '受她一礼',
      outcomes: [{
        text: '她敛衽下拜，指间灵光凝成一件宝物，不由分说塞进你怀里："山野之物，报山野之恩。"言罢化作白虹，没入月色。（得随机灵品法宝）',
        gainRelicGrade: 'ling',
      }],
    },
  ],
});

// 33. 童子重逢（chain_jingdi 下集：幕三触发；jingdiRecipe 脚本 = 随机稀方丹方）
def({
  id: 'jingdi_return', name: '童子重逢', noPool: true,
  scene: '一名眉心生角的小妖仙驾云拦路，看清你的脸，眼睛倏地亮了："仙长！井底那个——是我呀！"当年掌心的血印，犹有微光。',
  options: [
    {
      label: '道贺',
      outcomes: [{
        text: '小妖仙掏出一卷丹方，双手奉上，耳根通红："修行界头一课便是有恩必报。这方子，我偷师……呃，学了很久！"（得随机稀方丹方）',
        special: 'jingdiRecipe',
      }],
    },
  ],
});

// 34. 醉道人再遇（chain_zuidao 下集：幕三触发）
def({
  id: 'zuidao_return', name: '醉道人再遇', noPool: true,
  scene: '还是那个酒气熏天的道人，还是横躺在路中央。他眯眼打量你半晌，忽地坐起："咦——是你小子！当年三碗酒，喝得爽快！"',
  options: [
    {
      label: '与他见礼',
      outcomes: [{
        text: '道人从怀里摸出一卷油渍斑斑的丹方拍在你手心："大还丹！贫道压箱底的方子，抵当年的酒钱！"言罢打着酒嗝，飘然而去。（得「大还丹」丹方）',
        gainRecipe: 'dahuandan',
      }],
    },
  ],
});

// ==================== 池与查询 ====================

/**
 * 事件池：按幕过滤（minAct ≤ act），noPool 与已用事件不入池；权重均等，掷骰在 run.ts。
 * 分幕与 §10 尾注一致：1–14 通用（无 minAct）；15–30 幕二/三（minAct: 2）。
 */
export function eventPool(act: 1 | 2 | 3, usedIds: string[]): EventDef[] {
  return Object.values(EVENTS).filter((e) => {
    if (e.noPool) return false;
    if (usedIds.includes(e.id)) return false;
    return (e.minAct ?? 1) <= act;
  });
}

export function getEvent(id: string): EventDef {
  const e = EVENTS[id];
  if (!e) throw new Error(`未知事件: ${id}`);
  return e;
}

/**
 * ── run.ts 集成清单（special 脚本，事件侧只声明）──
 *   gongde        枯庙施舍：清空全部灵石；下 3 场战斗开局吐纳 +1（run.gongdeBattles = 3）
 *   dushi         赌石连切：每刀扣 50 灵石，40% 空 / 40% +80 灵石 / 20% 随机法宝；
 *                 可反复再切（灵石足够时），第二刀起每多一刀心魔 +1
 *   baidu         忘川渡层：跳至本幕任意未达层（寿元 −8 已写在 outcome）
 *   baidu_relic   同上，但先让玩家交出 1 件法宝作渡资
 *   jinEpic       断碑续字：得 1 张随机金系史诗牌
 *   zuidao        醉道人：随机 2 项——上限 +6 / 斩 1 牌 / 得随机丹方 / 下场战斗气滞 2
 *   shenlou       蜃楼幻市：进入 8 折坊市；离开时 30% 幻醒（购得之物消失、灵石退还）
 *   muxin         雷击古木：得 2 张「落石+」（luoshi，参悟态）
 *   huangliang    黄粱一梦：回 25% 气血；下场战斗首回合多抽 2 张
 *   freeCave      空置洞府：进入免费洞府（CaveScreen.free = true，仅 1 项、不耗寿元）
 *   huolang / huolang_cheap / huolang_expensive
 *                 货郎摊：3 件随机凡品法宝（50–70 灵石）+ 1 份丹方；cheap ×0.8 / expensive ×1.1
 *   zouhuoReward  走火入魔胜利：得随机史诗牌
 *   yizhuangReward 义庄胜利：得随机法宝
 *   jianzhongReward 剑冢胜利：得「万剑诀」（wanjianjue）
 *   kezhanReward  客栈胜利：得随机灵品法宝
 *   tongziReward  童子求救胜利：得法宝（仙品 40% / 灵品 60%）
 *   jingdiRecipe  童子重逢：得随机稀方（RecipeDef.rare）丹方
 *
 * ── 因果链 flag（事件设置 → run.ts 触发下集/结算）──
 *   chain_linghu=1      两幕后插入 noPool 事件 linghu_return
 *   chain_jingdi=1      幕三插入 noPool 事件 jingdi_return
 *   chain_zuidao=1      幕三插入 noPool 事件 zuidao_return
 *   chain_xianghuo=12   本幕 Boss 战开局 +12 土护体
 *   chain_fangsheng=1   2 层后「鲤跃」：30% 仙品 / 70% 灵品法宝（run.ts 直接结算，无事件）
 *   daolei_minus30=30   最终 Boss 第九道「道雷」气血 −30
 *
 * ── 辅助 flag ──
 *   zashen=1   本幕「山神残像/石精」必然出现在路径
 *   jianji=1   本局全部金牌 +1 伤
 *   xiaqian=1  下场战斗开局吐纳 −1（tunaDown 1）
 *   shiyue=1   本幕后续敌人 +1 罡气，战斗灵石 +50%
 *   danshi=1   本局坊市丹方 6 折
 */
