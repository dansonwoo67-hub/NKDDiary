# NKDDiary 上线前稳定性修复设计

## 1. 目标与优先级

本轮在不大规模重构产品逻辑的前提下完成上线前稳定性修复，优先级固定为：

1. 数据一致性
2. 功能正确
3. 性能
4. UI 优化

核心验收链路是“用户操作 → 数据库 → 通知 → 页面展示”。Susan 与 Niki 是唯一两个业务账号。

## 2. 信件最终状态模型

已寄出的普通信只保留两种业务状态：

- 正常：`journal_entries.withdrawn_at is null`
- 撤回：`journal_entries.withdrawn_at is not null`

撤回窗口由数据库使用 `locked_at` 校验，发送方仅可在寄出后 24 小时内撤回。撤回只写入 `withdrawn_at`，不得写入 `deleted_at`、`purge_at`，不得删除信件、评论或通知记录。

接收方打开正常信件时，由一个数据库 RPC 原子完成：

- 首次写入 `journal_entries.opened_at`
- 首次写入 `journal_entries.opened_by`
- 将该接收人的相关 active 通知更新为 `is_read=true`

接收方访问已撤回信件时，RLS 允许读取展示状态所需的记录，但页面不得渲染正文和评论，只显示“这封信已经被对方撤回”。发送方仍可看到自己的正文和撤回状态。

## 3. 删除体系退役

采用已确认的兼容策略：

- 删除 `delete_letter_diary(uuid)`。
- 删除 `purge_letter_diary(uuid)`。
- 删除 `empty_letter_recycle_bin()`。
- 删除 `auto_purge_letter_deletions()`（若存在）。
- 删除当前为空的 `letter_deletions` 表。
- 应用代码和测试不得再引用信件删除、回收站或 purge 流程。
- 暂时保留 `journal_entries.deleted_at` 与 `purge_at` 字段，作为历史兼容字段。
- 新代码、RPC、触发器不得再写入这两个字段。

历史 `deleted_at/purge_at` 数据不在本轮直接删除。迁移只负责停用删除能力；历史状态修复使用单独、可审查的 SQL 报告和非破坏性规范化迁移。

## 4. 通知状态模型

`notifications` 是所有红点的唯一来源。

- 未读且有效：`is_read=false and is_active=true`
- 已读且有效：`is_read=true and is_active=true`
- 已撤回/无效：`is_active=false`，同时规范化为 `is_read=true`

收信箱和“新动态”的数量都从当前登录用户的 active notifications 计算。`journal_entries.opened_at` 仅表示信件打开事实，不再直接驱动任何红点。

获取通知列表是只读行为，不得因为通知超过 5 条或超过 30 天而自动标记已读。只有以下操作可改变已读状态：

- 用户点击通知。
- 接收方直接打开对应信件。
- 信件撤回导致通知失效。

通知点击采用乐观更新时，服务端失败必须回滚本地状态并显示稳定错误提示。不能静默失败。

## 5. 历史通知和深链

迁移提供非破坏性状态规范化：

- 已撤回信件对应的 active 信件通知设为 `is_active=false, is_read=true`。
- 信件类通知指向不存在的 `journal_entries` 时设为 `is_active=false, is_read=true`。
- 不删除任何通知记录。

页面深链 `/journal/[id]` 的行为：

- 有权访问的正常信：展示正文。
- 有权访问的撤回信：展示撤回提示。
- 无权访问或真实不存在：404。

通知中心不在导航前做一套与详情页不同的业务判定。详情页与 RLS 是最终访问判定来源，避免“通知校验通过但页面 404”或重复查询竞态。

## 6. 双账号隔离

所有通知查询必须带 `recipient_id = currentUserId`，所有写操作必须由 RLS/RPC 再次验证 `auth.uid()`。

本地草稿按 `authorId` 分键。账号退出后，服务端布局重新加载当前用户数据；客户端通知状态需要在传入的用户数据变化时同步，不能继续显示前一个账号的数组。

必须覆盖以下 E2E：

1. Susan 发信，Niki 收到一个未读提醒。
2. Niki 打开信件，`opened_at/opened_by` 与通知已读状态一致，红点消失。
3. Susan 在 24 小时内撤回，Niki 直接访问历史链接只看到撤回提示。
4. Susan → Niki → Susan 切换后，各自只看到自己的通知状态。
5. 任意通知点击不得产生 404；孤儿通知不应出现在 active 列表。

## 7. 错误处理与竞态

- Server Action 捕获可预期的数据库错误并返回稳定的 `ActionResult`，不向用户暴露 Supabase 原始错误。
- 详情加载失败区分“无记录”和“数据库异常”；数据库异常进入页面错误边界，不伪装成 404。
- 已读 RPC 必须幂等，多次打开同一信件不报错。
- 撤回 RPC 必须验证作者、状态和 24 小时窗口，并在同一事务中失效相关通知。
- 客户端异步操作使用明确 pending 状态，失败时恢复本地状态。

## 8. 测试策略

按 TDD 实施，每个行为先增加会因当前缺陷失败的测试：

- SQL 迁移静态测试：删除 API 已移除、撤回不写删除字段、打开和撤回同时维护通知。
- notification selection 单元测试：列表截断不产生隐式已读写入。
- Server Action 测试：只查询当前用户 active notifications；错误返回稳定结果。
- 组件测试：点击失败回滚红点；props 切换后清除旧账号状态。
- 详情测试：接收方撤回视图不含正文和评论。
- Playwright 双账号测试：发送、打开、撤回、账号切换、通知深链。

每个修复完成后运行相关测试；最终执行：

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

真实 Supabase E2E 缺少环境或浏览器条件时必须明确失败原因，不得视为通过。

## 9. 性能和工程优化边界

核心稳定性通过后只做低复杂度优化：

- 合并信件箱可安全合并的重复查询。
- 评论数量改为数据库聚合，避免拉取全部评论 ID。
- 移除未使用状态、导入和临时文件。
- 对关键头像和回忆图片使用 Next Image 或明确尺寸与懒加载。
- 避免 `window.location.reload()`，使用局部状态和 `router.refresh()`。

不引入新的状态管理框架、缓存层、消息队列或复杂架构。

## 10. 数据库执行边界

数据库变更必须通过新的追加式 migration 表达。应用 migration 前：

1. 运行迁移静态测试。
2. 在实际数据库执行只读审计查询。
3. 展示将受影响的对象和记录数量。
4. 不删除业务正文、信件或通知记录。

生产数据库 migration 的实际应用属于独立确认步骤；代码仓库中的迁移和测试可以先完成。
