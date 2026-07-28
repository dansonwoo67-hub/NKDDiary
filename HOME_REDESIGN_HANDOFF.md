# 首页结构版 V2 交接说明

本版根据首页定稿继续修正：

- 顶部不再出现“提醒”文字。
- 未读动态仅显示分类图标与数字角标：信件、回忆、心情、评论。
- 多种未读同时存在时横向并排。
- 点击图标会把对应的首条动态标记为已读并进入对应页面，数字逐条递减。
- 首页桌面端改为左右等宽栅格。
- 顶部“在一起时间”和“文字心情”对齐。
- 左侧地理距离、接下来与右侧最近回忆线形成上下边界一致的视觉结构。
- 移除首页额外的未来日记卡，避免破坏定稿结构和左右平衡。
- 完整月历继续保留在首页最下方。

心情规则未改动：

- 首页心情是 15 个字符以内的文字记录，会进入最近回忆线。
- 日记中的 emoji 心情只属于日记，不进入回忆线。

## 本机验证

请保留你原项目中的 `.env.local`，覆盖代码后运行：

```bat
npm install
npm test
npm run lint
npm run build
npm run dev
```

当前打包环境无法完成依赖安装，因此本版没有声称 npm 测试、lint 或 build 已通过。


## V3 desktop ratio adjustment
- Home dashboard desktop grid changed from 1:1 to 3:7.
- Left column keeps an 18rem minimum width; right column receives the remaining reading space.
- Mobile/tablet behavior remains single-column until the existing 64rem breakpoint.

## V5 修复
- 首页文字心情提交时显示“正在保存…”，按钮与输入框锁定，避免重复提交。
- 保存成功显示“心情已记下。”并清空输入框；失败显示服务器返回的错误提示。
- 首页最近故事线按真实 `created_at` 倒序，最新提交固定在最上方；不再受回忆发生日期的中午占位时间干扰。
- 首页心情卡取消强制高度和与左侧卡片齐高，按内容自然收缩。
