# CoupleOS 对标审计

审计日期：2026-07-24；2026-07-25 复核  
范围：现有仓库、Supabase migrations/RLS、当前本地真实页面、CoupleOS 官方真实桌面页面。  
边界：仅审计和文档；未修改 UI、业务代码、数据库、migration 或线上数据。

## 1. 证据与限制

- 官方入口：`https://coupleos.com/`
- 官方登录页：`https://coupleos.com/auth/login`
- 当前登录页：`http://localhost:3000/login`
- 同视口截图：
  - `.reference/coupleos/desktop-1440/02-login.png`
  - `.reference/coupleos/desktop-1280/01-login.png`
  - `.reference/current/desktop-1440/01-login.png`
  - `.reference/current/desktop-1280/01-login.png`
- 2026-07-25 已重新启动本地 Next.js 开发服务器并复核 `/login`；页面返回 200，未登录 `/` 返回 307 到 `/login`。
- 2026-07-25 再次直接打开 CoupleOS 官方登录 URL，页面标题为 `CoupleOS — A couples app for memories, calendar & journal`；参考截图与当前在线登录页一致。
- 未获得 CoupleOS 认证后会话，因此不能把营销页或记忆当作其登录后首页、Journal、Memories、Calendar、Mood、Settings 的真实视觉证据；这些页面等待可访问会话或用户截图。
- 本轮未用项目账号登录，避免写入真实业务数据；登录后行为结论来自代码、migration、RLS 与已有测试。
- 仓库无 `AGENTS.md`。
- Git 基线：`main` 相对 `origin/main` ahead 5、behind 1；开始前已有未跟踪 `desktop.ini` 与 `docs/audits/`，均未改动。

## 2. 页面映射

| 目标页/模块 | 当前路由/实现 | 审计结论 |
|---|---|---|
| 登录 | `/login` | 邮箱密码、无注册；缺忘记密码和密码显隐；视觉差异明显 |
| 全局外壳 | `(app)/layout.tsx` 顶部胶囊导航 | 尚无真实 CoupleOS 登录后证据可对照 |
| 首页 | `/` | 距离、在一起天数、今日新知、月历；缺核心内容聚合 |
| Journal 列表 | 无 | 缺失 |
| Journal 新建/编辑 | `/write` 每日信 | 每人每日一篇、24h 编辑窗口已部分实现；数据语义不同 |
| Journal 详情 | `/letters/[date]` | 有展信、正文评注、回复；缺普通评论、照片、标题、完整元数据 |
| Future Journal | 无可运行代码/表 | 缺失；现有设计文档不等于现有功能 |
| Memories | 无 | 缺失 |
| Calendar | `/calendar` | 月视图和简单新增；字段与 CRUD 不完整 |
| Mood | 无 | 缺失 |
| Settings | `/settings` | 仅昵称头像；缺站名、伴侣、纪念日、时区、主题、密码 |
| 普通评论 | 无表/页面 | 缺失 |
| 正文评注 | Journal 详情内 | 已实现创建与展示，必须保留数据 |
| 评注回复 | Journal 详情内 | 已实现创建与展示，必须保留数据 |
| 通知 | 全局铃铛+表 | 可作为私密互动提示保留 |

## 3. 功能差异矩阵

