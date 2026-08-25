from pathlib import Path
import re
import subprocess
import tempfile

HTML = Path(__file__).resolve().parents[1] / "index.html"
TEXT = HTML.read_text(encoding="utf-8")


def require(token: str):
    assert token in TEXT, f"missing contract token: {token}"


# 数据与业务兼容性：这些内容绝不能因为 UI 重构发生变化。
require("const STORAGE_KEY = 'sales_followup_data_v3';")
require("const TAGS_KEY = 'sales_tags_v1';")
for column_id in ["pending", "contacting", "replied", "lowinterest", "silent"]:
    assert re.search(rf"id:\s*'{column_id}'", TEXT), f"column id changed: {column_id}"
for field in ["history", "nextFollowUpAt", "nextAction", "lastResult", "lastContactAt"]:
    require(field)
for fn in [
    "addSingleUser", "batchAddUsers", "filterByTag", "setColFilter",
    "onDrop", "batchMoveSelected", "batchDelete", "exportData",
    "backupData", "restoreData", "logFollowup", "renderTaskBar",
    "renderTagModal", "saveDetailNote"
]:
    assert re.search(rf"function\s+{fn}\s*\(", TEXT), f"business function missing: {fn}"

# 顶部菜单功能必须保留。
require('id="toolsMenuBtn"')
for label in ["批量选择", "批量添加", "紧凑视图", "导出CSV", "备份", "导入", "恢复"]:
    require(label)

# 新工作台 UI 契约。
assert re.search(
    r"\.stats-bar\s*\{[^}]*display\s*:\s*none",
    TEXT,
    re.S,
), "legacy stats strip should be visually removed"
assert re.search(
    r"\.column\s*\{[^}]*flex\s*:\s*0\s+0\s+372px",
    TEXT,
    re.S,
), "desktop column should be 372px"
assert re.search(
    r"\.column-body\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)",
    TEXT,
    re.S,
), "all columns should use three-card grid"
assert not re.search(
    r"\.column-body\[data-col=\"pending\"\]\s*\{[^}]*grid-template-columns",
    TEXT,
    re.S,
), "pending column must not have a special grid rule"
require('data-followup-status="${followupStatus}"')
for section in ["detail-section-followup", "detail-section-history", "detail-section-profile"]:
    require(section)
require('id="detailColumnBadge"')
require('id="detailFollowupBadge"')

# 详情里的过期活动快捷键不能继续绑死当前工作流。
assert "25号直播后" not in TEXT, "expired event-specific quick button should be removed"

# JavaScript 必须保持语法有效。
scripts = re.findall(r"<script>(.*?)</script>", TEXT, re.S)
assert scripts, "inline script missing"
with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as f:
    f.write("\n".join(scripts))
    js_path = f.name
subprocess.run(["node", "--check", js_path], check=True)

print("UI contract OK")
