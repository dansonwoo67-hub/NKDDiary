# 性能审计基线

审计日期：2026-07-24；2026-07-25 复测  
环境：Windows 本地开发模式，Next.js 16.2.10 Turbopack，`npm run dev`。开发模式数据只用于发现问题，不能代替生产构建与 Vercel 实测。

## 修改前数据

未登录 `/login` 连续 5 次 curl：

| 次数 | HTTP | TTFB | Total | HTML |
|---:|---:|---:|---:|---:|
| 1 | 200 | 203ms | 211ms | 15,946B |
| 2 | 200 | 286ms | 292ms | 15,946B |
| 3 | 200 | 171ms | 175ms | 15,946B |
| 4 | 200 | 135ms | 142ms | 15,946B |
| 5 | 200 | 128ms | 134ms | 15,946B |

- 平均 TTFB：184.6ms
- 平均 Total：190.8ms
- 未登录 `/`：307 到 `/login`，TTFB 27.7ms，Total 27.8ms
- dev server Ready：约 1.135s

2026-07-25 复测（同为本地开发模式，服务启动 Ready 约 2.1s）：

| 次数 | HTTP | TTFB | Total | HTML |
|---:|---:|---:|---:|---:|
| 1 | 200 | 134.5ms | 140.7ms | 15,946B |
| 2 | 200 | 321.2ms | 344.2ms | 15,946B |
| 3 | 200 | 152.2ms | 156.7ms | 15,946B |
| 4 | 200 | 172.0ms | 186.8ms | 15,946B |
| 5 | 200 | 164.9ms | 173.1ms | 15,946B |

- 复测平均 TTFB：188.9ms
- 复测平均 Total：200.3ms
- 未登录 `/`：307 到 `/login`，TTFB 69.4ms，Total 69.6ms

## 已发现问题与根因

1. `(app)/layout.tsx` 使用 `force-dynamic`，所有登录后页面强制动态。
2. 首页多个可独立查询顺序 await，存在并行化空间。
3. `getMonthCalendarState` 在读月历时执行通知写入。
4. `ensureTodayEventNotifications` 对事件×用户双层循环，每项先查再插，形成串行 N+1。
5. 月历每次拉取全部 calendar events，再在服务端计算目标月重复实例。
6. 头像使用永久公开 URL；后续私有化不能靠取消权限换性能，需对 signed URL 缓存/去重。
7. 登录后真实数据页未测，因为本轮没有使用账号登录或写入真实数据。
8. lint/test/build 并发基线在 30 秒内没有返回终态，不能宣称通过；后续需无并发地单独复测。

## 计划方案（未实施）

- 将通知生成从页面读取移出，采用幂等数据库函数、定时任务或写入事件时派生。
- 首页独立查询并行化；减少重复用户/资料查询。
- 为事件范围/重复规则设计可索引查询并记录 query plan。
- 私有图片采用短期 signed URL + 请求级缓存，不改成 public。
- 生产构建后测登录、首页、Journal、Mood、评论、评注、Calendar，并记录 Supabase 请求数、RSC/JS 体积、控制台和 hydration 错误。

## 修改后数据

本轮禁止优化代码，因此没有修改后数据。

## 尚未解决

- 全部登录后真实数据页面性能。
- Vercel 与 Supabase 区域网络延迟。
- signed URL、私人图片 LCP 与缓存命中率。
- 生产 bundle、客户端组件数量和大型依赖占比。
- lint、TypeScript/build、单元/E2E 的最终终态复测。
