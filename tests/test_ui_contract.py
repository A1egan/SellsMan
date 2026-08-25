from pathlib import Path
import re

HTML = Path(__file__).resolve().parents[1] / 'index.html'
text = HTML.read_text(encoding='utf-8')


def test_header_uses_single_tools_menu():
    assert 'id="toolsMenuBtn"' in text, '顶部应存在单一“菜单”按钮'
    assert 'id="toolsMenu"' in text, '应存在工具菜单下拉容器'
    for label in ['批量选择', '批量添加', '紧凑视图', '导出CSV', '备份', '导入', '恢复']:
        assert label in text, f'菜单中应保留操作：{label}'


def test_detail_modal_is_viewport_bounded_and_scrollable():
    modal_css = re.search(r'\.modal\s*\{(?P<body>.*?)\}', text, re.S)
    assert modal_css, '应存在 .modal 样式'
    body = modal_css.group('body')
    assert re.search(r'max-height\s*:\s*8[0-9]vh', body), '弹窗应限制在视口高度内'
    assert re.search(r'overflow-y\s*:\s*auto', body), '弹窗内容超高时应在弹窗内部滚动'
