# B 阶段：双账号位置距离改造

## 已实现的代码改动

- 首页不再从“最近一封信”读取当前用户位置，双方统一读取 `profiles.last_login_*`。
- 新增显式授权组件 `LocationDistancePanel`：先解释隐私，再由用户点击请求浏览器定位。
- 定位成功后调用现有 `recordLoginLocationAction` 保存坐标和更新时间，并刷新首页。
- 支持双方都未开启、仅一方开启、双方都有位置、拒绝授权、超时、不可用和浏览器不支持等状态。
- 显示双方最后更新时间，不展示精确经纬度、城市或地图。
- 拒绝授权后使用浏览器 localStorage 记录，不再自动请求；仍保留“再次开启”按钮。
- 坐标增加纬度 `[-90, 90]`、经度 `[-180, 180]` 的服务端校验。
- 补充距离验证、资料时间字段和定位组件测试。

## 需要在 Windows 原项目中验证

```powershell
npm test -- src/features/distance/distance.test.ts src/features/profile/repository.test.ts src/features/distance/components/LocationDistancePanel.test.tsx
npm run lint
npm run build
npm run dev
```

然后分别登录两个账号：

1. 账号 A 打开首页并点击“开启位置距离”，允许定位。
2. 确认首页显示“等待伴侣开启位置距离”。
3. 账号 B 重复操作。
4. 确认双方首页显示相距公里数及两个更新时间。
5. 在浏览器设置中拒绝定位，确认页面不反复自动弹窗，仍可手动再次开启。