| 模块 | 当前真实行为 | 用户规则/最终行为 | DB | 迁移风险 |
|---|---|---|---|---|
| 登录 | Supabase 邮箱密码；无注册 | 两个预建账号；保留忘记密码；禁止注册/邀请/配对 | 否 | 低 |
| 私人空间 | 仅靠 JWT `nkd_diary_member=true`；无 `space_id` | 固定空间+两名成员；所有业务按空间和成员授权 | 是 | 高 |
| 普通日记 | `letters`：正文、三滑块、七字引子、位置；每人每日唯一 | 可选标题、正文、日期/时间、最多一图、24h 锁定 | 是 | 高 |
| 日记权限 | update 有作者+24h RLS；无 delete | 作者 24h 内编辑/删；对方永不编辑；三层限制 | 是 | 中 |
| Future Journal | 不存在 | 解锁前隐藏、解锁后共读，不占普通日记额度 | 是 | 高 |
| 普通评论 | 不存在 | 200 grapheme；作者 24h 改删；日记锁后仍可新增 | 是 | 高 |
| 正文评注 | 创建/展示；上限 2000；RLS 允许作者永久 update，UI 无管理 | 保留数据；管理规则差异先逐页确认 | 是 | 中 |
| 评注回复 | 创建/展示；无 update/delete policy | 保留数据；作者只管理自己 | 是 | 中 |
| Mood | 不存在 | 每天多条、统一 15 grapheme、作者 24h 改删 | 是 | 高 |
| Memories | 不存在 | 查询聚合，年月筛选/排序；不复制图片 | 查询为主 | 中 |
| Calendar | name/date/recurrence/icon/color；无完整编辑删除 | 完整字段、CRUD、全天/范围/地点/类型/重复 | 是 | 高 |
| Settings | 昵称、公开头像 URL、登录位置；站名写死 | 站名、双方资料、纪念日、Asia/Shanghai、主题、密码 | 是 | 高 |
| 头像 | public bucket、2MB、无压缩、永久 URL | 512px/150KB、仅当前头像；本轮只报告风险 | Storage | 高 |
| SEO | 无 robots metadata/robots.txt | noindex、nofollow、禁止抓取、无 sitemap | 否 | 低 |
| 下载/分享 | 当前无导出 | 保持无主动下载/导出/永久公开图片地址 | 否/Storage | 中 |

## 4. 登录页真实视觉令牌

以下来自 1280×800 真实渲染的 computed style 与元素边界。

| 令牌 | CoupleOS | 当前项目 | 对标决定 |
|---|---:|---:|---|
| 表单有效宽 | 383px | 334.67px（外卡 400px） | 输入/按钮约 383px |
| 卡片 | 约 448px；32px；实体暖白 | 400×436；32px；半透明暖白+blur | 去玻璃拟态，改实体暖白 |
| H1 | Newsreader/Georgia；24/32；600 | system sans；30/36；600 | 用许可 serif 近似排版 |
| 输入 | 383×49；24px；16px；白80%；淡黄边 | 334.67×45.33；16px；14px；白70%；褐边 | 对齐目标尺寸、圆角与字号 |
| 主按钮 | 383×48；pill；18/28；500；红→橙 | 334.67×48；pill；16px；深褐 | 保留目标比例，用本站品牌令牌 |
| 背景 | 暖奶油底，极轻粉暖光 | 黄/蓝 radial gradient+纸色 | 降低渐变和纹理 |
| 返回入口 | 有，14px | 无 | 增加安全的返回/品牌层级 |
| 品牌符号 | CoupleOS 粉色 Logo | `NKD DIARY` 文字 | 使用本站自有符号，禁止复制 Logo |
| 忘记密码 | 有，标签行右侧 | 无 | 增加 Supabase reset 流程 |
| 密码显隐 | 16×24 图标按钮 | 无 | 增加可访问控件 |
| 注册/条款 | 官方有 Create one、terms/privacy | 无 | 注册继续删除；不照搬营销尾注 |
| 阴影 | 极轻边界/柔光 | `0 22px 80px rgba(83,61,43,.14)` | 明显减轻 |

### 当前优点

1. 没有注册、邀请、配对或第三方登录。
2. 邮箱/密码有可见标签，单列路径清楚。
3. 错误文案简短且有独立容器。
4. 1280/1440 均无布局破坏。

### 主要问题与可访问性风险

1. 当前缺 CoupleOS 的返回入口、符号、serif 标题、副文案和辅助动作层级。
2. 表单窄约 48px，输入矮约 4px，标题反而更大。
3. 半透明、蓝黄渐变和 80px 阴影与真实页面的安静实体卡不符。
4. 缺忘记密码和密码显隐。
5. 未见明确 `focus-visible`、错误 `aria-live`；键盘、缩放、对比度和读屏仍需实测，截图不能证明 WCAG 合规。

