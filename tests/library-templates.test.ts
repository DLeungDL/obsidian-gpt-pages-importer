import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';

// Mock loading/API behavior only; no CDN fetch, real browser, WebGL or renderer claim.
function example(name: string, behavior: 'load' | 'error' | 'missing-global' | 'timeout' | 'primary-error' | 'primary-missing-global' | 'primary-timeout' = 'load') {
  const urls: string[] = [];
  const plotly = { newPlot: vi.fn(async () => {}), restyle: vi.fn(async () => {}) };
  let expression: ((emit: (x: number, y: number) => void, x: number) => void) | undefined;
  const view = { axis: vi.fn(), interval: vi.fn((options: { expr: typeof expression }) => { expression = options.expr; }), line: vi.fn() };
  const mathbox = { mathBox: vi.fn(() => ({ three: {
    renderer: { setPixelRatio() {}, setSize() {}, setClearColor() {} },
    camera: { position: { set() {} }, aspect: 1, updateProjectionMatrix() {}, lookAt() {} }
  }, cartesian: () => view })) };
  const dom = new JSDOM(readFileSync('skills/gpt-pages-obsidian-visualizations/assets/' + name, 'utf8'), {
    runScripts: 'dangerously',
    beforeParse(window) {
      const globals = window as unknown as Record<string, unknown>;
      const timers = new Map<number, () => void>();
      if (behavior === 'timeout') {
        window.setTimeout = ((handler: () => void) => { window.queueMicrotask(handler); return 1; }) as typeof window.setTimeout;
      } else if (behavior === 'primary-timeout') {
        let nextTimer = 0;
        window.setTimeout = ((handler: () => void) => { timers.set(++nextTimer, handler); return nextTimer; }) as typeof window.setTimeout;
        window.clearTimeout = ((id: number) => { timers.delete(id); }) as typeof window.clearTimeout;
      }
      const proto = window.HTMLHeadElement.prototype;
      const append = proto.appendChild;
      proto.appendChild = function<T extends Node>(node: T): T {
        const result = append.call(this, node) as T;
        const element = node as unknown as HTMLScriptElement & HTMLLinkElement;
        const url = element.tagName === 'LINK' ? element.href : element.src;
        if (!url) return result;
        urls.push(url);
        if (behavior === 'timeout') return result;
        const primary = url.startsWith('https://cdn.jsdelivr.net/');
        if (behavior === 'primary-timeout' && primary) {
          const handler = [...timers.values()].at(-1)!;
          window.queueMicrotask(handler);
          return result;
        }
        window.queueMicrotask(() => {
          const error = behavior === 'error' || behavior === 'primary-error' && primary;
          const missing = behavior === 'missing-global' || behavior === 'primary-missing-global' && primary;
          if (!error && !missing) {
            if (url.includes('plotly.min.js')) globals.Plotly = plotly;
            if (url.includes('three.min.js')) globals.THREE = {};
            if (url.includes('OrbitControls.js')) (globals.THREE as Record<string, unknown>).OrbitControls = function() {};
            if (url.includes('mathbox.min.js')) globals.MathBox = mathbox;
          }
          element.dispatchEvent(new window.Event(error ? 'error' : 'load'));
        });
        return result;
      };
    }
  });
  return { dom, urls, plotly, mathbox, sample: (x: number) => {
    let y: number | undefined; expression?.((_x, value) => { y = value; }, x); return y;
  } };
}

it('Plotly template waits for the dependency and updates sampled data on input/reset', async () => {
  const test = example('plotly-function.html');
  try {
    const doc = test.dom.window.document;
    expect((doc.getElementById('controls') as HTMLFieldSetElement).disabled).toBe(true);
    await vi.waitFor(() => expect((doc.getElementById('controls') as HTMLFieldSetElement).disabled).toBe(false));
    expect(test.urls).toHaveLength(1);
    expect(test.plotly.newPlot).toHaveBeenCalledOnce();
    const slider = doc.getElementById('amplitude') as HTMLInputElement;
    slider.value = '-2'; slider.dispatchEvent(new test.dom.window.Event('input'));
    await vi.waitFor(() => expect(test.plotly.restyle).toHaveBeenCalledOnce());
    const args = test.plotly.restyle.mock.calls[0] as unknown as [unknown, { y: number[][] }];
    expect(args[1].y[0]![80]).toBe(-2);
    doc.getElementById('reset')!.click();
    expect(slider.value).toBe('1');
    expect(doc.getElementById('value')!.textContent).toBe('1.0');
  } finally { test.dom.window.close(); }
});

