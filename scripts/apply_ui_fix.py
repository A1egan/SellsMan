from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

# 1) 顶部工具菜单样式
if '.tools-menu-wrap {' not in text:
    marker = """.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}
"""
    addition = marker + """
.tools-menu-wrap {
  position: relative;
}

.tools-menu {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 300;
  width: 156px;
  padding: 6px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0,0,0,0.16);
}

.tools-menu.show { display: block; }

.tools-menu-item {
  display: block;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #333;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.tools-menu-item:hover { background: #f3f4f6; }
"""
    if marker not in text:
        raise SystemExit('header-controls marker not found')
    text = text.replace(marker, addition, 1)

# 2) 弹窗限制在视口内并允许内部滚动
modal_old = """.modal {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  width: 420px;
  max-width: 90vw;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 40px rgba(0,0,0,0.18);
}
"""
modal_new = """.modal {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  width: 420px;
  max-width: 90vw;
  max-height: 86vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 40px rgba(0,0,0,0.18);
}
"""
if 'max-height: 86vh;' not in text:
    if modal_old not in text:
        raise SystemExit('modal marker not found')
    text = text.replace(modal_old, modal_new, 1)

# 3) 顶部平铺工具按钮收进单一菜单
header_old = """    <button class=\"btn btn-outline btn-sm\" id=\"batchToggleBtn\" onclick=\"toggleBatchMode()\">批量选择</button>
    <button class=\"btn btn-outline btn-sm\" onclick=\"showBatchAdd()\">批量添加</button>
    <button class=\"btn btn-outline btn-sm\" id=\"densityBtn\" onclick=\"toggleDensity()\">紧凑视图</button>
    <button class=\"btn btn-outline btn-sm\" onclick=\"exportData()\">导出CSV</button>
    <button class=\"btn btn-outline btn-sm\" onclick=\"backupData()\">备份</button>
    <label class=\"btn btn-outline btn-sm\" style=\"cursor:pointer;\">
      导入
      <input type=\"file\" accept=\".csv,.txt\" style=\"display:none\" onchange=\"importFile(event)\">
    </label>
    <label class=\"btn btn-outline btn-sm\" style=\"cursor:pointer;\">
      恢复
      <input type=\"file\" accept=\".json\" style=\"display:none\" onchange=\"restoreData(event)\">
    </label>
"""
header_new = """    <div class=\"tools-menu-wrap\">
      <button class=\"btn btn-outline btn-sm\" id=\"toolsMenuBtn\" onclick=\"toggleToolsMenu(event)\">菜单 ▾</button>
      <div class=\"tools-menu\" id=\"toolsMenu\" onclick=\"event.stopPropagation()\">
        <button class=\"tools-menu-item\" id=\"batchToggleBtn\" onclick=\"toggleBatchMode(); closeToolsMenu()\">批量选择</button>
        <button class=\"tools-menu-item\" onclick=\"showBatchAdd(); closeToolsMenu()\">批量添加</button>
        <button class=\"tools-menu-item\" id=\"densityBtn\" onclick=\"toggleDensity(); closeToolsMenu()\">紧凑视图</button>
        <button class=\"tools-menu-item\" onclick=\"exportData(); closeToolsMenu()\">导出CSV</button>
        <button class=\"tools-menu-item\" onclick=\"backupData(); closeToolsMenu()\">备份</button>
        <label class=\"tools-menu-item\" style=\"cursor:pointer;\">
          导入
          <input type=\"file\" accept=\".csv,.txt\" style=\"display:none\" onchange=\"importFile(event); closeToolsMenu()\">
        </label>
        <label class=\"tools-menu-item\" style=\"cursor:pointer;\">
          恢复
          <input type=\"file\" accept=\".json\" style=\"display:none\" onchange=\"restoreData(event); closeToolsMenu()\">
        </label>
      </div>
    </div>
"""
if 'id="toolsMenuBtn"' not in text:
    if header_old not in text:
        raise SystemExit('header tool buttons marker not found')
    text = text.replace(header_old, header_new, 1)

# 4) 菜单开关函数；点击页面其他位置自动关闭
if 'function toggleToolsMenu(event)' not in text:
    js_marker = 'function loadData() {'
    js_addition = """function toggleToolsMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('toolsMenu');
  if (!menu) return;
  const willOpen = !menu.classList.contains('show');
  document.querySelectorAll('.col-filter-menu.show').forEach(m => m.classList.remove('show'));
  menu.classList.toggle('show', willOpen);
}

function closeToolsMenu() {
  const menu = document.getElementById('toolsMenu');
  if (menu) menu.classList.remove('show');
}

document.addEventListener('click', closeToolsMenu);

""" + js_marker
    if js_marker not in text:
        raise SystemExit('loadData marker not found')
    text = text.replace(js_marker, js_addition, 1)

path.write_text(text, encoding='utf-8')
print('UI fix applied')
