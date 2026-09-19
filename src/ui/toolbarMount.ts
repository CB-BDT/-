export const TOOLBAR_CSS = `
  :host { all: initial; }

  /* ==================================================================
     CB BDT 品牌视觉（与话术面板/弹窗同一套）：
     冷钛蓝 #3a5769 为主、金属铜橙 #a85d2f 为强调，配金属浮雕阴影。
     这套配色只属于本插件注入的 UI，跟 WhatsApp 原生绿一眼可分。
     ================================================================== */
  .wac-bar {
    --steel: #3a5769;
    --grad-steel: linear-gradient(135deg, #4b6d82 0%, #2e4453 100%);
    --copper: #a85d2f;
    --grad-copper: linear-gradient(135deg, #c4713c 0%, #8c4722 100%);
    --danger: #c62828;
    --fg: #2b3338;
    --muted: #5e6b73;
    --glass: rgba(242, 243, 245, .8);
    --glass-2: rgba(232, 235, 237, .72);
    --gl-border: rgba(255, 255, 255, .7);
    --steel-soft: rgba(58, 87, 105, .1);
    --hairline: rgba(43, 51, 56, .08);
    --input-bg: #eaedef;
    --emboss-sm: 2px 2px 4px rgba(0, 0, 0, .1), -2px -2px 4px rgba(255, 255, 255, .75);
    --emboss: 3px 3px 6px rgba(0, 0, 0, .12), -3px -3px 6px rgba(255, 255, 255, .8);
    --inset: inset 2px 2px 4px rgba(0, 0, 0, .16), inset -2px -2px 4px rgba(255, 255, 255, .7);
    --glow-steel: 0 4px 8px rgba(46, 68, 83, .3);
    --glow-copper: 0 4px 8px rgba(140, 71, 34, .3);
    --focus: 0 0 0 2px rgba(58, 87, 105, .5);
    --shadow: 0 8px 24px rgba(43, 51, 56, .14), inset 0 1px 0 rgba(255, 255, 255, .7);
    --r-sm: 10px;
    --r-md: 10px;
    --t: .2s cubic-bezier(.4, 0, .2, 1);
    --font: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;

    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 8px 10px 10px;
    padding: 10px 12px;
    font-family: var(--font);
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--muted);
    background: var(--glass);
    -webkit-backdrop-filter: blur(20px) saturate(1.5);
    backdrop-filter: blur(20px) saturate(1.5);
    border: 1px solid var(--gl-border);
    border-radius: 16px;
    box-shadow: var(--shadow);
    box-sizing: border-box;
  }
  .wac-bar[data-dark="true"] {
    --fg: #e8ebed;
    --muted: #9aa8b0;
    --glass: rgba(30, 38, 44, .86);
    --glass-2: rgba(148, 163, 184, .12);
    --gl-border: rgba(255, 255, 255, .08);
    --steel-soft: rgba(92, 130, 153, .22);
    --hairline: rgba(255, 255, 255, .08);
    --input-bg: rgba(148, 163, 184, .14);
    --emboss-sm: 0 1px 2px rgba(0, 0, 0, .35);
    --emboss: 0 2px 6px rgba(0, 0, 0, .4);
    --inset: inset 2px 2px 5px rgba(0, 0, 0, .45), inset -1px -1px 3px rgba(255, 255, 255, .05);
    --shadow: 0 8px 24px rgba(0, 0, 0, .45), inset 0 1px 0 rgba(255, 255, 255, .06);
  }
  .wac-bar[data-dark="true"] .wac-notice li b,
  .wac-bar[data-dark="true"] .wac-notice-en b { color: #a9c3d3; }
  @supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
    .wac-bar { background: rgba(242, 243, 245, .97); }
    .wac-bar[data-dark="true"] { background: rgba(30, 38, 44, .97); }
  }

  .wac-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    min-width: 0;
  }
  .wac-sub { font-size: 13px; }

  /* 行首品牌标记：logo + 「回译」，标明这是插件注入的界面 */
  .wac-brand {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: .2px;
    padding: 3px 9px 3px 6px;
    border: 1px solid var(--gl-border);
    border-radius: 8px;
    background: var(--glass-2);
    box-shadow: var(--emboss-sm);
    color: var(--steel);
  }
  .wac-bar[data-dark="true"] .wac-brand { color: #a9c3d3; }

  .wac-select {
    flex: 0 0 auto;
    max-width: 148px;
    height: 32px;
    font: inherit;
    font-size: 13px;
    color: var(--fg);
    background: var(--input-bg);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    box-shadow: var(--inset);
    padding: 0 6px;
    cursor: pointer;
    outline: none;
    transition: box-shadow var(--t);
  }
  .wac-select:hover { box-shadow: var(--inset), var(--focus); }
  .wac-select:focus-visible { box-shadow: var(--inset), var(--focus); }

  .wac-preview {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: var(--fg);
  }
  .wac-back {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: .85;
  }
  .wac-note { flex: 0 0 auto; }
  .wac-note[data-tone="error"] { color: var(--danger); }
  .wac-note[data-tone="ready"] { color: var(--copper); }

  /* 引擎标记：低调金属 chip */
  .wac-engine {
    flex: 0 0 auto;
    font-size: 12px;
    padding: 3px 9px;
    border-radius: 8px;
    background: var(--glass-2);
    box-shadow: var(--emboss-sm);
    color: var(--muted);
    white-space: nowrap;
  }

  /* 性别 pill：底色/文字色由内联主题色控制，这里只管形状与反馈 */
  .wac-gender {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--gl-border);
    border-radius: 999px;
    box-shadow: var(--emboss-sm);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    outline: none;
    transition: transform var(--t), box-shadow var(--t), filter var(--t);
  }
  .wac-gender:hover { filter: brightness(1.06); transform: translateY(-1px); box-shadow: var(--emboss); }
  .wac-gender:focus-visible { box-shadow: var(--focus); }

  /* 按钮：主操作冷钛蓝渐变，次要操作为描边 ghost */
  .wac-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    padding: 0 15px;
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    color: #fff;
    background: var(--grad-steel);
    border: 1px solid transparent;
    border-radius: var(--r-md);
    cursor: pointer;
    white-space: nowrap;
    outline: none;
    box-shadow: var(--glow-steel);
    transition: transform var(--t), box-shadow var(--t), filter var(--t);
  }
  .wac-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }
  .wac-btn:active:not(:disabled) {
    filter: brightness(.95);
    transform: translateY(0);
    box-shadow: none;
  }
  .wac-btn:focus-visible { box-shadow: var(--focus); }
  .wac-btn:disabled {
    opacity: .45;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
    filter: none;
  }
  .wac-btn-ghost {
    background: var(--glass-2);
    color: var(--muted);
    border-color: var(--gl-border);
    box-shadow: var(--emboss-sm);
  }
  .wac-btn-ghost:hover:not(:disabled) {
    color: var(--steel);
    filter: none;
    transform: translateY(-1px);
    box-shadow: var(--emboss);
  }
  .wac-bar[data-dark="true"] .wac-btn-ghost:hover:not(:disabled) { color: #a9c3d3; }
  .wac-btn-ghost:active:not(:disabled) { box-shadow: none; }

  /* ==================================================================
     重要提示：常驻显眼按钮 + 点击就地展开的中英双语说明
     用铜橙渐变（品牌强调色）从钛蓝工具栏里跳出来，第一眼就能看到。
     ================================================================== */
  .wac-notice-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .3px;
    color: #fff;
    background: var(--grad-copper);
    border: 1px solid transparent;
    border-radius: var(--r-md);
    cursor: pointer;
    white-space: nowrap;
    outline: none;
    box-shadow: var(--glow-copper);
    transition: transform var(--t), filter var(--t), box-shadow var(--t);
  }
  .wac-notice-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .wac-notice-btn:active { filter: brightness(.95); transform: translateY(0); }
  .wac-notice-btn[aria-expanded="true"] {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .55), var(--glow-copper);
  }
  .wac-notice-btn:focus-visible { box-shadow: var(--focus); }

  /* 次要品牌按钮（功能介绍）：钛蓝描边，比铜橙的「重要提示」低一档 */
  .wac-soft-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    padding: 0 13px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .2px;
    color: var(--steel);
    background: var(--glass-2);
    border: 1px solid var(--steel);
    border-radius: var(--r-md);
    cursor: pointer;
    white-space: nowrap;
    outline: none;
    box-shadow: var(--emboss-sm);
    transition: transform var(--t), box-shadow var(--t), background var(--t), color var(--t);
  }
  .wac-soft-btn:hover { background: var(--steel-soft); transform: translateY(-1px); box-shadow: var(--emboss); }
  .wac-soft-btn:active { transform: translateY(0); box-shadow: none; }
  .wac-soft-btn[aria-expanded="true"] {
    background: var(--steel);
    color: #fff;
    box-shadow: var(--glow-steel);
  }
  .wac-soft-btn:focus-visible { box-shadow: var(--focus); }
  .wac-bar[data-dark="true"] .wac-soft-btn { color: #a9c3d3; border-color: rgba(169, 195, 211, .45); }
  .wac-bar[data-dark="true"] .wac-soft-btn[aria-expanded="true"] { color: #fff; }

  .wac-notice {
    flex: 0 0 auto;
    /* 左侧竖条与标题色由 tone 决定：默认铜橙，[data-tone="steel"] 转钛蓝 */
    --notice-accent: var(--copper);
    max-height: 44vh;
    overflow-y: auto;
    margin-top: 2px;
    padding: 12px 14px;
    border: 1px solid var(--gl-border);
    /* 左侧竖条：和弹窗、提示条同一套品牌语言 */
    border-left: 3px solid var(--notice-accent);
    border-radius: var(--r-md);
    background: var(--glass-2);
    box-shadow: var(--inset);
    scrollbar-width: thin;
    animation: wac-notice-in .18s cubic-bezier(.4, 0, .2, 1);
  }
  .wac-notice[data-tone="steel"] { --notice-accent: var(--steel); }
  @keyframes wac-notice-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
  }
  .wac-notice::-webkit-scrollbar { width: 6px; height: 6px; }
  .wac-notice::-webkit-scrollbar-thumb {
    background: rgba(58, 87, 105, .35);
    border-radius: 4px;
  }
  .wac-notice::-webkit-scrollbar-track { background: transparent; }
  .wac-notice-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 9px;
  }
  .wac-notice-head strong {
    flex: 1 1 auto;
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: .2px;
    color: var(--notice-accent);
  }
  .wac-notice-close {
    flex: 0 0 auto;
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 6px;
    background: transparent; color: var(--muted);
    cursor: pointer; font-size: 13px; line-height: 1; outline: none;
    transition: background var(--t), color var(--t);
  }
  .wac-notice-close:hover { background: var(--glass); color: var(--fg); }
  .wac-notice-close:focus-visible { box-shadow: var(--focus); }
  .wac-notice-list { margin: 0 0 9px; padding-left: 18px; }
  .wac-notice-list li {
    margin: 0 0 5px;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--fg);
  }
  .wac-notice-list li b { color: var(--steel); font-weight: 700; }
  .wac-notice-en {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--muted);
  }
  .wac-notice-en b { color: var(--steel); font-weight: 700; }
  .wac-notice-meta {
    margin: 9px 0 0;
    padding-top: 9px;
    border-top: 1px solid var(--hairline);
    font-size: 11.5px;
    line-height: 1.55;
    font-weight: 600;
    color: var(--notice-accent);
  }
  /* 作者联系方式里的 Telegram 链接：可点、可复制 */
  .wac-notice-link {
    color: var(--notice-accent);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .wac-notice-link:hover { filter: brightness(1.15); }

  /* ---------------------- AI 思考回复（功能 11） ---------------------- */
  .wac-reply-saved {
    flex: 0 0 auto;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--notice-accent);
    white-space: nowrap;
  }

  /* 阅读语言行：标签 + 下拉，窄屏下允许换行 */
  .wac-reply-lang {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }
  .wac-reply-lang-label {
    flex: 0 0 auto;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--steel);
  }
  .wac-bar[data-dark="true"] .wac-reply-lang-label { color: #a9c3d3; }
  .wac-reply-lang-select {
    flex: 1 1 200px;
    min-width: 0;
    height: 32px;
    font: inherit;
    font-size: 13px;
    color: var(--fg);
    background: var(--input-bg);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    box-shadow: var(--inset);
    padding: 0 6px;
    cursor: pointer;
    outline: none;
    transition: box-shadow var(--t);
  }
  .wac-reply-lang-select:hover { box-shadow: var(--inset), var(--focus); }
  .wac-reply-lang-select:focus-visible { box-shadow: var(--inset), var(--focus); }

  .wac-reply-prompt {
    display: block;
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 13.5px;
    line-height: 1.6;
    padding: 10px 12px;
    margin-bottom: 9px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--input-bg);
    box-shadow: var(--inset);
    color: var(--fg);
    outline: none;
    resize: vertical;
    min-height: 62px;
    max-height: 130px;
    transition: box-shadow var(--t), border-color var(--t);
  }
  .wac-reply-prompt::placeholder { color: var(--muted); opacity: .85; }
  .wac-reply-prompt:focus {
    border-color: var(--steel);
    box-shadow: var(--inset), var(--focus);
  }

  .wac-reply-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 9px;
  }
  .wac-reply-status {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* 生成按钮：铜橙渐变，与「重要提示」同色系（都是需要用户主动点的动作） */
  .wac-reply-go {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: var(--grad-copper);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    cursor: pointer;
    white-space: nowrap;
    outline: none;
    box-shadow: var(--glow-copper);
    transition: transform var(--t), filter var(--t);
  }
  .wac-reply-go:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .wac-reply-go:active { filter: brightness(.95); transform: translateY(0); }
  .wac-reply-go:focus-visible { box-shadow: var(--focus); }
  .wac-reply-stop {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    background: var(--glass-2);
    border: 1px solid var(--gl-border);
    border-radius: var(--r-sm);
    cursor: pointer;
    white-space: nowrap;
    outline: none;
    box-shadow: var(--emboss-sm);
    transition: transform var(--t), color var(--t), box-shadow var(--t);
  }
  .wac-reply-stop:hover { color: var(--steel); transform: translateY(-1px); box-shadow: var(--emboss); }
  .wac-reply-stop:focus-visible { box-shadow: var(--focus); }

  .wac-reply-error {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--danger);
    word-break: break-word;
    margin-bottom: 8px;
  }

  /* 流式原样预览：生成中先给反馈，结束后替换成候选卡片 */
  .wac-reply-stream {
    max-height: 140px;
    overflow-y: auto;
    padding: 9px 11px;
    margin-bottom: 9px;
    border-radius: var(--r-sm);
    background: var(--input-bg);
    box-shadow: var(--inset);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--muted);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .wac-reply-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .wac-reply-card {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    font: inherit;
    text-align: left;
    color: var(--fg);
    background: var(--glass);
    border: 1px solid var(--gl-border);
    border-radius: var(--r-sm);
    box-shadow: var(--emboss-sm);
    cursor: pointer;
    outline: none;
    transition: transform var(--t), box-shadow var(--t), border-color var(--t);
  }
  .wac-reply-card:hover {
    transform: translateY(-1px);
    border-color: var(--copper);
    box-shadow: var(--emboss);
  }
  .wac-reply-card:active { transform: translateY(0); box-shadow: none; }
  .wac-reply-card:focus-visible { box-shadow: var(--focus); }
  /* 候选字母徽标：铜橙圆形，和品牌强调色一致 */
  .wac-reply-letter {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px; height: 24px;
    border-radius: 50%;
    background: var(--grad-copper);
    color: #fff;
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1;
    box-shadow: var(--glow-copper);
  }
  .wac-reply-text {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13.5px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  /* 点选后的 ✓ 反馈 */
  .wac-reply-check {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--copper);
    font-size: 16px;
    font-weight: 700;
    pointer-events: none;
    animation: wac-reply-check .4s cubic-bezier(.34, 1.56, .64, 1);
  }
  @keyframes wac-reply-check {
    from { opacity: 0; transform: translateY(-50%) scale(.8); }
    to { opacity: 1; transform: translateY(-50%) scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .wac-reply-check { animation: none; }
  }
`
