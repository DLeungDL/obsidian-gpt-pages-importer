# 互動圖表範例

[English](interactive.md) · **繁體中文**

這是自行編寫的測試內容。需要信任內容並使用 renderer 才會執行互動。

<!-- gpt-pages:figure v=1 id=interactive-slider -->
visualize:interactive-slider
```html
<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><title>互動滑桿</title><style>body{font-family:system-ui;padding:1rem}#bar{height:2rem;background:#478cba}</style></head>
<body>
<label>數值 <input id="slider" type="range" min="0" max="100" value="50"></label>
<output id="value">50</output><div id="bar" style="width:50%"></div><button id="reset">重設</button>
<script>
const slider = document.getElementById('slider');
const update = () => { document.getElementById('value').textContent = slider.value; document.getElementById('bar').style.width = slider.value + '%'; };
slider.addEventListener('input', update);
document.getElementById('reset').addEventListener('click', () => { slider.value = '50'; update(); });
update();
</script>
</body>
</html>
```
