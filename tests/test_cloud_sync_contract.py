from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


workspace_core = read("assets/workspace-v2-core.js")
for asset in (
    "assets/cloud-sync-config.js",
    "assets/cloud-sync-core.js",
    "assets/cloud-sync.js",
    "assets/cloud-sync-bootstrap.js",
):
    assert asset in workspace_core, f"cloud sync bundle asset is not loaded: {asset}"

config = read("assets/cloud-sync-config.js")
assert "https://udfukkmzesgufuqehfpx.supabase.co" in config
assert "sb_publishable_" in config
assert "service_role" not in config.lower(), "service role key must never be shipped to GitHub Pages"

sync = read("assets/cloud-sync.js")
assert "localStorage.clear" not in sync, "cloud failures/auth flows must never clear CRM localStorage"
assert "sync_upsert_record" in sync
assert "sync_soft_delete_record" in sync
assert "expectedRevision" in sync
assert "observeStoreWrite" in sync

bootstrap = read("assets/cloud-sync-bootstrap.js")
for text in (
    "登录云同步",
    "同步中…",
    "已同步",
    "离线 ·",
    "项冲突",
    "Magic Link",
    "初始化云端数据",
    "查看差异",
    "保留云端版本",
    "保留当前设备版本",
):
    assert text in bootstrap, f"missing cloud sync UI contract text: {text}"

assert "version: 3" in bootstrap
assert "workTasks" in bootstrap
assert "version === 2 || version === 3" in bootstrap
assert "Array.isArray(data.workTasks) ? data.workTasks : []" in bootstrap

sql = read("supabase/migrations/2026082701_cloud_sync_v1.sql")
assert "enable row level security" in sql
assert "customers_owner_select" in sql
assert "tags_owner_select" in sql
assert "work_tasks_owner_select" in sql
assert "sync_state_owner_select" in sql
normalized_sql = "".join(sql.split()).lower()
assert "revokeinsert,update,deleteonpublic.customers,public.tags,public.work_tasks,public.sync_statefromauthenticated,anon;" in normalized_sql
assert "grant execute on function public.sync_upsert_record" in sql
assert "grant execute on function public.sync_soft_delete_record" in sql
assert "auth.uid()" in sql

print("Cloud sync contract OK")