## 5. 数据库与安全风险

1. **缺 space_id（高）**：任何误标 `nkd_diary_member=true` 的第三方账号可读取全部核心表。
2. **公开头像 Bucket（高）**：`avatars` 为 public，代码调用 `getPublicUrl`；本轮未改。
3. **核心模型缺失（高）**：普通评论、Mood、Future Journal、日记图片都不存在。
4. **letters 旧字段强非空（高）**：三个 slider 和 seven_char_line 不能直接删除，需兼容迁移。
5. **删除权限缺失（中）**：日记、评注、回复、事件无 delete policy/grant。
6. **评注权限差异（中）**：annotations 可永久 update，回复不可 update/delete，均与待确认规则不同。
7. **头像孤立对象（中）**：格式变化会改变扩展名并可能遗留旧文件。
8. **Unicode 计数（中）**：当前使用 JS length/数据库 char_length，不满足组合 Emoji grapheme。
9. **读月历产生写副作用（中）**：事件×用户逐条查/插通知，存在串行 N+1。
10. 环境审计只读取变量名，没有输出 secret 值。

### 迁移原则

- 只新增可回滚 migration，不编辑已执行 migration。
- 先新增 nullable/安全默认字段，再回填、验证、加约束。
- 建立 `spaces`/`space_members`，确认两成员后再切换全部 RLS。
- Bucket 私有化单独确认，先验证现有对象和 URL 的兼容方案。
- 不清空任何表或 Storage。

## 6. 附件差异归档

- 站名：当前多处硬编码，需配置化。
- 时区：保持 Asia/Shanghai。
- 日记每日额度：已有 `unique(author_id, letter_date)` 基础，但表语义仍不同。
- Future Journal：当前未实现，不能误报为已保留。
- 标题、普通评论、Mood、Memories：当前模型缺失。
- 正文评注/回复：已有，数据必须保留。
- Calendar：只有简化字段和新增/查看。
- Settings：首页核心聚合、SEO 保护均不完整。
- public 头像风险：仅报告，等确认。
- 移动端：未分析、未开发。
- README/部署文档：未覆盖。

## 7. 待逐页确认

1. 登录页
2. 全局页面外壳和导航
3. 首页
4. Journal 列表
5. Journal 新建和编辑
6. Journal 详情
7. 普通评论
8. 正文评注和回复
9. Future Journal
10. Memories
11. Calendar
12. Mood
13. Settings
14. 性能优化

## 8. 本轮唯一确认项：登录页

### 准备修改

- 保留 Supabase 邮箱密码 Server Action 和未登录保护。
- 对齐 CoupleOS 的桌面结构、383px 表单、留白、字体层级、输入和按钮。
- 站名改为配置来源；使用本站自有符号。
- 增加忘记密码、密码显隐、登录中和可访问错误提示。
- 验证 1440×900、1280×800、最低 1024px；不做移动端专项。

### 保留

- 两个固定账号的邮箱密码登录。
- 当前会话、未登录重定向、简短中文语气和无注册意图。

### 删除/不带入

- 当前蓝黄大渐变、玻璃拟态和过强阴影。
- CoupleOS Logo、名称、注册、条款营销尾注和品牌资产。

### 数据库、风险与预计文件

- 登录页视觉无需 migration。
- 忘记密码需 Supabase Auth reset 与允许回调地址配置，不触碰业务数据。
- 预计修改登录页、认证 action/辅助组件、全局设计令牌/字体、站点配置和登录测试；实施阶段再给出精确清单。

## 9. 第二确认项：全局页面外壳和导航

复核日期：2026-07-25。用户已在内置浏览器登录 CoupleOS，真实认证后入口为 `/dashboard`。

### CoupleOS 真实结构

