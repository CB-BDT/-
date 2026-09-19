/**
 * 界面多语言（i18n）。
 *
 * 设计：**中文即 key（gettext 风格）**。
 *  - 默认语言 zh-CN 时 t() 直接返回原文，零字典负担、零查找开销。
 *  - 只有 en 需要字典；漏翻时回退中文，绝不会把 `btn.save` 这种内部
 *    key 露给用户（语义 key 方案的主要风险）。
 *  - 代价：改中文原字面量时要同步改字典键。用 scripts 侧校验脚本兜底
 *    （会报出「字典里有、代码里没有」的失效条目）。
 *
 * 范围：面向用户可见的界面文案。**不含** AI 提示词（那是发给模型的
 * 指令，不是界面文本，翻译它反而可能影响输出语言）。
 */

export type UiLang = "zh-CN" | "en"

export const UI_LANGS: { value: UiLang; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" }
]

/** 语言变更监听：设置页切换后需要重渲染所有界面 */
type Listener = () => void
const listeners = new Set<Listener>()

let current: UiLang = "zh-CN"

export function getUiLang(): UiLang {
  return current
}

/** 由设置加载链路调用（whatsapp.ts / background.ts 启动与 settings 变更时） */
export function setUiLang(next: UiLang | string | undefined): boolean {
  const safe: UiLang = next === "en" ? "en" : "zh-CN"
  if (safe === current) return false
  current = safe
  // 同步 HTML lang，便于浏览器选择正确的字体/断行规则
  try {
    if (typeof document !== "undefined") document.documentElement.lang = safe
  } catch {
    /* 非 DOM 环境（background）忽略 */
  }
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* 单个监听者异常不影响其它 */
    }
  })
  return true
}

export function subscribeUiLang(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 取界面文案。zh-CN 直接返回原文；en 查字典，缺失回退中文。 */
export function t(zh: string): string {
  if (current === "zh-CN") return zh
  return EN[zh] ?? zh
}

/**
 * 带参数的文案：`tf("已读取 {n} 条消息", { n: 5 })`。
 * 用 `{name}` 占位而非模板字符串，字典键才能两种语言共用同一形态。
 */
export function tf(zh: string, params: Record<string, string | number>): string {
  const raw = t(zh)
  return raw.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole
  )
}

/* ==========================================================================
   English dictionary
   键 = 源码中的中文模板（含 {占位符}）；值 = 英文。
   按界面区域分组，便于维护。
   ========================================================================== */