it('MathBox template loads matched dependencies in order and updates the curve expression', async () => {
  const test = example('mathbox-curve.html');
  try {
    const doc = test.dom.window.document;
    await vi.waitFor(() => expect(test.mathbox.mathBox).toHaveBeenCalledOnce());
    expect(test.urls.map(url => url.split('/').at(-1))).toEqual(['three.min.js', 'OrbitControls.js', 'mathbox.min.js']);
    // Embedded MathBox styles work without any stylesheet request.
    const overlay = doc.createElement('div');
    overlay.className = 'mathbox-overlays';
    doc.body.appendChild(overlay);
    expect(test.dom.window.getComputedStyle(overlay).position).toBe('absolute');
    expect(test.sample(Math.PI / 4)).toBeCloseTo(1);
    const slider = doc.getElementById('amplitude') as HTMLInputElement;
    slider.value = '0'; slider.dispatchEvent(new test.dom.window.Event('input'));
    expect(test.sample(Math.PI / 4)).toBe(0);
    doc.getElementById('reset')!.click();
    expect(test.sample(Math.PI / 4)).toBeCloseTo(1);
    expect(doc.getElementById('value')!.textContent).toBe('1.0');
  } finally { test.dom.window.close(); }
});

it.each(['primary-error', 'primary-missing-global', 'primary-timeout'] as const)('MathBox recovers from %s with matching pinned backup dependencies', async behavior => {
  const test = example('mathbox-curve.html', behavior);
  try {
    const doc = test.dom.window.document;
    await vi.waitFor(() => expect((doc.getElementById('controls') as HTMLFieldSetElement).disabled).toBe(false));
    expect(test.mathbox.mathBox).toHaveBeenCalledOnce();
    expect(test.urls).toHaveLength(6);
    for (let i = 0; i < test.urls.length; i += 2) {
      const primary = new URL(test.urls[i]!);
      const backup = new URL(test.urls[i + 1]!);
      expect(primary.origin).toBe('https://cdn.jsdelivr.net');
      expect(backup.origin).toBe('https://unpkg.com');
      expect(primary.pathname).toBe('/npm' + backup.pathname);
    }
    expect(doc.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(0);
    expect(doc.querySelectorAll('script[src]')).toHaveLength(3);
    const slider = doc.getElementById('amplitude') as HTMLInputElement;
    slider.value = '0'; slider.dispatchEvent(new test.dom.window.Event('input'));
    expect(test.sample(Math.PI / 4)).toBe(0);
    doc.getElementById('reset')!.click();
    expect(test.sample(Math.PI / 4)).toBeCloseTo(1);
  } finally { test.dom.window.close(); }
});

it.each(['plotly-function.html', 'mathbox-curve.html'])('%s shows failed/absent/timed-out dependency errors without enabling controls', async name => {
  for (const behavior of ['error', 'missing-global', 'timeout'] as const) {
    const test = example(name, behavior);
    try {
      const doc = test.dom.window.document;
      await vi.waitFor(() => expect(doc.getElementById('status')!.getAttribute('role')).toBe('alert'));
      expect((doc.getElementById('controls') as HTMLFieldSetElement).disabled).toBe(true);
      expect(test.plotly.newPlot).not.toHaveBeenCalled();
      expect(test.mathbox.mathBox).not.toHaveBeenCalled();
      if (name === 'mathbox-curve.html') {
        expect(test.urls).toHaveLength(2);
        expect(doc.getElementById('status')!.textContent).toContain('Three.js');
        for (const url of test.urls) expect(doc.getElementById('status')!.textContent).toContain(url);
        expect(doc.querySelectorAll('script[src]')).toHaveLength(0);
      }
    } finally { test.dom.window.close(); }
  }
});
