這份通用測試內容用來比對 Pages 的原生視覺化（native visualization）、Markdown 匯出（export）與 Obsidian 匯入結果。圖表同時附完整、自包含的 HTML 原始碼（source），用來檢查資料、樣式與互動能否保留。

驗證文字：繁體中文、emoji 🐱、數學表示 E = mc²、字面反斜線 `\alpha` 和 `\path\file`、HTML entities `&lt;p&gt;`。

# 每週閱讀

資料：週一 4、週二 7。兩個長條需保留標籤與比例。

\<!-- gpt-pages\:figure v=2 id=static-bars ref=fixture-static-file sha256=219170d40a4fbe7310adf5f8ab145eb9d8d31021d43d11588ac4484e88d83af5 -->


```html-source
<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><title>靜態長條圖</title>
<style>body{font-family:system-ui;padding:1rem}.bar{background:#478cba;color:white;margin:.5rem;padding:.5rem}</style></head>
<body><h1>每週閱讀</h1><div class="bar" style="width:40%">週一：4</div><div class="bar" style="width:70%">週二：7</div></body>
</html>
```

# 調整閱讀目標

滑桿（slider）初始值為 50；調整後數值與長條同步更新，按重設（reset）回到 50。

\<!-- gpt-pages\:figure v=2 id=interactive-slider ref=fixture-interactive-file sha256=ba413284097910a0f06629a55e43455777139f41b44cb6fc0d7c0ccc4688ad25 -->


```html-source
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
