export const DAILY_INSIGHTS = [
  "亲密关系里，稳定的回应比盛大的承诺更有力量。",
  "爱不是猜中对方所有心事，而是愿意多问一句：你今天还好吗？",
  "好的关系会让人变小孩，也会让人更勇敢地长大。",
  "争吵后的修复，常常比不争吵更能决定关系的温度。",
  "被认真听见，是很日常、也很奢侈的浪漫。",
  "想念不是距离的反义词，回应才是。",
  "长期相爱，是把很多普通日子过成只属于两个人的暗号。",
];

export function getDailyInsight(date: Date) {
  const index = Math.abs(date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate()) % DAILY_INSIGHTS.length;
  return DAILY_INSIGHTS[index];
}
