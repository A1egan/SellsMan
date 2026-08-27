# Cloud Sync v1 设计

日期：2026-08-27

## 目标

为 A1eG4n 工作台增加单账号、多设备云同步能力，解决当前 localStorage 导致的设备间数据分叉问题。

本版本范围：
- 单账号使用，不做团队、角色、共享工作区。
- Supabase Auth 使用邮箱 Magic Link。
- GitHub Pages 继续作为前端部署方式。
- Supabase PostgreSQL 作为权威云数据源。
- localStorage 保留为本地缓存和离线工作层。
- 保存后立即尝试上传；其他设备在页面打开、标签页重新获得焦点或手动点击同步时拉取。
- 同一条记录并发修改时使用 revision 检测冲突，不做静默覆盖。

不做：Supabase Realtime、多人权限、自动字段级冲突合并、复杂事件溯源。

## 初始化数据基线

唯一初始化权威数据源为用户于 2026-08-27 上传的最新 version 2 JSON 备份，导出时间 `2026-08-27T02:02:10.150Z`。

已校验：
- customers: 1060
- tags: 10
- customer id 无重复
- customer column 均属于 `pending`、`contacting`、`replied`、`lowinterest`、`silent`
- 所有 customer.tags 均能解析到现有 tag
- 6 条 customer.number 为非纯数字，因此 number 必须保持字符串语义

该备份不包含 `sales_work_tasks_v1`，因此首次云端初始化时 work_tasks 为空。不得从备注推断任务，不得混入其他设备 localStorage 作为初始化数据。

## 总体架构

```text
现有 UI / users / tags / workTasks
        ↓
localStorage 本地缓存
        ↕
Cloud Sync Adapter
        ↕
Supabase Auth + PostgreSQL
```

现有 CRM 数据模型和 UI 继续保留。云同步以新增适配层接入，不重写客户看板业务逻辑。

## 云端数据结构

采用“稳定同步元数据 + 原始 payload JSON”结构，减少对现有 CRM schema 的侵入。

### customers

- owner_id uuid not null
- id text not null
- payload jsonb not null
- revision bigint not null default 1
- updated_at timestamptz not null default now()
- deleted_at timestamptz null
- primary key `(owner_id, id)`

payload 完整保存现有 customer 对象，包括：
`id, number, column, note, replied, tags, history, nextFollowUpAt, nextAction, lastResult, lastContactAt, createdAt, updatedAt` 及未来新增字段。

### tags

同样字段：owner_id、id、payload、revision、updated_at、deleted_at，主键 `(owner_id, id)`。

### work_tasks

同样字段：owner_id、id、payload、revision、updated_at、deleted_at，主键 `(owner_id, id)`。

### sync_state

每个 owner 一行：
- owner_id uuid primary key
- initialized_at timestamptz not null
- schema_version integer not null default 1
- last_server_change_at timestamptz null

用于判断云端是否已经完成初始化。初始化完成后，其他设备不得用本地旧数据自动覆盖云端。

## 身份认证与权限

使用 Supabase Auth Magic Link。

前端只使用 Project URL 与 publishable key/anon key。禁止将 service_role key 放入 GitHub Pages。

所有业务表启用 RLS，读写策略统一限制为：

```sql
auth.uid() = owner_id
```

前端写入时 owner_id 来自当前登录用户，不允许跨 owner 访问。

## 首次迁移

首次登录后：

1. 查询 sync_state。
2. 若云端未初始化，展示“初始化云端数据”确认界面。
3. 初始化数据只来自指定的 version 2 JSON 基线，而不是其他设备 localStorage。
4. 按 customers → tags → work_tasks 顺序上传。
5. 每条云端记录 revision 初始化为 1。
6. 全部成功后写入 sync_state；只有此步骤成功后才视为初始化完成。
7. 初始化过程中任何批次失败，不写 sync_state，允许安全重试；写入采用幂等 upsert。

其他设备在 sync_state 已存在时：
- 只从云端拉取正式数据。
- 不自动上传本设备旧 localStorage。
- 可保留“导出旧本地数据”入口供人工救援。

## 日常本地保存

用户修改客户/标签/任务时：

1. 先立即更新内存与现有 localStorage，保证 UI 不被网络阻塞。
2. 将该实体加入本地待同步队列。
3. UI 显示“同步中…”。
4. 尝试向 Supabase 提交带 expected revision 的更新。
5. 成功后更新本地 revision 缓存并显示“已同步 HH:mm”。
6. 网络失败时保留队列，显示“离线 · N 项待同步”，后续自动重试。

拖拽客户阶段等高频操作不得等待网络响应后再刷新 UI。

## 拉取策略

不启用 Realtime。

以下时机触发 pull：
- 页面初次打开并完成认证后
- `visibilitychange` 从隐藏切回可见
- window focus，可做短时间防抖
- 用户点击“立即同步”