const EN: Record<string, string> = {
  /* ------------------------------ 通用 ------------------------------ */
  "保存": "Save",
  "已保存": "Saved",
  "取消": "Cancel",
  "删除": "Delete",
  "关闭": "Close",
  "收起": "Collapse",
  "重试": "Retry",
  "停止": "Stop",
  "测试": "Test",
  "重置": "Reset",
  "加载中…": "Loading…",
  "已停止": "Stopped",
  "失败": "Failed",
  "女": "Female",
  "男": "Male",
  "中性": "Neutral",
  "客户": "Customer",
  "谷歌翻译": "Google Translate",
  "Lingva 翻译": "Lingva",
  "自定义模型": "Custom model",
  "谷歌·免费": "Google · Free",
  "Lingva·免费": "Lingva · Free",

  /* ---------------------------- 底部工具栏 ---------------------------- */
  "回译验证": "Back-translation check",
  "女性语气": "Female tone",
  "男性语气": "Male tone",
  "不指定性别": "Unspecified gender",
  "翻译中…": "Translating…",
  "翻译中，完成后自动发送…": "Translating; will send automatically when ready…",
  "输入中文后自动生成译文": "Type in Chinese to generate the translation",
  "替换并发送": "Replace & send",
  "替换到输入框": "Replace in input box",
  "暂无译文": "No translation yet",
  "已替换，请手动发送": "Replaced — please send manually",
  "已发送": "Sent",
  "自动发送失败，请手动发送": "Auto-send failed — please send manually",
  "写入输入框失败，请手动复制": "Could not write to the input box — please copy manually",
  "引擎返回空译文": "Engine returned an empty translation",
  "引擎返回空译文（已取消自动发送，请手动处理）":
    "Engine returned an empty translation (auto-send cancelled — please handle manually)",
  "{err}（已取消自动发送，请手动处理）": "{err} (auto-send cancelled — please handle manually)",
  " (降级)": " (fallback)",
  "重要提示": "Important",
  "重要提示：使用前请阅读中英文说明": "Important: please read the notice before use",
  "功能介绍": "Features",
  "功能介绍与作者联系方式": "Feature list and author contact",
  "AI 回复": "AI reply",
  "AI 思考回复：读取最近 50 条聊天，按你的目的生成 A/B/C 三个候选回复":
    "AI smart reply: reads the last 50 messages and drafts A/B/C options for your goal",
  "CB BDT 插件注入的界面": "Injected by the CB BDT extension",
  "翻译目标语言（手动选择后对该客户保持记住；「自动」= 跟随对方手机号归属国）":
    "Target language (remembered per customer; Auto = follow the customer's phone country)",
  "翻译引擎（全局生效并记住）：谷歌 / Lingva / DeepL / 自定义模型":
    "Translation engine (global and persisted): Google / Lingva / DeepL / custom model",
  "说话者性别：{label}（点击切换 女/男/不指定）":
    "Speaker gender: {label} (click to cycle female/male/neutral)",
  "生效语言：西/葡/法/意/德/俄/波兰/阿拉伯/印地/孟加拉。":
    "Applies to Spanish, Portuguese, French, Italian, German, Russian, Polish, Arabic, Hindi, Bengali.",
  "不只是 interesada：形容词、过去时分词、俄语过去式动词（сделала）、":
    "Not just interesada: adjectives, past participles, Russian past-tense verbs (сделала),",
  "法语 je suis arrivée、德语职业名词（Ärztin）都会按此性别变化。":
    "French je suis arrivée and German job nouns (Ärztin) all change with this gender.",
  "AI 引擎严格执行；Google 免费接口为上下文引导，重要句子建议切 AI 复核。":
    "AI engines enforce it strictly; the free Google endpoint only uses it as context — switch to an AI engine for important sentences.",
  "英/中/日/韩/土等语言语法上无性别词形，不会有差别（日韩仅 AI 会调整语气）。":
    "English, Chinese, Japanese, Korean and Turkish have no grammatical gender, so there is no difference (AI only adjusts tone for Japanese/Korean).",
  "定时": "Schedule",
  "定时发送：设定时间（可选时区，默认北京时间）与内容，到点自动发给当前客户。":
    "Scheduled send: pick a time (timezone optional, defaults to Beijing) and content; it is sent to the current customer automatically.",
  "防风控：多个客户的定时时间请彼此错开几分钟，不要设成同一时刻。":
    "Anti-spam tip: stagger scheduled times by a few minutes instead of using the same moment.",
  "实际模型/引擎：{model}": "Actual model/engine: {model}",
  "回译：{text}": "Back-translation: {text}",

  /* ---------------------------- 重要提示面板 ---------------------------- */
  "重要提示 / Important Notice": "Important Notice",
  "用途说明": "Purpose",
  "：本项目仅供个人技术研究、学习与交流使用，作者不对代码的准确性、完整性或特定用途适用性作任何明示或暗示的保证。":
    ": This project is for personal technical research, learning and exchange only. The author makes no warranty, express or implied, as to its accuracy, completeness or fitness for a particular purpose.",
  "合法合规": "Compliance",
  "：请在遵守当地法律法规的前提下使用本项目。严禁将本项目及其衍生版本用于任何非法用途（包括但不限于网络攻击、数据窃取、非法入侵等）。":
    ": Use this project in compliance with your local laws and regulations. Any illegal use (including but not limited to network attacks, data theft or unauthorized intrusion) is strictly prohibited.",
  "责任自负": "Liability",
  "：使用者因使用本项目所产生的一切直接或间接后果、法律责任及损失，均由使用者自行承担，原作者不承担任何形式的连带责任。":
    ": Any direct or indirect consequence, legal liability or loss arising from use is borne solely by the user. The original author assumes no joint liability of any kind.",
  "无侵权声明": "Non-infringement",
  "：本项目中的所有内容均属于个人技术实践分享，不涉及任何商业机密或第三方侵权行为。":
    ": All content is a personal technical practice sharing and involves no commercial secrets or third-party infringement.",
  "CB BDT · 非官方项目，与 WhatsApp / Meta 无任何关联，请遵守其服务条款；自动化操作存在账号风控风险，由使用者自行承担。":
    "CB BDT · Unofficial project, not affiliated with WhatsApp or Meta. Please comply with their Terms of Service. Automation carries account risk; you bear that risk yourself.",
  "Unofficial project, not affiliated with WhatsApp or Meta. Automation carries account risk; you bear that risk yourself.":
    "Unofficial project, not affiliated with WhatsApp or Meta. Automation carries account risk; you bear that risk yourself.",

  /* ---------------------------- 功能介绍面板 ---------------------------- */
  "功能介绍 / Features": "Features",
  "自动翻译": "Auto-translate",
  "：收到消息自动译好，挂在气泡下方；视口懒加载，聊天记录再多也不卡。":
    ": Incoming messages are translated and shown under the bubble; lazy-loaded so long chats stay smooth.",
  "逐条切引擎": "Per-message engine",
  "：每条消息都能单独换引擎——谷歌免费 / Lingva 免费 / DeepL / 自定义 AI 模型。":
    ": Switch engine per message — Google, Lingva, DeepL or a custom AI model.",
  "出站回译": "Outbound back-translation",
  "：输入中文自动译成客户语言，可一键替换，也能回车直接发送译文。":
    ": Type Chinese and it is translated into the customer's language; replace with one click or press Enter to send the translation.",
  "说话者性别": "Speaker gender",
  "：女 / 男 / 中性三态，西、葡、法、意、德、俄等语言的语法人称更准确。":
    ": Female / male / neutral, for accurate grammatical gender in Spanish, Portuguese, French, Italian, German, Russian and more.",
  "客户资料卡": "Customer profile",
  "：姓名 / 职位 / 兴趣 / 生日 / 备注；资料摘要在聊天顶栏下方常驻完全展开显示。":
    ": Name, job, interests, birthday and notes; the summary is shown fully expanded in a bar under the chat header.",
  "智能识别": "Smart detection",
  "：按手机号判断客户国家与语言，并识别对方设备（iOS / Android / Web）。":
    ": Detects the customer's country and language from the phone number and identifies their device (iOS / Android / Web).",
  "快捷话术面板": "Quick-reply panel",
  "：分组管理、一键填入输入框、拖拽排序，宽度可拖并可记忆。":
    ": Grouped templates, one-click insert, drag to reorder, and a draggable width that is remembered.",
  "定时发送消息": "Scheduled messages",
  "：设定时间自动发给指定客户；防风控错峰、防重复发送、离线补发。":
    ": Send automatically at a chosen time; staggered to avoid spam filters, with duplicate protection and offline catch-up.",
  "地图位置发送": "Map location sending",
  "：搜索地点 → 地图预览 → 一键把定位卡片发给客户。":
    ": Search a place, preview it on the map, then send the location card to the customer.",
  "AI 会话总结": "AI chat summary",
  "：读取该客户": ": Summarises ",
  "全部聊天记录": "the full conversation",
  "，流式生成摘要，可保存到客户备注。": " with streaming output, and can be saved to the customer's notes.",
  "：读取最近 50 条聊天，按你填的": ": Reads the last 50 messages and, based on your ",
  "目的提示词": "goal prompt",
  "（自动保存）生成": " (auto-saved), drafts ",
  "A/B/C 三个候选回复，点一下直接填入聊天输入框。候选语言可单独设置（默认跟随":
    "A/B/C candidate replies; click one to insert it into the chat box. The draft language is configurable (defaults to ",
  "「接收消息译为」，即你看得懂的语言），发送时再自动翻译成客户语言。":
    "\"Translate incoming into\", i.e. the language you read), then translated into the customer's language when sent.",
  "作者联系方式 / Author contact — Telegram:": "Author contact — Telegram:",
  "Features: auto-translate incoming messages with per-message engine switching; outbound back-translation with one-click or Enter-to-send; speaker gender grammar; customer profile and notes; country and device detection; quick-reply panel; scheduled messages; map location sending; AI chat summary over the full conversation; AI smart reply producing A/B/C drafts from the last 50 messages per your own goal prompt.":
    "Features: auto-translate incoming messages with per-message engine switching; outbound back-translation with one-click or Enter-to-send; speaker gender grammar; customer profile and notes; country and device detection; quick-reply panel; scheduled messages; map location sending; AI chat summary over the full conversation; AI smart reply producing A/B/C drafts from the last 50 messages per your own goal prompt.",

  /* -------------------------- AI 思考回复面板 -------------------------- */
  "AI 思考回复 / Smart Reply": "Smart Reply",
  "候选语言": "Draft language",
  "自动 · 跟随接收翻译语言（当前：{lang}）": "Auto · follow incoming target ({lang})",
  "AI 用哪种语言写候选给我看（点选即保存）。候选填入输入框后，发送时会按工具栏的回译语言翻译成客户语言。":
    "Which language the AI uses to draft options for you (saved on select). After inserting, it is translated into the customer's language using the toolbar setting.",
  "填写你的目的提示词（自动保存），例：催客户尽快确认订单，语气礼貌但坚定":
    "Describe your goal (auto-saved), e.g. urge the customer to confirm the order, polite but firm",
  "已保存 ✓": "Saved ✓",
  "{n} 生成 3 个回复": "Generate 3 replies",
  "生成 3 个回复": "Generate 3 replies",
  "正在读取最近 50 条聊天记录…": "Reading the last 50 messages…",
  "当前聊天没有可分析的文本消息（可能全是表情/图片/系统提示）":
    "No analysable text in this chat (it may contain only emoji, images or system notices)",
  "已读取 {count} 条消息，AI 思考中…": "Read {count} messages; the AI is thinking…",
  "推进对话，保持友好专业": "move the conversation forward, staying friendly and professional",
  "AI 返回内容为空或无法解析，请重试": "The AI returned nothing usable — please try again",
  "读取聊天记录失败：{err}（请确认 WPP 已就绪）":
    "Failed to read the chat history: {err} (make sure WPP is ready)",
  "填入输入框失败：请先点开一个聊天，再重试":
    "Could not insert into the input box — open a chat first and retry",
  "已填入输入框，可直接发送或编辑": "Inserted into the input box — send or edit as needed",
  "点击填入聊天输入框": "Click to insert into the chat box",
  "读取最近 {n} 条记录，用「候选语言」写出 A/B/C 供你挑选；点选即填入输入框，":
    "Drafts A/B/C from the last {n} messages in your draft language for you to pick; click one to insert it, ",
  "发送前会按工具栏的回译语言翻译成客户语言，可自行修改。":
    "then it is translated into the customer's language via the toolbar setting and can still be edited.",
  "Drafts A/B/C in your reading language from the last {n} messages; click one to insert it, then it is translated into the customer's language before sending.":
    "Drafts A/B/C in your reading language from the last {n} messages; click one to insert it, then it is translated into the customer's language before sending.",

  /* ---------------------------- 快捷话术面板 ---------------------------- */
  "快捷话术": "Quick replies",
  "展开快捷话术（CB BDT 插件）": "Open quick replies (CB BDT extension)",
  "拖动调整面板宽度": "Drag to resize the panel",
  "AI 分析并总结与该客户的全部聊天记录": "AI summary of the full conversation with this customer",
  "输入分析要求，如：总结核心需求、意向等级、待跟进事项":
    "Analysis prompt, e.g. summarise core needs, intent level and follow-ups",
  "WPP 未就绪，无法读取聊天记录": "WPP is not ready — cannot read the chat history",
  "AI 聊天总结": "AI chat summary",
  "开始分析": "Analyse",
  "等待 AI 响应…": "Waiting for the AI…",
  "已复制 ✓": "Copied ✓",
  "复制结果": "Copy result",
  "追加保存至客户备注": "Append to customer notes",
  "复制失败：{err}": "Copy failed: {err}",
  "保存失败：{err}": "Save failed: {err}",
  "删除分组": "Delete group",
  "分组名称": "Group name",
  "新分组": "New group",
  "分组": "Group",
  "话术标题（如：打招呼）": "Title (e.g. Greeting)",
  "话术内容（如：¡Hola! ¿Cómo estás?）": "Content (e.g. ¡Hola! ¿Cómo estás?)",
  "新话术": "New reply",
  "还没有话术": "No quick replies yet",
  "把常发的问候、报价、物流说明存成话术，点一下即可插入输入框":
    "Save frequent greetings, quotes and shipping notes as templates, then insert them with one click",
  "新建第一条话术": "Create your first reply",
  "新增话术": "Add reply",
  "已填入输入框": "Inserted into the input box",
  "填入失败": "Insert failed",
  "编辑": "Edit",
  "发送定位": "Send location",
  "输入地点名（如：北京天安门）": "Enter a place (e.g. Tiananmen, Beijing)",
  "查找位置": "Find place",
  "查找中...": "Searching…",
  "生成地图预览中...": "Generating map preview…",
  "预览生成失败，仍可直接发送（不带地图图）":
    "Preview failed but you can still send it (without the map image)",
  "位置预览": "Location preview",
  "确认发送": "Confirm and send",
  "发送中...": "Sending…",
  "发送失败：{err}": "Send failed: {err}",
  "失败：未找到「{query}」，换个关键词试试": "Not found: \"{query}\" — try another keyword",
  "已找到「{query}」，请确认后发送": "Found \"{query}\" — please confirm before sending",
  "失败：{err}": "Failed: {err}",
  "WPP 未就绪，定位功能不可用。": "WPP is not ready; location sending is unavailable.",
  "请打开 F12 控制台查看 [wa-copilot] 日志确认原因。":
    "Open the F12 console and check the [wa-copilot] logs for the reason.",
  "AI 总结": "AI summary",
  "请总结该客户的核心需求、意向等级（高/中/低）、待跟进事项，并给出下一步跟进建议。":
    "Summarise the customer's core needs, intent level (high/medium/low) and pending follow-ups, and suggest the next step.",
  "正在读取该客户聊天记录…": "Reading this customer's chat history…",
  "共 {total} 条，取最近 {count} 条分析中…":
    "{total} messages in total; analysing the latest {count}…",
  "已读取 {count} 条消息，AI 分析中…": "Read {count} messages; the AI is analysing…",

  /* ------------------------------ 客户资料卡 ------------------------------ */
  "客户备注": "Customer notes",
  "姓名": "Name",
  "张三": "John Smith",
  "工作": "Job",
  "采购经理": "Purchasing manager",
  "兴趣": "Interests",
  "足球 / 咖啡": "Football / Coffee",
  "生日（MM-DD）": "Birthday (MM-DD)",
  "备注": "Notes",
  "其他补充信息": "Other notes",
  "发送目标语言": "Outgoing target language",
  "自动（按手机号归属国）": "Auto (from phone country)",

  /* ------------------------ 备注条 / 列表相关 ------------------------ */
  "{date}生日": "{date} birthday",
  "互动 {days} 天": "{days} days active",

  /* ------------------------------ 设置页 ------------------------------ */
  "翻译引擎": "Translation engine",
  "主引擎": "Primary engine",
  "Google/Lingva/DeepL 失败时降级到自定义模型（无则 Google）；自定义模型失败时降级到 Google":
    "Falls back to a custom model when Google/Lingva/DeepL fail (or to Google if none); a failing custom model falls back to Google",
  "Google 翻译（免费）": "Google Translate (free)",
  "Lingva 翻译（免费接口）": "Lingva (free endpoint)",
  "DeepL 翻译（官方 API）": "DeepL (official API)",
  "自定义模型（{name}）": "Custom model ({name})",
  "未填模型名": "no model name",
  "需自备：在 DeepL 官网注册后获取，免费版以 :fx 结尾（每月 50 万字符）；自动选择免费/Pro 端点，401/403 时不降级、直接报错":
    "Bring your own key from the DeepL website. Free keys end with :fx (500k chars/month). The free/Pro endpoint is chosen automatically; 401/403 errors are reported instead of falling back",
  "失败自动降级": "Automatic fallback",
  "主引擎超时 / 429 / 网络错误时切换到另一个引擎":
    "Switch to another engine when the primary one times out, returns 429 or fails on the network",
  "并发上限": "Concurrency limit",
  "同时发出的翻译请求数，过高容易触发限流":
    "Number of simultaneous translation requests; too high may trigger rate limiting",
  "自定义模型（OpenAI 兼容）": "Custom models (OpenAI-compatible)",
  "接入任意 OpenAI 兼容接口（中转站 / OpenRouter / Kimi / 通义等）：填接口根地址（到 /v1 这级，自动补 /chat/completions）、API Key 与模型标识符；配置后可在聊天框随时切换使用。Key 以明文存放在 chrome.storage.local":
    "Connect any OpenAI-compatible endpoint (gateway, OpenRouter, Kimi, Qwen, etc.): enter the base URL (up to /v1; /chat/completions is appended automatically), the API key and the model id. Configured models can be switched at any time in the chat box. Keys are stored in plain text in chrome.storage.local",
  "快速导入（三要素）": "Quick import (three fields)",
  "接口地址": "Base URL",
  "OpenAI 兼容根地址；未写 /v1 会自动补全": "OpenAI-compatible base URL; /v1 is appended if missing",
  "模型标识符": "Model id",
  "显示名称（可选）": "Display name (optional)",
  "留空则使用模型标识符": "Falls back to the model id when empty",
  "如 Kimi（聊天框切换时展示）": "e.g. Kimi (shown in the chat box switcher)",
  "添加并测试": "Add & test",
  "添加并测试中…": "Adding and testing…",
  "显示名称": "Display name",
  "OpenAI 兼容根地址，如 https://api.moonshot.cn/v1":
    "OpenAI-compatible base URL, e.g. https://api.moonshot.cn/v1",
  "服务方提供的模型名，如 moonshot-v1-8k": "Model id from the provider, e.g. moonshot-v1-8k",
  "删除该模型": "Delete this model",
  "+ 添加模型": "+ Add model",
  "翻译目标": "Translation targets",
  "接收消息译为": "Translate incoming into",
  "发送消息译为": "Translate outgoing into",
  "对方国家语言": "Customer's country language",
  "固定语言": "Fixed language",
  "固定目标语言": "Fixed target language",
  "我的说话性别": "My speaking gender",
  "出站回译按此性别选词形：形容词/分词（interesada、contenta）、法语过去时（arrivée）、俄语过去式（сделала）、德语职业名词（Ärztin）等；英/中/日/韩/土等语言无语法性别，不产生差别":
    "Outbound translation picks word forms by this gender: adjectives/participles (interesada, contenta), French past tense (arrivée), Russian past tense (сделала), German job nouns (Ärztin). English, Chinese, Japanese, Korean and Turkish have no grammatical gender, so there is no difference",
  "女性（默认）": "Female (default)",
  "男性": "Male",
  "不指定": "Unspecified",
  "发送行为": "Sending behaviour",
  "Enter 自动替换并发送": "Enter replaces and sends automatically",
  "开启后：回车一律发送翻译后的文本——译文没出来会先拦住，翻译完成自动发送，绝不发原文。关闭时：回车保持 WhatsApp 原生行为（发原文），译文用手动按钮确认后发送":
    "When on, Enter always sends the translation: it is intercepted until the translation is ready, then sent automatically — the original is never sent. When off, Enter keeps WhatsApp's native behaviour (sends the original) and you confirm the translation with the button",
  "界面语言": "Interface language",
  "插件界面与提示文案的语言，切换后立即生效并记住。默认简体中文":
    "Language of the extension UI and messages. Takes effect immediately and is remembered. Defaults to Simplified Chinese",
  "诊断": "Diagnostics",
  "测试翻译": "Test translation",
  "清除缓存": "Clear cache",
  "清除中…": "Clearing…",
  "翻译缓存已清除": "Translation cache cleared",
  "清除失败：{err}": "Clear failed: {err}",
  "测试中…": "Testing…",
  "测试成功": "Test succeeded",
  "保存中…": "Saving…",
  "已载入默认值，记得保存": "Defaults loaded — remember to save",
  "（已从 {engine} 降级）": " (fell back from {engine})",
  "读取设置失败：{err}": "Failed to load settings: {err}",
  "请至少填写「接口地址」与「模型标识符」（API Key 可留空，部分中转站不鉴权）":
    "Please fill in at least the base URL and the model id (the API key may be empty for gateways without auth)",
  "已添加「{label}」，正在测试…": "Added \"{label}\", testing…",
  "添加失败：{err}": "Add failed: {err}",
  "✅ 已添加「{label}」，可在聊天框引擎下拉切换使用":
    "✅ Added \"{label}\" — switch to it from the engine dropdown in the chat box",
  "已添加但测试失败：{err}（条目已保留，可修改后重试）":
    "Added but the test failed: {err} (the entry was kept — edit it and try again)",
  "免责声明 / Disclaimer": "Disclaimer",
  "设置": "Settings",
  "插件设置": "Extension settings",
  "与 WhatsApp 原生界面无关": "Not part of WhatsApp's native UI",
  "非官方项目，与 WhatsApp / Meta 无任何关联": "Unofficial project, not affiliated with WhatsApp or Meta",
  "Unofficial project, not affiliated with WhatsApp or Meta.":
    "Unofficial project, not affiliated with WhatsApp or Meta.",

  /* --------------------------- 定时消息弹窗 --------------------------- */
  "定时消息": "Scheduled message",
  "发送时间": "Send time",
  "内容": "Content",
  "选择图片/视频": "Choose image/video",
  "附件（可选：图片或视频，≤16MB）": "Attachment (optional: image or video, ≤16 MB)",
  "先看回译再决定发哪版": "Check the back-translation before deciding which version to send",
  "译文确认（比对回译无误后填入，只发这一份）":
    "Translation check (insert once verified against the back-translation; only this version is sent)",
  "译文（{lang}）：": "Translation ({lang}):",
  "回译（译回中文，比对语义）：": "Back-translation (into Chinese, to compare meaning):",
  "填入译文（到点只发送这一份）": "Insert translation (only this version is sent)",
  "🔄 翻译回译确认": "🔄 Translate & back-check",
  "移除附件": "Remove attachment",
  "到点后将自动发送（可翻译成客户语言后发送）":
    "Sends automatically at the chosen time (you may translate it into the customer's language first)",
  "请先填写消息内容再翻译": "Enter the message content before translating",
  "翻译失败：{err}": "Translation failed: {err}",
  "✅ 译文已填入内容框（到点只发送这一份，可继续手动修改）":
    "✅ Translation inserted into the content box (only this version is sent; you can still edit it)",
  "请填写消息内容或选择图片/视频": "Enter the message content or choose an image/video",
  "无法识别当前聊天，请先打开一个客户的会话":
    "Cannot identify the current chat — open a customer conversation first",
  "时间格式不正确": "Invalid time format",
  "发送时间至少要在 1 分钟之后": "The send time must be at least 1 minute from now",
  "当前客户": "Current customer",
  "已创建定时消息": "Scheduled message created",
  "（未识别）": "(unrecognised)",
  " ✅ 正规 JID": " ✅ valid JID",
  " ⚠️ 非正规 JID（将尝试名字匹配）": " ⚠️ non-standard JID (will try name matching)",
  "说话者性别：{label}": "Speaker gender: {label}",
  "（无内容）": "(no content)",
  "（{lang}译文）": "({lang} translation)",
  "（北京 {time}）": "(Beijing {time})",
  "（已重试 {n} 次）": "({n} retries)",
  "删除该定时任务": "Delete this scheduled message",
  "创建定时": "Schedule",
  "只支持图片或视频文件": "Only image or video files are supported",
  "文件太大（{size}MB），上限 16MB": "File too large ({size} MB); the limit is 16 MB",
  "待发送": "Pending",
  "发送中": "Sending",
  "已发送（定时）": "Sent",
  "已取消": "Cancelled",
  "⏰ 待发送": "⏰ Pending",
  "📤 发送中": "📤 Sending",
  "✅ 已发送": "✅ Sent",
  "❌ 失败": "❌ Failed",
  "🚫 已取消": "🚫 Cancelled",
  "定时任务": "Scheduled messages",
  "暂无定时消息": "No scheduled messages",

  /* ------------------------- 消息徽章 / 提示 ------------------------- */
  "翻译失败": "Translation failed",
  "翻译中": "Translating",
  "翻译": "Translate",
  "✨ {label} 翻译中…": "✨ Translating with {label}…",
  "编辑客户备注": "Edit customer notes",
  "已切换翻译引擎，正在重译当前会话（{n} 条）":
    "Engine switched — re-translating this conversation ({n} messages)",
  "{engine} 翻译失败：{msg}": "{engine} failed: {msg}",
  "确定使用": "Use this",
  "待确认": "Confirm?",
  "翻译失败：请检查 API Key": "Translation failed — check your API key",

  /* ---------------------------- 内容脚本提示 ---------------------------- */
  "未配置 AI 模型，请到设置页添加自定义模型（OpenAI 兼容接口）":
    "No AI model configured. Add a custom model (OpenAI-compatible) on the settings page.",
  "无法识别当前聊天，不能保存备注": "Cannot identify the current chat; notes cannot be saved",
  "无法确定当前聊天": "Cannot determine the current chat",
  "WPP 未就绪": "WPP is not ready",
  "WPP 调用失败": "WPP call failed",
  "WPP 调用超时（10s）": "WPP call timed out (10s)",
  "WPP 未就绪，无法发送定位": "WPP is not ready — cannot send the location",
  "WPP 设备检测超时": "Device detection timed out",
  "WPP 列表预取超时": "Chat-list prefetch timed out",
  "WPP 号码查询超时": "Phone-number lookup timed out",
  "定时消息发送超时": "Scheduled message send timed out",
  "检测到与刚发送任务内容相同，已自动跳过（防重复）":
    "Identical content was just sent — skipped automatically (duplicate protection)",
  "WhatsApp 页面长时间未打开，已取消发送":
    "WhatsApp has been closed for too long — the send was cancelled",
  "页面无响应：{err}": "The page is not responding: {err}",
  "后台无响应": "The background service is not responding",
  "连接已断开（可能是扩展后台休眠），请重试":
    "Connection lost (the extension background may have gone to sleep) — please retry",
  "未配置「{label}」的 API Key，请先在设置中填写":
    "No API key configured for \"{label}\" — please fill it in on the settings page",
  "我": "Me",
  "（已截取最近 {n} 条，更早的 {m} 条因长度限制省略）":
    "(trimmed to the latest {n} messages; {m} earlier ones were omitted for length)",
  "IndexedDB 打开失败": "Failed to open IndexedDB",
  "媒体写入失败": "Failed to save the media file",
  "媒体读取失败": "Failed to read the media file",
  "媒体删除失败": "Failed to delete the media file",
  "文件读取失败": "File read failed",
  "拉取聊天记录超时": "Timed out reading the chat history",
  "AI 请求超时（{s}s）": "AI request timed out ({s}s)",
  "定时消息已发送给 {name}": "Scheduled message sent to {name}",
  "定时消息发送失败（{name}）：{err}": "Scheduled message failed ({name}): {err}",
  "已自动发送定时消息": "Scheduled message sent automatically",

  /* ------------------------------ 引擎错误 ------------------------------ */
  "翻译引擎配置错误": "Translation engine configuration error",
  "引擎返回空结果": "The engine returned an empty result",
  "缺少 API Key，请在设置页填写": "Missing API key — fill it in on the settings page",
  "API Key 无效或已过期": "API key invalid or expired",
  "模型不存在，请检查模型标识符": "Model not found — check the model id",
  "请求过于频繁，请稍后再试": "Too many requests — please try again later",
  "所有翻译引擎均失败": "All translation engines failed",
  "Google 翻译（免费接口）": "Google Translate (free endpoint)",
  "Lingva 响应格式异常（缺少 translation 字段）":
    "Unexpected Lingva response (missing the translation field)",
  "DeepL 翻译": "DeepL",
  "未配置 DeepL API Key，请在设置中填写":
    "No DeepL API key configured — fill it in on the settings page",
  "DeepL 暂不支持目标语言 {target}": "DeepL does not support the target language {target} yet",
  "（请检查 API Key；免费版 Key 以 :fx 结尾）":
    "(check the API key; free keys end with :fx)",
  "DeepL 返回条数不匹配（{n}/{m}）": "DeepL returned a mismatched number of results ({n}/{m})",
  "该自定义模型已被删除或配置丢失，请在设置中检查":
    "This custom model was deleted or its configuration is missing — check the settings",
  "未配置「{label}」的 API Key，请在设置中填写":
    "No API key configured for \"{label}\" — fill it in on the settings page",
  "（请检查接口地址、Key 与模型标识符）": "(check the base URL, API key and model id)",
  "{label} 返回空内容（模型 {model}），请确认模型标识符可用":
    "{label} returned an empty result (model {model}) — make sure the model id is valid",
  "未配置 DeepSeek API Key，请在设置中填写":
    "No DeepSeek API key configured — fill it in on the settings page",
  "（请检查 Key 与模型标识符）": "(check the API key and model id)",
  "DeepSeek 返回空内容（模型 {model}），请确认模型标识符可用":
    "DeepSeek returned an empty result (model {model}) — make sure the model id is valid",
  "DeepSeek AI 翻译": "DeepSeek AI",

  /* --------------------------- 快捷话术默认模板 --------------------------- */
  "常用话术": "Common replies",
  "打招呼": "Greeting",
  "确认订单": "Confirm order",
  "感谢回复": "Thank you",
  "话术": "Reply",

  /* ------------------------------ 时区 ------------------------------ */
  "中国北京时间 (UTC+8)": "Beijing, China (UTC+8)",
  "日本东京 (UTC+9)": "Tokyo, Japan (UTC+9)",
  "韩国首尔 (UTC+9)": "Seoul, Korea (UTC+9)",
  "新加坡 (UTC+8)": "Singapore (UTC+8)",
  "中国香港 (UTC+8)": "Hong Kong (UTC+8)",
  "中国台北 (UTC+8)": "Taipei (UTC+8)",
  "泰国曼谷 (UTC+7)": "Bangkok, Thailand (UTC+7)",
  "越南胡志明 (UTC+7)": "Ho Chi Minh City, Vietnam (UTC+7)",
  "印尼雅加达 (UTC+7)": "Jakarta, Indonesia (UTC+7)",
  "菲律宾马尼拉 (UTC+8)": "Manila, Philippines (UTC+8)",
  "马来西亚吉隆坡 (UTC+8)": "Kuala Lumpur, Malaysia (UTC+8)",
  "印度孟买/新德里 (UTC+5:30)": "Mumbai/New Delhi, India (UTC+5:30)",
  "阿联酋迪拜 (UTC+4)": "Dubai, UAE (UTC+4)",
  "沙特利雅得 (UTC+3)": "Riyadh, Saudi Arabia (UTC+3)",
  "俄罗斯莫斯科 (UTC+3)": "Moscow, Russia (UTC+3)",
  "土耳其伊斯坦布尔 (UTC+3)": "Istanbul, Turkey (UTC+3)",
  "埃及开罗 (UTC+2)": "Cairo, Egypt (UTC+2)",
  "英国伦敦 (UTC+0/1)": "London, UK (UTC+0/1)",
  "法国巴黎 (UTC+1/2)": "Paris, France (UTC+1/2)",
  "德国柏林 (UTC+1/2)": "Berlin, Germany (UTC+1/2)",
  "西班牙马德里 (UTC+1/2)": "Madrid, Spain (UTC+1/2)",
  "美国纽约 (UTC-5/-4)": "New York, USA (UTC-5/-4)",
  "美国芝加哥 (UTC-6/-5)": "Chicago, USA (UTC-6/-5)",
  "美国丹佛 (UTC-7/-6)": "Denver, USA (UTC-7/-6)",
  "美国洛杉矶 (UTC-8/-7)": "Los Angeles, USA (UTC-8/-7)",
  "巴西圣保罗 (UTC-3)": "São Paulo, Brazil (UTC-3)",
  "墨西哥城 (UTC-6)": "Mexico City (UTC-6)",
  "澳大利亚悉尼 (UTC+10/11)": "Sydney, Australia (UTC+10/11)",
  "新西兰奥克兰 (UTC+12/13)": "Auckland, New Zealand (UTC+12/13)",
  "尼日利亚拉各斯 (UTC+1)": "Lagos, Nigeria (UTC+1)",
  "UTC 标准时间": "UTC",

  /* ------------------------- 零散补充（增量收录） ------------------------- */
  "回译": "Back-translation",
  "自动（{lang}）": "Auto ({lang})",
  "AI 思考回复": "Smart reply",
  "确认使用": "Use this",
  "移除": "Remove",
  "时区": "Time zone",
  "发给：": "To: ",
  "目标标识：": "Target ID: ",
  "消息内容（中文即可，下面选语言并翻译确认）":
    "Message content (Chinese is fine — pick a language below and confirm the translation)",
  "发送语言（与聊天框回译同引擎）":
    "Send language (same engine as the chat-box back-translation)",
  "无附件（纯文字）": "No attachment (text only)",
  "全部定时任务（{n}）": "All scheduled messages ({n})",
  "· 技术研究用途，与 WhatsApp / Meta 无关联":
    "· Technical research only; not affiliated with WhatsApp / Meta",
  "⚠️ 防风控提示：不要给多个客户设置完全相同的发送时间，同一时刻批量 群发式定时容易触发 WhatsApp 的机器人风控。建议不同客户彼此错开 几分钟以上；插件在发送时刻会自动再加 5–45 秒随机延迟错峰。个别 粉丝少量使用没问题。需保持 WhatsApp 页面在电脑上打开（关闭后到点 会自动重试，页面重新打开即补发）。":
    "⚠️ Anti-spam tip: do not schedule several customers for the exact same moment — batch sending at one instant easily triggers WhatsApp's bot protection. Stagger them by a few minutes or more; the extension already adds a random 5–45 s jitter at send time. Occasional use with a few contacts is fine. Keep the WhatsApp page open on your computer (if it is closed, the extension retries and sends as soon as the page is reopened)."
}

/** 供校验脚本使用：导出英文字典（不参与运行时逻辑） */
export const __EN_DICT = EN