- 页面主体是居中的单列内容流；页面顶部显示空间/账号名称、欢迎语、主题切换和退出。
- 主导航固定在视口底部，包含五项：Home、Memories、Journal、Calendar、Settings。
- 当前项使用浅黄色 pill 背景；非当前项透明。
- 导航使用图标在上、文字在下的紧凑两层结构。
- 页面主体为导航预留约 64px 底部空间，滚动时导航保持固定。
- 实测浏览器内部视口为 1600×1000：导航高约 64.7px，背景 `rgba(255,255,255,.9)`；单项高约 53px，水平内边距 16px，圆角 24px。
- 主字体为 `Inter, system-ui, sans-serif`；主体文字色约 `rgb(28,25,23)`。
- 截图：`.reference/coupleos/desktop-1440/03-shell-navigation.png`。由于内置浏览器的视口覆盖未实际改变内部 `innerWidth/innerHeight`，该图实际采集于 1600×1000，不能误报为严格的 1440×900 证据；实施前仍需补拍严格同视口版本。

### 当前项目结构

- `(app)/layout.tsx` 使用 `max-w-6xl` 居中容器、顶部胶囊导航和页面内退出按钮。
- 顶部导航包含站名、用户昵称、通知、写信、日历、设置和退出。
- 没有稳定的五项一级信息架构；Memories、Journal 列表、Mood 均无对应入口。
- 站名 `NKD Diary` 在组件内写死。
- 当前本地 `.env.local` 的账号凭据无法通过 Supabase 登录，因此本轮未获得新的认证后当前项目截图；不以伪造数据或静态 mock 冒充真实页面。源码与既有 migration 足以确认上述结构，但严格同视口截图仍是待补证据。

### 功能与视觉差异

| 项目 | CoupleOS | 当前项目 | 最终方向 |
|---|---|---|---|
| 一级导航 | 底部固定五项 | 顶部胶囊，多项工具混排 | 对标底部固定结构 |
| 一级栏目 | Home/Memories/Journal/Calendar/Settings | 首页/写信/日历/设置 | 补齐目标信息架构；Mood 入口需结合真实后续页面确认 |
| 页头 | 空间名、欢迎语、主题、退出 | 站名、昵称、通知、入口、退出混在导航 | 分离页面身份区与全局导航 |
| 当前状态 | 图标+文字、浅黄 pill | 链接无明确统一 active 状态 | 实现统一 active/hover/focus 状态 |
| 内容滚动 | 主体滚动，底栏固定 | 顶部导航随文档流 | 对标固定底栏并预留安全间距 |
| 容器 | 单列、稳定居中宽度 | `max-w-6xl`，页面可自行变化 | 建立统一桌面容器令牌 |
| 视觉 | 奶油背景、实体白/暖色、轻边界 | 玻璃拟态、强阴影、蓝黄大渐变 | 改为实体层级和克制阴影 |

### 私人项目适配

- 保留视觉结构和导航节奏，但不复制 CoupleOS Logo、名称或专属图标资产。
- 删除/替换真实 CoupleOS 首页中的邀请、Pending partner、Share、Email 等配对行为；不在全局外壳留下无效入口。
- 保留当前通知能力，但移至不会破坏五项导航层级的位置。
- 退出、主题切换继续保留；站名改为配置来源。
- 不在一级导航加入公开社交、Insights/AI、邀请或付费入口。

### 数据库与预计文件

- 外壳和导航本身不需要 migration，数据迁移风险低。
- 站名配置最终可能涉及 settings 数据模型，但不应在外壳阶段擅自建表；等待 Settings 确认。
- 预计修改 `(app)/layout.tsx`、全局样式/设计令牌、新的导航组件、站点配置与路由 active-state 测试。
- 本轮只记录方案，未修改实现。

## 10. 第三确认项：首页

复核日期：2026-07-25。证据来自认证后的真实 `/dashboard` DOM 和截图，未提交任何表单或产生 CoupleOS 数据写入。

### CoupleOS 真实首页模块顺序

1. 空间/账号名称、欢迎语、主题切换、退出。
2. 邀请伴侣模块：邀请链接、Share、Copy、Email。
3. `Log a Glimmer` 快速记录：单行输入、Log 按钮、示例文案。
4. 三个并列状态卡：Together 天数、Your person 状态、Moments 数量。
5. Your Profile 横向入口。
6. Recent moments 与 Coming up 双列卡片，均具有真实空状态。
7. Jump back in 快捷入口：Add a moment、Plan a date、Journal、Insights、Profile。
8. 固定底部全局导航。

