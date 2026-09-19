export const QUICK_REPLY_CSS = `
  :host { all: initial; }

  /* ==================================================================
     CB BDT 品牌视觉（插件专属）：冷钛蓝 + 金属铜橙 + 钢印浮雕
     这套配色只用于本插件注入的 UI，与 WhatsApp 原生绿一眼可分。
     深色由 :host-context 判定（折叠态渲染的是 .qr-collapsed，拿不到 data-dark）。
     ================================================================== */
  :host {
    --steel: #3a5769;              /* 冷钛蓝：主色 */
    --grad-steel: linear-gradient(135deg, #4b6d82 0%, #2e4453 100%);
    --copper: #a85d2f;             /* 金属铜橙：强调色 */
    --grad-copper: linear-gradient(135deg, #c4713c 0%, #8c4722 100%);
    --steel-soft: rgba(58, 87, 105, .1);
    --copper-soft: rgba(168, 93, 47, .12);
    --danger: #c62828;
    --fg: #2b3338;                 /* 主要文字 */
    --muted: #5e6b73;              /* 次要文字 */
    --glass: rgba(242, 243, 245, .8);
    --glass-2: rgba(232, 235, 237, .72);
    --gl-border: rgba(255, 255, 255, .7);
    --hairline: rgba(43, 51, 56, .08);
    --input-bg: #eaedef;
    /* 钢印浮雕 / 凹陷：还原参考稿的立体压印质感 */
    --emboss-sm: 2px 2px 4px rgba(0, 0, 0, .1), -2px -2px 4px rgba(255, 255, 255, .75);
    --emboss: 3px 3px 6px rgba(0, 0, 0, .12), -3px -3px 6px rgba(255, 255, 255, .8);
    --inset: inset 2px 2px 4px rgba(0, 0, 0, .16), inset -2px -2px 4px rgba(255, 255, 255, .7);
    --glow-steel: 0 4px 8px rgba(46, 68, 83, .3);
    --glow-copper: 0 4px 8px rgba(140, 71, 34, .3);
    --focus: 0 0 0 2px rgba(58, 87, 105, .5);
    --shadow-card: 0 16px 44px rgba(43, 51, 56, .2), inset 0 1px 0 rgba(255, 255, 255, .7);
    --r-sm: 10px;
    --r-md: 14px;
    --r-lg: 18px;
    --t: .2s cubic-bezier(.4, 0, .2, 1);
    --font: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  }
  :host-context(html.dark), :host-context(body.dark) {
    --fg: #e8ebed;
    --muted: #9aa8b0;
    --glass: rgba(30, 38, 44, .86);
    --glass-2: rgba(148, 163, 184, .12);
    --gl-border: rgba(255, 255, 255, .08);
    --hairline: rgba(255, 255, 255, .08);
    --input-bg: rgba(148, 163, 184, .14);
    --steel-soft: rgba(92, 130, 153, .2);
    --copper-soft: rgba(196, 113, 60, .2);
    /* 深色下浮雕会发灰，改成凹陷 + 暗投影 */
    --inset: inset 2px 2px 5px rgba(0, 0, 0, .45), inset -1px -1px 3px rgba(255, 255, 255, .05);
    --emboss-sm: 0 1px 2px rgba(0, 0, 0, .35);
    --emboss: 0 2px 6px rgba(0, 0, 0, .4);
    --shadow-card: 0 16px 44px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .06);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .qr-panel {
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.6;
    color: var(--fg);
    background: var(--glass);
    -webkit-backdrop-filter: blur(20px) saturate(1.5);
    backdrop-filter: blur(20px) saturate(1.5);
    border: 1px solid var(--gl-border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  /* 不支持毛玻璃时退化为实色，保证可读性 */
  @supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
    .qr-panel { background: rgba(242, 243, 245, .97); }
    :host-context(html.dark) .qr-panel,
    :host-context(body.dark) .qr-panel { background: rgba(30, 38, 44, .97); }
  }

  .qr-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--hairline);
  }
  .qr-title {
    flex: 1 1 auto;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -.2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .qr-inserted {
    flex: 0 0 auto;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--copper);
    white-space: nowrap;
  }
  .qr-toggle {
    flex: 0 0 auto;
    width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--gl-border);
    border-radius: var(--r-sm);
    background: var(--glass-2);
    box-shadow: var(--emboss-sm);
    color: var(--muted);
    cursor: pointer; font-size: 16px; outline: none;
    transition: transform var(--t), box-shadow var(--t), color var(--t);
  }
  .qr-toggle:hover {
    color: var(--steel);
    transform: translateY(-1px);
    box-shadow: var(--emboss);
  }
  .qr-toggle:focus-visible { box-shadow: var(--focus); }

  /* 左缘拖拽调宽手柄：平时隐形，hover/拖拽时显示竖向把手 */
  .qr-resize {
    position: absolute;
    left: 0; top: 0;
    width: 8px; height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .qr-resize::after {
    content: "";
    position: absolute;
    left: 3px; top: 50%;
    width: 3px; height: 44px;
    transform: translateY(-50%);
    border-radius: 3px;
    background: var(--steel);
    opacity: 0;
    transition: opacity var(--t);
  }
  .qr-resize:hover::after,
  .qr-resize[data-dragging="true"]::after { opacity: .85; }

  .qr-tabs {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--hairline);
  }
  .qr-tab {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--gl-border);
    background: var(--glass-2);
    box-shadow: var(--emboss-sm);
    color: var(--muted);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
    white-space: nowrap;
    outline: none;
    transition: transform var(--t), box-shadow var(--t), color var(--t), background var(--t);
  }
  .qr-tab:hover { color: var(--steel); transform: translateY(-1px); box-shadow: var(--emboss); }
  /* 选中的分组用铜橙渐变：本插件的强调色，和 WhatsApp 绿完全不同 */
  .qr-tab[data-active="true"] {
    background: var(--grad-copper);
    color: #fff;
    border-color: transparent;
    font-weight: 600;
    box-shadow: var(--glow-copper);
  }
  .qr-tab[data-active="true"]:hover { filter: brightness(1.08); }
  .qr-tab:focus-visible { box-shadow: var(--focus); }
  .qr-tab-add {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 12px;
    border: 1px dashed rgba(58, 87, 105, .45);
    border-radius: 999px;
    background: transparent;
    color: var(--steel);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
    outline: none;
    transition: border-color var(--t), color var(--t), background var(--t), transform var(--t);
  }
  .qr-tab-add:hover {
    border-style: solid;
    border-color: var(--steel);
    background: var(--steel-soft);
    transform: translateY(-1px);
  }
  .qr-tab-add:focus-visible { box-shadow: var(--focus); }
  .qr-tab-del {
    margin-left: 6px;
    font-size: 11px;
    opacity: .55;
    cursor: pointer;
    transition: opacity var(--t), color var(--t);
  }
  .qr-tab-del:hover { opacity: 1; }
  /* 选中标签是铜橙底，删除键在深底上必须用白色 */
  .qr-tab[data-active="true"] .qr-tab-del:hover { color: #fff; }
  .qr-tab:not([data-active="true"]) .qr-tab-del:hover { color: var(--danger); }

  .qr-list {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scrollbar-width: thin;
  }
  /* 6px 极窄半透明滚动条：不抢视觉、不占布局 */
  .qr-list::-webkit-scrollbar,
  .qr-sum-result::-webkit-scrollbar { width: 6px; height: 6px; }
  .qr-list::-webkit-scrollbar-thumb,
  .qr-sum-result::-webkit-scrollbar-thumb {
    background: rgba(58, 87, 105, .35);
    border-radius: 4px;
  }
  .qr-list::-webkit-scrollbar-track,
  .qr-sum-result::-webkit-scrollbar-track { background: transparent; }

  .qr-item {
    position: relative;
    border: 1px solid var(--gl-border);
    border-radius: var(--r-md);
    padding: 12px 14px;
    background: var(--glass-2);
    box-shadow: var(--emboss-sm);
    cursor: pointer;
    transition: transform var(--t), box-shadow var(--t), border-color var(--t), background var(--t);
  }
  .qr-item:hover {
    transform: translateY(-1px);
    border-color: rgba(58, 87, 105, .5);
    background: var(--glass);
    box-shadow: var(--emboss);
  }
  .qr-item:active { transform: translateY(0); }
  .qr-item-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
  }
  .qr-item-title {
    flex: 1 1 auto;
    font-size: 14px;
    font-weight: 600;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .qr-item-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 6px;
  }
  .qr-act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px; height: 24px;
    border: none; border-radius: 8px;
    background: transparent;
    color: var(--muted); cursor: pointer;
    font-size: 13px; padding: 0;
    line-height: 1;
    outline: none;
    transition: background var(--t), color var(--t);
  }
  .qr-act:hover { color: var(--copper); background: var(--copper-soft); }
  .qr-act[data-act="del"]:hover { color: var(--danger); background: rgba(198, 40, 40, .12); }
  .qr-act:focus-visible { box-shadow: var(--focus); }
  .qr-item-body {
    font-size: 14px;
    line-height: 1.6;
    color: var(--muted);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 68px;
    overflow: hidden;
  }
  .qr-drag {
    flex: 0 0 auto;
    cursor: grab;
    color: var(--muted);
    font-size: 14px;
    opacity: .45;
    transition: opacity var(--t);
  }
  .qr-drag:hover { opacity: 1; }

  /* 点击话术卡片后的 ✓ 成功微动画（铜橙钢印感，覆盖在卡片上不拦截点击） */
  .qr-item-check {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: inherit;
    background: var(--copper-soft);
    color: var(--copper);
    font-size: 24px;
    font-weight: 700;
    pointer-events: none;
    animation: qr-check-pop .5s cubic-bezier(.34, 1.56, .64, 1);
  }
  @keyframes qr-check-pop {
    0% { opacity: 0; transform: scale(.9); }
    45% { opacity: 1; transform: scale(1.06); }
    100% { opacity: 1; transform: scale(1); }
  }

  /* 空状态：柔和图标 + 一句提示 + 一个快速入口，避免大片空白 */
  .qr-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
    padding: 32px 20px;
  }
  .qr-empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px; height: 52px;
    border-radius: 50%;
    background: var(--copper-soft);
    box-shadow: var(--inset);
    font-size: 24px;
    margin-bottom: 2px;
  }
  .qr-empty-title { font-size: 15px; font-weight: 600; color: var(--fg); }
  .qr-empty-text {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--muted);
    max-width: 230px;
  }
  .qr-empty .qr-btn { margin-top: 6px; }

  .qr-footer {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--hairline);
  }
  .qr-add-btn {
    width: 100%;
    height: 38px;
    border: 1px dashed rgba(58, 87, 105, .45);
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--steel);
    cursor: pointer;
    font: inherit;
    font-size: 13.5px;
    font-weight: 500;
    outline: none;
    transition: border-color var(--t), color var(--t), background var(--t), transform var(--t);
  }
  .qr-add-btn:hover {
    border-style: solid;
    border-color: var(--steel);
    background: var(--steel-soft);
    transform: translateY(-1px);
  }
  .qr-add-btn:focus-visible { box-shadow: var(--focus); }

  /* 品牌条：logo + 技术研究用途声明（插件身份标识） */
  .qr-brand {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-top: 1px solid var(--hairline);
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--muted);
  }
  .qr-brand-text { flex: 1 1 auto; min-width: 0; }
  .qr-brand-name { font-weight: 600; color: var(--copper); }

  .qr-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--gl-border);
    border-radius: var(--r-md);
    background: var(--glass-2);
    box-shadow: var(--emboss-sm);
  }
  /* 输入框用凹陷钢印：插件 UI 与 WhatsApp 扁平输入框的显著区别 */
  .qr-input {
    font: inherit;
    font-size: 14px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--input-bg);
    box-shadow: var(--inset);
    color: var(--fg);
    outline: none;
    transition: box-shadow var(--t);
  }
  .qr-input::placeholder { color: var(--muted); opacity: .85; }
  .qr-input:focus { border-color: var(--steel); box-shadow: var(--inset), var(--focus); }
  .qr-textarea {
    font: inherit;
    font-size: 14px;
    line-height: 1.6;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--input-bg);
    box-shadow: var(--inset);
    color: var(--fg);
    outline: none;
    resize: vertical;
    min-height: 64px;
    max-height: 140px;
    transition: box-shadow var(--t);
  }
  .qr-textarea::placeholder { color: var(--muted); opacity: .85; }
  .qr-textarea:focus { border-color: var(--steel); box-shadow: var(--inset), var(--focus); }
  .qr-form-row {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .qr-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    padding: 0 16px;
    cursor: pointer;
    outline: none;
    white-space: nowrap;
    transition: transform var(--t), box-shadow var(--t), filter var(--t), background var(--t);
  }
  /* 主操作：冷钛蓝金属渐变；强调操作（ok）：铜橙金属渐变 */
  .qr-btn[data-variant="primary"] {
    background: var(--grad-steel);
    color: #fff;
    box-shadow: var(--glow-steel);
  }
  .qr-btn[data-variant="ok"] {
    background: var(--grad-copper);
    color: #fff;
    box-shadow: var(--glow-copper);
  }
  .qr-btn[data-variant="primary"]:hover:not(:disabled),
  .qr-btn[data-variant="ok"]:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }
  .qr-btn[data-variant="primary"]:active:not(:disabled),
  .qr-btn[data-variant="ok"]:active:not(:disabled) {
    filter: brightness(.95);
    transform: translateY(0);
    box-shadow: none;
  }
  .qr-btn[data-variant="ghost"] {
    background: var(--glass-2);
    color: var(--muted);
    border-color: var(--gl-border);
    box-shadow: var(--emboss-sm);
  }
  .qr-btn[data-variant="ghost"]:hover:not(:disabled) {
    color: var(--steel);
    transform: translateY(-1px);
    box-shadow: var(--emboss);
  }
  .qr-btn:focus-visible { box-shadow: var(--focus); }
  .qr-btn:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; transform: none; filter: none; }

  /* 折叠态：右下角悬浮玻璃圆钮 + 放大的 CB BDT 标记 + 手指点击提示。
     高度由宿主（固定 64px 且 flex 拉伸）给出，宽度用 aspect-ratio 反推，
     不用 width:100%——那在 flex 项里会按内容宽度塌成椭圆。 */
  .qr-collapsed {
    position: relative;
    height: 100%;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--gl-border);
    background: var(--glass);
    -webkit-backdrop-filter: blur(20px) saturate(1.5);
    backdrop-filter: blur(20px) saturate(1.5);
    box-shadow: var(--shadow-card);
    color: var(--fg);
    cursor: pointer;
    transition: transform var(--t), box-shadow var(--t);
  }
  .qr-collapsed:hover {
    transform: translateY(-2px) scale(1.03);
    box-shadow: var(--glow-copper), var(--shadow-card);
  }
  /* 呼吸涟漪：持续扩散一圈铜橙细环，暗示「可以点」 */
  .qr-collapsed::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid var(--copper);
    opacity: .5;
    pointer-events: none;
    animation: qr-ripple 2.2s cubic-bezier(.4, 0, .2, 1) infinite;
  }
  @keyframes qr-ripple {
    0% { transform: scale(.94); opacity: .5; }
    70% { transform: scale(1.14); opacity: 0; }
    100% { transform: scale(1.14); opacity: 0; }
  }
  /* 手指点击提示：铜橙圆底徽标，做轻微点按动作 */
  .qr-tap {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 26px; height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--grad-copper);
    box-shadow: var(--glow-copper);
    font-size: 14px;
    line-height: 1;
    pointer-events: none;
    animation: qr-tap 1.6s ease-in-out infinite;
  }
  @keyframes qr-tap {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  /* 尊重系统的「减少动态效果」设置 */
  @media (prefers-reduced-motion: reduce) {
    .qr-collapsed::after, .qr-tap { animation: none; }
  }
  @supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
    .qr-collapsed { background: rgba(242, 243, 245, .97); }
    :host-context(html.dark) .qr-collapsed,
    :host-context(body.dark) .qr-collapsed { background: rgba(30, 38, 44, .97); }
  }
  /* ------------------------------ AI 总结 ------------------------------ */
  .qr-sum-bar {
    flex: 0 0 auto;
    padding: 12px 12px 0;
  }
  .qr-sum-toggle {
    width: 100%;
    height: 38px;
    border: 1px solid rgba(168, 93, 47, .45);
    border-radius: var(--r-sm);
    background: var(--copper-soft);
    color: var(--copper);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    outline: none;
    transition: transform var(--t), box-shadow var(--t), filter var(--t);
  }
  .qr-sum-toggle:hover {
    filter: brightness(1.05);
    transform: translateY(-1px);
    box-shadow: var(--glow-copper);
  }
  .qr-sum-toggle:focus-visible { box-shadow: var(--focus); }
  .qr-sum-panel {
    flex: 0 0 auto;
    max-height: 56%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-bottom: 1px solid var(--hairline);
  }
  .qr-sum-prompt {
    font: inherit;
    font-size: 14px;
    line-height: 1.6;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--input-bg);
    box-shadow: var(--inset);
    color: var(--fg);
    outline: none;
    resize: vertical;
    min-height: 56px;
    max-height: 110px;
    transition: box-shadow var(--t);
  }
  .qr-sum-prompt::placeholder { color: var(--muted); opacity: .85; }
  .qr-sum-prompt:focus { border-color: var(--steel); box-shadow: var(--inset), var(--focus); }
  .qr-sum-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .qr-sum-status {
    flex: 1 1 auto;
    font-size: 12.5px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .qr-sum-error {
    font-size: 12.5px;
    color: var(--danger);
    line-height: 1.5;
    word-break: break-word;
  }
  .qr-sum-result {
    flex: 1 1 auto;
    overflow-y: auto;
    min-height: 90px;
    max-height: 280px;
    padding: 12px 14px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: var(--input-bg);
    box-shadow: var(--inset);
    font-size: 14px;
    line-height: 1.65;
    scrollbar-width: thin;
  }
  .qr-sum-md-h { font-weight: 600; font-size: 14.5px; margin: 8px 0 4px; color: var(--fg); }
  .qr-sum-md-h:first-child { margin-top: 0; }
  .qr-sum-md-p { margin: 4px 0; word-break: break-word; white-space: pre-wrap; }
  .qr-sum-md-li { margin: 4px 0 4px 18px; word-break: break-word; }
  .qr-cursor { color: var(--copper); animation: qr-blink 1s steps(1) infinite; }
  @keyframes qr-blink { 50% { opacity: 0; } }
  .qr-sum-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
  }
  .qr-sum-actions .qr-btn { flex: 1 1 0; padding: 0 10px; }
`
