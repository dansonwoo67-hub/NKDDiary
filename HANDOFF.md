# NKD Diary 项目交接说明

## 1. 项目定位

这是一个仅供两名固定用户使用的私人情侣日记网页。

核心目标：
- 功能参考 CoupleOS；
- 桌面端视觉高度参考 CoupleOS；
- 去除邀请、配对、关系绑定、公开社交等属性；
- 只做桌面网页，不做移动端；
- 不商用，不公开运营。

## 2. 当前技术栈

- Next.js
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Vitest
- Vercel

## 3. 当前 Git 状态

当前分支：

codex/coupleos-phase-2-space-permissions

当前工作区已保存，最近一次确认状态为：

nothing to commit, working tree clean

## 4. 已确认的功能规则

### 日记
- 每位用户每天最多发布一篇普通日记；
- 两个人同一天可以各自发布一篇；
- 日记标题可以为空；
- 每篇日记最多上传一张照片；
- 图片上传前压缩；
- 日记发布后24小时内，原作者可以编辑或删除；
- 超过24小时后锁定；
- 另一位用户只能查看、评论、正文评注和回复；
- 另一位用户不能编辑或删除对方日记。

### 未来日记
- 保留现有未来日记功能；
- 未来日记不占未来日期的普通日记额度；
- 必须融入 CoupleOS 风格页面。

### 评论
- 普通评论最多200个用户可见字符；
- 支持文字和 Emoji；
- 评论作者24小时内可以编辑或删除；
- 超过24小时后锁定；
- 保留正文评注和评注回复。

### 心情
- 每天发布次数不限；
- 每条最多15个用户可见字符；
- 支持文字和 Emoji 混合；
- 不允许照片；
- 发布者24小时内可以编辑或删除；
- 超过24小时后锁定。

### 回忆
- 自动聚合日记、日记照片、未来日记和日历事件；
- 支持年份、月份筛选；
- 支持正序和倒序；
- 不重复保存照片；
- 不要收藏、点赞、标签或公开分享。

### 日历
- 支持标题、描述、开始时间、结束时间、全天事件、类型、地点、重复规则；
- 支持新建、查看、编辑、删除；
- 创建者可以编辑和删除；
- 另一位用户默认只能查看；
- 日历不能上传照片。

### 设置
- 网站名称；
- 昵称；
- 头像；
- 在一起日期；
- 时区；
- 主题；
- 修改密码；
- 退出登录。

默认时区继续使用：

Asia/Shanghai

## 5. 必须删除的功能

- 前台注册；
- 邀请伴侣；
- 邀请码；
- 配对；
- 关系绑定；
- 搜索用户；
- 好友；
- 关注；
- 粉丝；
- 公开主页；
- 公开分享；
- 点赞；
- 收藏；
- 标签；
- 排行榜；
- 会员；
- 广告；
- AI关系分析；
- 数据下载和导出。

## 6. 视觉要求

- 只做桌面端；
- 主要视口：1440×900、1280×800；
- 页面布局、卡片、留白、配色、字体层级、圆角、阴影、按钮、输入框、导航、Modal、空状态、加载状态都要高度参考 CoupleOS；
- 不使用 CoupleOS Logo、名称、商标、专属插画或源代码；
- 不允许使用默认后台模板风格；
- 不允许只做“类似风格”；
- 必须通过真实 CoupleOS 页面截图逐页对比。

## 7. 当前已生成的重要文件

- docs/coupleos-parity/REFERENCE_AUDIT.md
- docs/coupleos-parity/PERFORMANCE_AUDIT.md
- docs/coupleos-parity/STORAGE_BUDGET.md
- src/app/robots.ts
- supabase/migrations/202607250001_add_private_space_membership.sql
- docs/audits/2026-07-10-smoothness/01-login.png
- docs/audits/2026-07-10-smoothness/02-home.png

## 8. 当前阶段

Codex 在以下阶段中断：

coupleos-phase-2-space-permissions

需要先检查：
- 当前分支；
- 最近提交；
- migration 是否已执行；
- 两个固定账号和私人空间权限是否已完成；
- 当前项目是否能通过 lint、TypeScript、build 和测试；
- 已完成页面和未完成页面。

## 9. 下一步建议

下一位开发工具或开发者不得直接继续修改。

必须先执行：

1. git status
2. git log -5 --oneline
3. 阅读本文件
4. 阅读 docs/coupleos-parity 下全部文档
5. 检查当前 migration
6. 运行 lint
7. 运行 TypeScript 检查
8. 运行 build
9. 运行测试
10. 启动项目并检查实际页面

然后输出：
- 已完成内容；
- 半完成内容；
- 未开始内容；
- 当前报错；
- 下一项最小可执行任务。

不得重新初始化项目。
不得删除已有数据。
不得修改 .codex/config.toml。
不得修改 Codex 模型或 API 配置。