### 用户规则对首页的覆盖

- 邀请、分享、复制邀请链接、Email 邀请、Pending partner 必须全部移除，不保留无效按钮。
- `Log a Glimmer` 的视觉位置和快速记录节奏可保留，但业务替换为发布 Mood；Mood 统一限制 15 个 grapheme。
- Together 卡保留并使用现有在一起日期。
- Your person 卡替换为另一位固定成员的昵称与头像，不显示等待加入。
- Moments 卡替换为当前可解释的回忆数量；不得新增点赞、收藏或独立照片副本。
- Recent moments 映射为最近回忆；Coming up 映射为未来七天日历事件。
- Insights/AI 入口删除；其视觉位置由普通日记、未来日记、评论/评注等私人功能填补。

### 当前项目真实行为

- `HomeHero`：显示在一起天数、两人昵称/头像、当前距离与自定义星球背景。
- `今日新知`：从七条静态关系文案按日期选择。
- `MonthHeatmap`：显示当月日记数量和事件，并可进入日期详情/日历。
- 首页查询 profiles、最新日记位置、当月日记和全部日历事件。
- 当前首页没有最近日记、Mood、普通评论、正文评注/回复、未来七天事件、最近回忆、最近照片及对应快捷入口。
- 月历读取会调用 `ensureTodayEventNotifications` 并可能写入通知，形成“读页面产生写副作用”和串行 N+1 风险。
- 当前本地账号凭据失效，因此未补得新的认证后当前项目截图；未使用 mock 或假数据冒充。

### 功能差异与最终首页结构

| 区域 | CoupleOS | 当前项目 | 最终行为 |
|---|---|---|---|
| 身份区 | 空间名+欢迎语 | 顶部导航内站名/昵称 | 站名、双方昵称头像，站名可配置 |
| 快速记录 | Glimmer | 无 | 发布 Mood，15 grapheme |
| 关系状态 | Together/partner/Moments | 天数、头像、距离 | 天数、双方资料、下一纪念日；距离降为次要信息 |
| 最近内容 | Recent moments | 无 | 最近日记、回忆、照片 |
| 即将发生 | Coming up | 完整月历 | 未来七天事件；紧凑月历移到次级区域 |
| 私人互动 | 无独立摘要 | 通知下拉 | 最近普通评论、正文评注和回复 |
| 快捷入口 | moment/date/journal/insights/profile | 写信/日历 | 今日日记、Mood、日历事件、Future Journal |
| 自定义内容 | 无今日新知 | 今日新知、距离 | 保留代码和数据；移到次级区域，待用户决定是否长期保留 |

### 视觉与交互方向

- 保留 CoupleOS 的窄幅居中单列、横向强调卡、三列状态卡、双列摘要和底部快捷区节奏。
- 不直接复制其邀请卡内容、Logo、emoji 组合或品牌文案。
- 每张摘要卡整体可点击，空状态同时提供明确下一步，但不会留下无功能按钮。
- 快捷操作应打开对应 Modal/页面，并有 loading、error、success 状态；本轮仅记录，不实现。
- 首页不能退化为统计 Dashboard；数字只服务于两人关系状态和最近内容。

### 数据库与预计文件

- 首页展示本身以查询为主，但依赖后续 Journal、评论、Mood、Memories、Calendar、Settings 的模型迁移。
- 首页阶段不应先创建重复聚合表；优先从业务表查询。
- 最大风险是缺 `space_id`、目标表尚未建立、图片私有访问，以及月历读取写通知/N+1。
- 预计修改首页页面、Home 组件、查询层、快捷入口组件、加载/错误状态和首页测试。
- 当前 `HomeHero`、距离、今日新知、紧凑月历及 Future Journal 既有/计划入口不直接删除；冲突内容先移到次级区域。
- 本轮没有修改 UI、业务逻辑、数据库或 migration。