v1 可以按 `updated_at > lastPullAt` 拉取变化记录。删除记录也必须被拉取，因此查询不能默认过滤 deleted_at。

服务器时间仅用于增量拉取，不用于冲突胜负判断。

## 冲突控制

冲突判断使用 revision，不依赖设备本地时钟。

客户端保存实体时携带 `expected_revision`。

数据库更新必须满足当前 revision 与 expected_revision 一致，并原子执行：
- 写入新 payload
- revision = revision + 1
- updated_at = now()

若没有匹配行，则视为冲突；客户端拉取最新云端记录并弹出冲突界面。

冲突 UI 至少包含：
- 实体标识（客户显示 number）
- 云端版本摘要
- 当前设备版本摘要
- 查看差异
- 保留云端版本
- 保留当前设备版本

“保留当前设备版本”不是无条件覆盖：用户确认后必须基于最新云端 revision 再提交一次，确保这次选择是显式的。

v1 不自动字段合并；history、tags 等嵌套字段不做猜测式合并。

## 删除语义

禁止正常同步路径直接硬删除。

删除实体时写：
- deleted_at = now()
- revision + 1

其他设备拉取 tombstone 后删除自己的可见本地实体，并保留对应同步元数据，防止旧设备重新上传导致“复活”。

## 本地同步元数据

新增独立 localStorage key 保存云同步内部状态，不污染原有 CRM payload：

- `sales_cloud_sync_meta_v1`
- `sales_cloud_pending_v1`

meta 至少保存：
- 当前 owner id
- 各实体本地已知 revision
- lastPullAt
- 初始化来源标记

pending 队列保存待上传实体类型、id、操作和 expected revision。

现有 key 保持兼容：
- `sales_followup_data_v3`
- `sales_tags_v1`
- `sales_work_tasks_v1`

## UI

顶部操作区新增紧凑的账号/同步状态入口：
- 未登录：`登录云同步`
- 同步中：`同步中…`
- 成功：`已同步 HH:mm`
- 离线：`离线 · N 项待同步`
- 冲突：`1 项冲突`

登录弹层：邮箱输入 + 发送 Magic Link。

首次初始化弹层必须明确显示客户/标签/任务数量并要求确认。

冲突弹层独立于客户详情抽屉，不阻塞其他无冲突记录的同步。

## 备份策略

现有 version 2 备份只含 users + tags。本功能应新增 version 3 备份格式，把 `workTasks` 一并包含。

恢复旧 version 2 备份必须继续兼容，缺少 workTasks 时按空数组处理，不报错。

云同步不能替代本地 JSON 导出；保留手工备份作为灾备。

## 数据库接口

为确保 revision 检查原子性，优先使用 PostgreSQL RPC 函数，而不是前端先 select 再 update。

建议函数：
- `sync_upsert_record(record_type, record_id, payload, expected_revision)`
- `sync_soft_delete_record(record_type, record_id, expected_revision)`

函数必须基于 `auth.uid()` 绑定 owner，不接受客户端传入任意 owner_id。

初始化批量写入可以使用受 RLS 约束的 upsert 或单独初始化 RPC，必须保持幂等。

## 错误处理

- 无网络：本地继续工作，保留 pending。
- Auth session 过期：停止云写入，提示重新登录，不丢 pending。
- 401/403：标记认证/权限错误，不做自动覆盖。
- schema/RPC 错误：显示“云同步异常”，保留本地数据。
- 冲突：进入冲突队列，不重试同一写入直到用户选择。
- pull 失败：继续使用本地缓存，不清空现有数据。

任何云端失败都不得导致 localStorage 被清空。

## 测试

至少覆盖：

1. 1060 customers + 10 tags 基线迁移保持字段原样。
2. 非数字 number 可以完整往返。
3. 已初始化设备不会再次触发初始化上传。
4. 其他设备本地旧数据不会覆盖云端。
5. 保存先落 localStorage，网络失败仍保留修改。
6. pending 队列可在恢复网络后成功清空。
7. revision 冲突不会静默覆盖。
8. “保留当前设备版本”基于最新 revision 显式提交。
9. 软删除同步后不会被旧设备复活。
10. version 2 备份仍能恢复；version 3 包含 workTasks。
11. RLS 阻止其他 auth.uid() 读取或修改数据。
12. 现有客户看板、拖拽、标签、任务 UI 契约测试继续通过。

## 发布顺序

1. 在 Supabase 项目创建 schema、RPC、RLS。
2. 用测试账号验证 Magic Link 与 RLS。
3. 前端接入 Cloud Sync Adapter，保持默认本地模式可运行。
4. 接入账号/同步 UI。
5. 验证 version 2 初始化 JSON 迁移。
6. 完成多设备冲突、删除、离线场景测试。
7. 创建 PR，CI 全绿后再合并 main。

在云端 schema 与前端同时准备完成之前，不把现有线上 localStorage 数据自动清空或覆盖。