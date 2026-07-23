/**
 * 成就（策划案 §11.5，20 项）
 * check 在结算/关键节点时基于 Profile 与 RunState 统计判定。
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
  { id: 'yijianpowanfa', name: '一剑破万法', text: '单次攻击 ≥60 伤' },
  { id: 'dadaozhijian', name: '大道至简', text: '卡组 ≤12 通关' },
  { id: 'baidubuqin', name: '百毒不侵', text: '一局未受任何诅咒通关' },
  { id: 'yaodaobingchu', name: '药到病除', text: '一局使用 10 枚丹药' },
  { id: 'qiankunzaishou', name: '乾坤在手', text: '图鉴法宝集齐' },
  { id: 'wanxianggengxin', name: '万象更新', text: '图鉴功法集齐' },
  { id: 'xiangyaochumo', name: '降妖除魔', text: '妖怪册集齐' },
  { id: 'shenwaihuashen', name: '身外化身', text: '心魔战不掉血通过相变阶段' },
  { id: 'jiutianlanyue', name: '九天揽月', text: '九重天通关' },
  { id: 'tianjibukexie', name: '天机不可泄露', text: '每日天机进当日前 10%' },
  { id: 'zhuanshichongxiu', name: '转世重修', text: '累计 10 局' },
  { id: 'wendaobainian', name: '问道百年', text: '累计 100 局' },
  { id: 'feishengsanci', name: '飞升三次', text: '3 角色各通关' },
  { id: 'bairifeisheng', name: '白日飞升', text: '首次渡过九重天劫' },
  { id: 'wuqingdao', name: '无情道', text: '全程不参悟任何牌通关' },
];
