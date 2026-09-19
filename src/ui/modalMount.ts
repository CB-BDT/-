export const MODAL_CSS = `
  :host { all: initial; }
  .wac-overlay {
    /* 与话术面板/工具栏同一套 CB BDT 品牌变量 */
    --steel: #3a5769;
    --grad-steel: linear-gradient(135deg, #4b6d82 0%, #2e4453 100%);
    --copper: #a85d2f;
    --danger: #c62828;
    --fg: #2b3338;
    --muted: #5e6b73;
    --glass: rgba(242, 243, 245, .84);
    --gl-border: rgba(255, 255, 255, .7);
    --hairline: rgba(43, 51, 56, .08);
    --input-bg: #eaedef;
    --emboss-sm: 2px 2px 4px rgba(0, 0, 0, .1), -2px -2px 4px rgba(255, 255, 255, .75);
    --emboss: 3px 3px 6px rgba(0, 0, 0, .12), -3px -3px 6px rgba(255, 255, 255, .8);
    --inset: inset 2px 2px 4px rgba(0, 0, 0, .16), inset -2px -2px 4px rgba(255, 255, 255, .7);
    --glow-steel: 0 4px 8px rgba(46, 68, 83, .3);
    --shadow-card: 0 24px 64px rgba(43, 51, 56, .28), inset 0 1px 0 rgba(255, 255, 255, .7);
    --r-sm: 10px;
    --r-lg: 18px;
    --focus: 0 0 0 2px rgba(58, 87, 105, .5);
    --t: .2s cubic-bezier(.4, 0, .2, 1);
    --font: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;

    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(11, 20, 26, .5);
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.6;
    color: var(--fg);
  }
  .wac-card {
    width: 380px;
    max-width: calc(100vw - 32px);
    border-radius: var(--r-lg);
    overflow: hidden;
    background: var(--glass);
    -webkit-backdrop-filter: blur(20px) saturate(1.5);
    backdrop-filter: blur(20px) saturate(1.5);
    border: 1px solid var(--gl-border);
    color: var(--fg);
    box-shadow: var(--shadow-card);
  }
  .wac-card[data-dark="true"] {
    --fg: #e8ebed;
    --muted: #9aa8b0;
    --glass: rgba(30, 38, 44, .86);
    --gl-border: rgba(255, 255, 255, .08);
    --hairline: rgba(255, 255, 255, .08);
    --input-bg: rgba(148, 163, 184, .14);
    --inset: inset 2px 2px 5px rgba(0, 0, 0, .45), inset -1px -1px 3px rgba(255, 255, 255, .05);
    --emboss-sm: 0 1px 2px rgba(0, 0, 0, .35);
    --emboss: 0 2px 6px rgba(0, 0, 0, .4);
    --shadow-card: 0 24px 64px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .06);
  }
  @supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
    .wac-card { background: rgba(242, 243, 245, .98); }
    .wac-card[data-dark="true"] { background: rgba(30, 38, 44, .98); }
  }

  .wac-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 16px 18px 12px;
    border-bottom: 1px solid var(--hairline);
    /* 左侧铜橙竖条：与提示条一致，标明这是 CB BDT 插件弹窗 */
    border-left: 3px solid var(--copper);
  }
  .wac-head strong { font-size: 16px; font-weight: 600; letter-spacing: -.2px; }
  .wac-head span {
    font-size: 12.5px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wac-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    max-height: 64vh;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  /* 6px 极窄半透明滚动条：不抢视觉、不占布局 */
  .wac-body::-webkit-scrollbar { width: 6px; height: 6px; }
  .wac-body::-webkit-scrollbar-thumb {
    background: rgba(58, 87, 105, .35);
    border-radius: 4px;
  }
  .wac-body::-webkit-scrollbar-track { background: transparent; }

  .wac-field { display: flex; flex-direction: column; gap: 6px; }
  .wac-field > label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--muted);
  }
  /* 输入框用凹陷钢印：插件 UI 与 WhatsApp 扁平输入框的显著区别 */
  .wac-field input, .wac-field textarea, .wac-field select {
    font: inherit;
    font-size: 14px;
    color: inherit;
    background: var(--input-bg);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    padding: 11px 12px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    resize: none;
    box-shadow: var(--inset);
    transition: box-shadow var(--t);
  }
  .wac-field select { cursor: pointer; }
  .wac-field select option { color: #2b3338; background: #fff; }
  .wac-field input:focus, .wac-field textarea:focus, .wac-field select:focus {
    border-color: var(--steel);
    box-shadow: var(--inset), var(--focus);
  }

  /* 正文内的操作按钮（此前只给 .wac-foot 写过样式，正文里的 .wac-btn
     会退化成浏览器默认外观）：次要按钮 = 金属描边 + 悬停冷钛蓝 */
  .wac-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    padding: 0 16px;
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--fg);
    background: var(--glass);
    border: 1px solid var(--gl-border);
    border-radius: var(--r-sm);
    cursor: pointer;
    outline: none;
    white-space: nowrap;
    box-shadow: var(--emboss-sm);
    transition: transform var(--t), box-shadow var(--t), color var(--t);
  }
  .wac-btn:hover:not(:disabled) {
    color: var(--steel);
    transform: translateY(-1px);
    box-shadow: var(--emboss);
  }
  .wac-btn:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
  .wac-btn:focus-visible { box-shadow: var(--focus); }
  .wac-btn:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; transform: none; }

  .wac-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-top: 1px solid var(--hairline);
  }
  .wac-foot .wac-spacer { flex: 1 1 auto; }
  .wac-foot button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    padding: 0 18px;
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    border-radius: var(--r-sm);
    cursor: pointer;
    outline: none;
    border: 1px solid var(--gl-border);
    background: var(--glass);
    color: inherit;
    box-shadow: var(--emboss-sm);
    transition: transform var(--t), box-shadow var(--t), color var(--t);
  }
  .wac-foot button:hover:not(:disabled) {
    color: var(--steel);
    transform: translateY(-1px);
    box-shadow: var(--emboss);
  }
  .wac-foot button:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
  .wac-foot button:focus-visible { box-shadow: var(--focus); }
  .wac-foot button:disabled { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
  /* 主操作：冷钛蓝金属渐变 */
  .wac-foot button.wac-primary {
    background: var(--grad-steel);
    border-color: transparent;
    color: #fff;
    box-shadow: var(--glow-steel);
  }
  .wac-foot button.wac-primary:hover:not(:disabled) {
    color: #fff;
    filter: brightness(1.1);
    box-shadow: var(--glow-steel);
  }
  .wac-foot button.wac-primary:active:not(:disabled) {
    filter: brightness(.95);
    box-shadow: none;
  }
  .wac-foot button.wac-danger {
    color: var(--danger);
    border-color: rgba(198, 40, 40, .35);
  }
  .wac-foot button.wac-danger:hover:not(:disabled) {
    color: var(--danger);
    background: rgba(198, 40, 40, .1);
  }
`
