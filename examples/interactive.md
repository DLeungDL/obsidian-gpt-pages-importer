# Interactive Chart Example

**English** · [繁體中文](interactive.zh-TW.md)

This is original sample content authored for testing. Interaction requires explicit trust and a compatible renderer. The slider starts at 50; changing it updates the value and bar width, and Reset restores 50.

This example uses the supported legacy v1 format. For new Pages, use the [compact v3 format](../docs/format.md).

<!-- gpt-pages:figure v=1 id=interactive-slider -->
visualize:interactive-slider
```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Interactive Slider</title><style>body{font-family:system-ui;padding:1rem}#bar{height:2rem;background:#478cba}</style></head>
<body>
<label>Value <input id="slider" type="range" min="0" max="100" value="50"></label>
<output id="value">50</output><div id="bar" style="width:50%"></div><button id="reset">Reset</button>
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
