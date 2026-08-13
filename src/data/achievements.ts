/**
 * 成就（策划案 v3 §11.5，恰 20 项）
 * 判定在结算/关键节点时基于 Profile 与 RunState 统计进行（profileLogic / run.ts）。
 * v3 变更：删除 v2 的 baidubuqin/wendaobainian/feishengsanci/wuqingdao；
 *          新增 shouxinruyu/bigushanren/randengzhe/yinuoqianjin；
 *          一剑破万法提至 ≥80 伤、大道至简收紧至 ≤10 张。
 */

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'chukui', name: '初窥门径', text: '首次突破筑基' },
  { id: 'jindandadao', name: '金丹大道', text: '首次通关' },
  { id: 'sanjieqidu', name: '三劫齐渡', text: '一局内无伤渡三道筑基劫雷' },
  { id: 'wuleihongding', name: '五雷轰顶', text: '单场对敌施加 25 层灼烧' },
  { id: 'zhoutianyuanman', name: '周天圆满', text: '一局触发 5 次五行周天' },
  { id: 'yijianpowanfa', name: '一剑破万法', text: '单次攻击 ≥80 伤' },
  { id: 'dadaozhijian', name: '大道至简', text: '卡组 ≤10 张通关' },
  { id: 'shouxinruyu', name: '守心如玉', text: '全程心魔 0 通关' },
  { id: 'bigushanren', name: '辟谷仙人', text: '全程不服丹通关' },
  { id: 'randengzhe', name: '燃灯者', text: '一局累计燃寿 ≥30 年并通关' },
  { id: 'yaodaobingchu', name: '药到病除', text: '一局服丹 10 枚' },
  { id: 'yinuoqianjin', name: '一诺千金', text: '单局走完全部 6 条因果链的善份' },
  { id: 'qiankunzaishou', name: '乾坤在手', text: '图鉴法宝集齐' },
  { id: 'wanxianggengxin', name: '万象更新', text: '图鉴功法集齐' },
  { id: 'xiangyaochumo', name: '降妖除魔', text: '妖怪册集齐' },
  { id: 'shenwaihuashen', name: '身外化身', text: '心魔战不掉血通过相变阶段' },
  { id: 'jiutianlanyue', name: '九天揽月', text: '九重天通关' },
  { id: 'tianjibukexie', name: '天机不可泄露', text: '每日天机进当日前 10%' },
  { id: 'zhuanshichongxiu', name: '转世重修', text: '累计 10 局' },
  { id: 'bairifeisheng', name: '白日飞升', text: '首次渡过九重天劫' },
];
