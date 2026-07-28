export interface DailyTip {
  text: string;
  emoji: string;
}

const TIPS: DailyTip[] = [
  { text: "今日宜给她点杯奶茶，备注少冰多爱。", emoji: "🧋" },
  { text: "今日不宜凶她，旧账今天不上班。", emoji: "🙅" },
  { text: "今日宜主动抱抱，不必等谁先低头。", emoji: "🤗" },
  { text: "今日宜分享一首喜欢的歌，让旋律连接彼此。", emoji: "🎵" },
  { text: "今日不宜冷战，给对方一个台阶也是给自己。", emoji: "🛤️" },
  { text: "今日宜准备一份小惊喜，生活需要仪式感。", emoji: "🎁" },
  { text: "今日宜认真倾听，让对方感受到被重视。", emoji: "👂" },
  { text: "今日不宜计较输赢，感情里没有对错。", emoji: "⚖️" },
  { text: "今日宜一起做饭，烟火气是最好的情话。", emoji: "🍳" },
  { text: "今日宜放下手机，专心陪对方一会儿。", emoji: "📱" },
  { text: "今日宜写封信，文字比说话更温柔。", emoji: "✉️" },
  { text: "今日不宜翻旧账，活在当下最重要。", emoji: "📜" },
  { text: "今日宜夸赞对方，每个人都需要被肯定。", emoji: "🌟" },
  { text: "今日宜一起散步，聊聊最近的小事。", emoji: "🚶" },
  { text: "今日不宜拖延，想到什么就去做。", emoji: "⏰" },
  { text: "今日宜送对方一朵花，不一定非要节日。", emoji: "🌸" },
  { text: "今日宜看一部老电影，回忆初识的时光。", emoji: "🎬" },
  { text: "今日不宜抱怨，多想想对方的好。", emoji: "😊" },
  { text: "今日宜学对方的口头禅，让彼此更亲近。", emoji: "🗣️" },
  { text: "今日宜一起做运动，健康是爱的基础。", emoji: "🏃" },
  { text: "今日不宜熬夜，好好休息才能好好爱。", emoji: "😴" },
  { text: "今日宜给对方起个可爱的昵称。", emoji: "💕" },
  { text: "今日宜一起吃早餐，开启美好的一天。", emoji: "🍞" },
  { text: "今日不宜急躁，慢慢来比较快。", emoji: "🐢" },
  { text: "今日宜记录一件开心的小事。", emoji: "📝" },
  { text: "今日宜一起玩游戏，输赢不重要。", emoji: "🎮" },
  { text: "今日不宜忽略细节，爱是藏在小事里的。", emoji: "🔍" },
  { text: "今日宜给对方一个晚安吻。", emoji: "💤" },
  { text: "今日宜计划一次短途旅行。", emoji: "🗺️" },
  { text: "今日不宜太严肃，偶尔幼稚一下也很好。", emoji: "🥳" },
  { text: "今日宜一起看星星，许下一个小愿望。", emoji: "⭐" },
  { text: "今日宜做对方爱吃的菜。", emoji: "👩🍳" },
  { text: "今日不宜把情绪带回家，工作和生活分开。", emoji: "🏠" },
  { text: "今日宜赞美对方的穿搭。", emoji: "👗" },
  { text: "今日宜一起逛超市，感受柴米油盐的幸福。", emoji: "🛒" },
  { text: "今日不宜比较，每个人的节奏都不同。", emoji: "🌈" },
  { text: "今日宜给对方一个惊喜的拥抱。", emoji: "💖" },
  { text: "今日宜一起读书，分享各自的感悟。", emoji: "📚" },
  { text: "今日不宜逃避问题，面对才能解决。", emoji: "💪" },
  { text: "今日宜一起听雨声，享受安静的时光。", emoji: "🌧️" },
  { text: "今日宜学会道歉，认错不是丢人的事。", emoji: "🙇" },
  { text: "今日宜一起拍照，记录当下的美好。", emoji: "📸" },
  { text: "今日不宜太忙碌，留一点时间给彼此。", emoji: "⏳" },
  { text: "今日宜给对方按摩一下肩膀。", emoji: "💆" },
  { text: "今日宜一起看日落，感受时间的温柔。", emoji: "🌅" },
  { text: "今日不宜自我中心，多考虑对方的感受。", emoji: "🤔" },
  { text: "今日宜一起做手工，享受创造的乐趣。", emoji: "✂️" },
  { text: "今日宜一起看烟花，许下美好的愿望。", emoji: "🎆" },
  { text: "今日不宜焦虑，相信一切都会好起来。", emoji: "🌈" },
];

export function getDailyTip(dateStr?: string): DailyTip {
  const date = dateStr ? new Date(dateStr) : new Date();
  
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  const hash = (year * 10000 + month * 100 + day) % TIPS.length;
  
  return TIPS[hash];
}
