import { useEffect, useMemo, useState } from "react"

import { UI_LANGS, getUiLang, setUiLang, t, tf } from "~core/i18n"
import { TARGET_LANGUAGES, languageLabel } from "~core/languages"
import { callBg, type TranslateData } from "~core/messages"
import { DEFAULT_SETTINGS, type CustomModel, type Settings } from "~core/settings"

import {
  Button,
  COLORS,
  NumberInput,
  Row,
  Section,
  Select,
  StackRow,
  StatusText,
  TextInput,
  Toggle
} from "./controls"

const TEST_SENTENCE = "Hello, when will the goods be shipped?"

type Tone = "idle" | "ok" | "err" | "busy"

const LANG_OPTIONS = TARGET_LANGUAGES.map((code) => ({
  value: code,
  label: languageLabel(code)
}))

/** 规整用户填写的接口地址：去尾部斜杠；已带 /chat/completions 则取其前；
 *  未以 /v1、/v2… 结尾时补 /v1（与 engines/custom.ts 的拼接规则对齐）。 */
function normalizeBaseUrl(raw: string): string {
  const b = (raw || "").trim().replace(/\/+$/, "")
  if (!b) return ""
  if (b.endsWith("/chat/completions")) {
    return b.slice(0, -"/chat/completions".length)
  }
  if (/\/v\d+$/.test(b)) return b
  return `${b}/v1`
}

/** 由「接口地址 + 模型名」生成稳定的短 id：同一组合重复导入不会换 id */
function slugId(baseUrl: string, model: string): string {
  const raw = `${baseUrl}#${model}`
  let hash = 5381
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0
  }
  return `cm${(hash >>> 0).toString(36)}`
}

/** id 去重：与前缀撞了就依次追加 -2 / -3 */
function uniqueId(base: string, existing: CustomModel[]): string {
  const taken = new Set(existing.map((m) => m.id))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/**
 * 设置页控件的悬停/按下/聚焦反馈。
 * controls.tsx 用的是内联样式，没法写 :hover / :focus-visible，
 * 这里用一小段样式补上（设置页只在 options / popup 自有文档里渲染，
 * 不会污染 WhatsApp 页面）。背景/边框内联值需要 !important 才能覆盖。
 */
const CONTROLS_CSS = `
.wac-s-input {
  transition: box-shadow .2s cubic-bezier(.4,0,.2,1), border-color .2s cubic-bezier(.4,0,.2,1);
}
.wac-s-input:hover:not(:focus) { box-shadow: inset 2px 2px 4px rgba(0,0,0,.14), inset -2px -2px 4px rgba(255,255,255,.7), 0 0 0 1px rgba(58,87,105,.25) !important; }
.wac-s-input:focus {
  border-color: #3a5769 !important;
  box-shadow: inset 2px 2px 4px rgba(0,0,0,.14), inset -2px -2px 4px rgba(255,255,255,.7), 0 0 0 2px rgba(58,87,105,.5);
}
.wac-s-btn { transition: transform .2s cubic-bezier(.4,0,.2,1), filter .2s cubic-bezier(.4,0,.2,1), box-shadow .2s cubic-bezier(.4,0,.2,1), color .2s cubic-bezier(.4,0,.2,1); }
.wac-s-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(58,87,105,.5) !important; }
.wac-s-btn[data-variant="primary"]:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.wac-s-btn[data-variant="primary"]:active:not(:disabled) {
  filter: brightness(.95);
  transform: translateY(0);
  box-shadow: none !important;
}
.wac-s-btn[data-variant="default"]:hover:not(:disabled) {
  color: #3a5769 !important;
  transform: translateY(-1px);
  box-shadow: 3px 3px 6px rgba(0,0,0,.12), -3px -3px 6px rgba(255,255,255,.8) !important;
}
.wac-s-btn[data-variant="ghost"]:hover:not(:disabled) { color: #3a5769 !important; }
.wac-s-btn:disabled { box-shadow: none !important; transform: none; filter: none; }
.wac-s-toggle:hover:not(:disabled) { filter: brightness(1.06); }
.wac-s-toggle:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(58,87,105,.5); }
/* 免责声明排版：中文正文 + 英文对照 + 品牌落款 */
.wac-disclaimer p {
  margin: 0 0 7px;
  font-size: 12.5px;
  line-height: 1.65;
  color: #5e6b73;
}
.wac-disclaimer p b { color: #2b3338; font-weight: 600; }
.wac-disclaimer .wac-disclaimer-en { font-size: 12px; color: #6b7a83; }
.wac-disclaimer-meta {
  margin: 10px 0 0 !important;
  padding-top: 9px;
  border-top: 1px solid rgba(43, 51, 56, .08);
  color: #a85d2f !important;
  font-weight: 600;
}
`

export function SettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState<Settings | null>(null)
  const [status, setStatus] = useState<{ tone: Tone; text: string }>({
    tone: "idle",
    text: ""
  })
  const [busy, setBusy] = useState(false)
  const [testResult, setTestResult] = useState<TranslateData | null>(null)
  const [testTarget, setTestTarget] = useState("")
  /** 快速导入：接口地址 + 模型名 + Key 三要素一键添加并测试 */
  const [quick, setQuick] = useState({ baseUrl: "", model: "", apiKey: "", label: "" })
  const [quickBusy, setQuickBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await callBg<Settings>({ type: "getSettings" })
      if (res.ok) {
        setSettings(res.data)
        setSaved(res.data)
      } else {
        setStatus({ tone: "err", text: tf("读取设置失败：{err}", { err: res.error }) })
      }
    })()
  }, [])

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(saved),
    [settings, saved]
  )

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  /* ------------------------------------------------- 自定义模型（OpenAI 兼容） */

  function updateCustom(i: number, patch: Partial<CustomModel>) {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            customModels: prev.customModels.map((m, idx) =>
              idx === i ? { ...m, ...patch } : m
            )
          }
        : prev
    )
  }

  function addCustom() {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            customModels: [
              ...prev.customModels,
              { id: "cm" + Date.now().toString(36), label: "", baseUrl: "", apiKey: "", model: "" }
            ]
          }
        : prev
    )
  }

  function removeCustom(i: number) {
    // 删除后若主引擎正指向它，同步切回谷歌（后台 getSettings 也有同款自愈兜底）
    setSettings((prev) => {
      if (!prev) return prev
      const victim = prev.customModels[i]
      return {
        ...prev,
        customModels: prev.customModels.filter((_, idx) => idx !== i),
        engine:
          victim && `custom:${victim.id}` === prev.engine ? "google" : prev.engine
      }
    })
  }

  /** 三要素快速导入：填「接口地址 + 模型标识符 + Key」→ 追加并立即落库
   *  → 用新模型跑一次测试翻译。落库是必须的：后台翻译读的是已保存设置，
   *  且落库后聊天框下拉才能立刻切换使用。 */
  async function quickAdd() {
    if (!settings) return
    const baseUrl = normalizeBaseUrl(quick.baseUrl)
    const model = quick.model.trim()
    const apiKey = quick.apiKey.trim()

    if (!baseUrl || !model) {
      setStatus({
        tone: "err",
        text: t("请至少填写「接口地址」与「模型标识符」（API Key 可留空，部分中转站不鉴权）")
      })
      return
    }

    const item: CustomModel = {
      id: uniqueId(slugId(baseUrl, model), settings.customModels ?? []),
      label: quick.label.trim() || model,
      baseUrl,
      apiKey,
      model
    }
    const next: Settings = {
      ...settings,
      customModels: [...(settings.customModels ?? []), item]
    }

    setQuickBusy(true)
    setSettings(next)
    setStatus({ tone: "busy", text: tf("已添加「{label}」，正在测试…", { label: item.label }) })

    const savedRes = await callBg<Settings>({ type: "setSettings", patch: next })
    if (!savedRes.ok) {
      setQuickBusy(false)
      setStatus({ tone: "err", text: tf("添加失败：{err}", { err: savedRes.error }) })
      return
    }
    setSettings(savedRes.data)
    setSaved(savedRes.data)

    const target =
      savedRes.data.outgoingTargetMode === "fixed"
        ? savedRes.data.outgoingFixedTarget
        : "en"

    // 强制单引擎测试：Key / 模型名错误会原样报错，绝不静默降级成谷歌译文
    const res = await callBg<TranslateData>({
      type: "translate",
      texts: [TEST_SENTENCE],
      target,
      engine: `custom:${item.id}`,
      skipCache: true
    })
    setQuickBusy(false)

    if (res.ok) {
      setTestResult(res.data)
      setTestTarget(target)
      setQuick({ baseUrl: "", model: "", apiKey: "", label: "" })
      setStatus({
        tone: "ok",
        text: tf("✅ 已添加「{label}」，可在聊天框引擎下拉切换使用", { label: item.label })
      })
    } else {
      // 条目保留：用户可在下方卡片修正 Key / 模型名后重新测试
      setStatus({
        tone: "err",
        text: tf("已添加但测试失败：{err}（条目已保留，可修改后重试）", { err: res.error })
      })
    }
  }

  async function save() {
    if (!settings) return
    setBusy(true)
    setStatus({ tone: "busy", text: t("保存中…") })
    const res = await callBg<Settings>({ type: "setSettings", patch: settings })
    setBusy(false)
    if (res.ok) {
      setSettings(res.data)
      setSaved(res.data)
      setStatus({ tone: "ok", text: t("已保存") })
    } else {
      setStatus({ tone: "err", text: tf("保存失败：{err}", { err: res.error }) })
    }
  }

  async function runTest() {
    if (!settings) return
    setBusy(true)
    setTestResult(null)
    setStatus({ tone: "busy", text: t("测试中…") })

    // 后台读取的是已落库的设置，所以测试前先把未保存的改动写入，
    // 否则用户刚填的 Key / 模型不会被本次测试采用。
    if (dirty) {
      const savedRes = await callBg<Settings>({ type: "setSettings", patch: settings })
      if (savedRes.ok) {
        setSettings(savedRes.data)
        setSaved(savedRes.data)
      }
    }

    const target =
      settings.outgoingTargetMode === "fixed" ? settings.outgoingFixedTarget : "en"

    const res = await callBg<TranslateData>({
      type: "translate",
      texts: [TEST_SENTENCE],
      target,
      skipCache: true
    })

    setBusy(false)
    if (res.ok) {
      setTestResult(res.data)
      setTestTarget(target)
      setStatus({ tone: "ok", text: t("测试成功") })
    } else {
      setStatus({ tone: "err", text: res.error })
    }
  }

  async function clearCache() {
    setBusy(true)
    setStatus({ tone: "busy", text: t("清除中…") })
    const res = await callBg({ type: "clearCache" })
    setBusy(false)
    setStatus(
      res.ok
        ? { tone: "ok", text: t("翻译缓存已清除") }
        : { tone: "err", text: tf("清除失败：{err}", { err: res.error }) }
    )
  }

  if (!settings) {
    return (
      <div style={{ padding: 16 }}>
        <StatusText tone="idle">{t("加载中…")}</StatusText>
      </div>
    )
  }

  const degraded = testResult && testResult.engine !== settings.engine

  // 免责声明原设计是「中英对照」：下面是固定英文段落。
  // 界面语言为英文时上方文案本身已是英文，再显示一遍会重复，故只在中文界面下保留。
  const zhMode = getUiLang() === "zh-CN"

  return (
    <div>
      <style>{CONTROLS_CSS}</style>
      <Section title={t("界面语言")}>
        <Row
          label={t("界面语言")}
          hint={t("插件界面与提示文案的语言，切换后立即生效并记住。默认简体中文")}>
          <Select
            value={settings.uiLang}
            width={190}
            options={UI_LANGS.map((l) => ({ value: l.value, label: l.label }))}
            onChange={(value) => {
              const lang = value === "en" ? "en" : "zh-CN"
              update("uiLang", lang)
              // 立即切换当前设置页文案，无需重新打开页面
              setUiLang(lang)
              // 语言即刻落库：聊天框等页面靠 storage 变更监听重渲染
              void callBg<Settings>({ type: "setSettings", patch: { uiLang: lang } }).then(
                (res) => {
                  if (res.ok) {
                    setSettings(res.data)
                    setSaved(res.data)
                  }
                }
              )
            }}
          />
        </Row>
      </Section>

      <Section title={t("翻译引擎")}>
        <Row
          label={t("主引擎")}
          hint={t(
            "Google/Lingva/DeepL 失败时降级到自定义模型（无则 Google）；自定义模型失败时降级到 Google"
          )}>
          <Select
            value={settings.engine}
            width={190}
            onChange={(value) => update("engine", value as Settings["engine"])}
            options={[
              { value: "google", label: t("Google 翻译（免费）") },
              { value: "lingva", label: t("Lingva 翻译（免费接口）") },
              { value: "deepl", label: t("DeepL 翻译（官方 API）") },
              ...(settings.customModels ?? []).map((m) => ({
                value: `custom:${m.id}`,
                label:
                  m.label ||
                  tf("自定义模型（{name}）", { name: m.model || t("未填模型名") })
              }))
            ]}
          />
        </Row>
        <Row
          label="DeepL API Key"
          hint={t(
            "需自备：在 DeepL 官网注册后获取，免费版以 :fx 结尾（每月 50 万字符）；自动选择免费/Pro 端点，401/403 时不降级、直接报错"
          )}>
          <TextInput
            value={settings.deeplKey}
            mono
            type="password"
            placeholder="xxxxxxxx-xxxx-...:fx"
            onChange={(value) => update("deeplKey", value)}
          />
        </Row>
        <Row
          label={t("失败自动降级")}
          hint={t("主引擎超时 / 429 / 网络错误时切换到另一个引擎")}>
          <Toggle
            checked={settings.enableFallback}
            onChange={(value) => update("enableFallback", value)}
          />
        </Row>
        <Row label={t("并发上限")} hint={t("同时发出的翻译请求数，过高容易触发限流")}>
          <NumberInput
            value={settings.googleConcurrency}
            min={1}
            max={8}
            onChange={(value) => update("googleConcurrency", value)}
          />
        </Row>
      </Section>

      <Section
        title={t("自定义模型（OpenAI 兼容）")}
        hint={t(
          "接入任意 OpenAI 兼容接口（中转站 / OpenRouter / Kimi / 通义等）：填接口根地址（到 /v1 这级，自动补 /chat/completions）、API Key 与模型标识符；配置后可在聊天框随时切换使用。Key 以明文存放在 chrome.storage.local"
        )}>
        <div
          style={{
            marginTop: 10,
            padding: "10px 10px 12px",
            borderRadius: 6,
            background: COLORS.panel,
            border: `1px dashed ${COLORS.border}`
          }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
            {t("快速导入（三要素）")}
          </div>
          <StackRow
            label={t("接口地址")}
            hint={t("OpenAI 兼容根地址；未写 /v1 会自动补全")}>
            <TextInput
              value={quick.baseUrl}
              mono
              placeholder="https://api.openai.com/v1"
              onChange={(value) => setQuick((p) => ({ ...p, baseUrl: value }))}
            />
          </StackRow>
          <StackRow label={t("模型标识符")}>
            <TextInput
              value={quick.model}
              mono
              placeholder="gpt-4o-mini / moonshot-v1-8k"
              onChange={(value) => setQuick((p) => ({ ...p, model: value }))}
            />
          </StackRow>
          <StackRow label="API Key">
            <TextInput
              value={quick.apiKey}
              mono
              type="password"
              placeholder="sk-..."
              onChange={(value) => setQuick((p) => ({ ...p, apiKey: value }))}
            />
          </StackRow>
          <StackRow label={t("显示名称（可选）")} hint={t("留空则使用模型标识符")}>
            <TextInput
              value={quick.label}
              placeholder={t("如 Kimi（聊天框切换时展示）")}
              onChange={(value) => setQuick((p) => ({ ...p, label: value }))}
            />
          </StackRow>
          <div style={{ paddingTop: 10 }}>
            <Button variant="primary" onClick={() => void quickAdd()} disabled={quickBusy}>
              {quickBusy ? t("添加并测试中…") : t("添加并测试")}
            </Button>
          </div>
        </div>

        {(settings.customModels ?? []).map((m, i) => (
          <div
            key={m.id}
            style={{
              marginTop: 10,
              padding: "10px 10px 12px",
              borderRadius: 6,
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`
            }}>
            <StackRow label={t("显示名称")}>
              <TextInput
                value={m.label}
                placeholder={t("如 Kimi（聊天框切换时展示）")}
                onChange={(value) => updateCustom(i, { label: value })}
              />
            </StackRow>
            <StackRow
              label={t("接口地址")}
              hint={t("OpenAI 兼容根地址，如 https://api.moonshot.cn/v1")}>
              <TextInput
                value={m.baseUrl}
                mono
                placeholder="https://api.example.com/v1"
                onChange={(value) => updateCustom(i, { baseUrl: value })}
              />
            </StackRow>
            <StackRow label="API Key">
              <TextInput
                value={m.apiKey}
                mono
                type="password"
                placeholder="sk-..."
                onChange={(value) => updateCustom(i, { apiKey: value })}
              />
            </StackRow>
            <StackRow label={t("模型标识符")} hint={t("服务方提供的模型名，如 moonshot-v1-8k")}>
              <TextInput
                value={m.model}
                mono
                placeholder="moonshot-v1-8k"
                onChange={(value) => updateCustom(i, { model: value })}
              />
            </StackRow>
            <div style={{ paddingTop: 8 }}>
              <Button onClick={() => removeCustom(i)}>{t("删除该模型")}</Button>
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 10 }}>
          <Button onClick={addCustom}>{t("+ 添加模型")}</Button>
        </div>
      </Section>

      <Section title={t("翻译目标")}>
        <Row label={t("接收消息译为")}>
          <Select
            value={settings.incomingTarget}
            width={190}
            onChange={(value) => update("incomingTarget", value)}
            options={LANG_OPTIONS}
          />
        </Row>
        <Row label={t("发送消息译为")}>
          <Select
            value={settings.outgoingTargetMode}
            width={190}
            onChange={(value) =>
              update("outgoingTargetMode", value as Settings["outgoingTargetMode"])
            }
            options={[
              { value: "country", label: t("对方国家语言") },
              { value: "fixed", label: t("固定语言") }
            ]}
          />
        </Row>
        {settings.outgoingTargetMode === "fixed" && (
          <Row label={t("固定目标语言")}>
            <Select
              value={settings.outgoingFixedTarget}
              width={190}
              onChange={(value) => update("outgoingFixedTarget", value)}
              options={LANG_OPTIONS}
            />
          </Row>
        )}
        <Row
          label={t("我的说话性别")}
          hint={t(
            "出站回译按此性别选词形：形容词/分词（interesada、contenta）、法语过去时（arrivée）、俄语过去式（сделала）、德语职业名词（Ärztin）等；英/中/日/韩/土等语言无语法性别，不产生差别"
          )}>
          <Select
            value={settings.speakerGender}
            width={150}
            onChange={(value) => update("speakerGender", value as Settings["speakerGender"])}
            options={[
              { value: "female", label: t("女性（默认）") },
              { value: "male", label: t("男性") },
              { value: "neutral", label: t("不指定") }
            ]}
          />
        </Row>
      </Section>

      <Section title={t("发送行为")}>
        <Row
          label={t("Enter 自动替换并发送")}
          hint={t(
            "开启后：回车一律发送翻译后的文本——译文没出来会先拦住，翻译完成自动发送，绝不发原文。关闭时：回车保持 WhatsApp 原生行为（发原文），译文用手动按钮确认后发送"
          )}>
          <Toggle checked={settings.autoSend} onChange={(value) => update("autoSend", value)} />
        </Row>
      </Section>

      <Section title={t("诊断")}>
        <div style={{ display: "flex", gap: 6, paddingTop: 8 }}>
          <Button onClick={() => void runTest()} disabled={busy}>
            {t("测试翻译")}
          </Button>
          <Button onClick={() => void clearCache()} disabled={busy}>
            {t("清除缓存")}
          </Button>
          <Button
            onClick={() => {
              setSettings(DEFAULT_SETTINGS)
              setTestResult(null)
              setTestTarget("")
              setStatus({ tone: "idle", text: t("已载入默认值，记得保存") })
            }}
            disabled={busy}>
            {t("重置")}
          </Button>
        </div>

        {testResult && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#eef1f2",
              boxShadow: COLORS.inset
            }}>
            <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>
              {testResult.engine} → {languageLabel(testTarget)}
              {degraded ? tf("（已从 {engine} 降级）", { engine: settings.engine }) : ""}
            </div>
            <div style={{ fontSize: 13, wordBreak: "break-word" }}>
              {testResult.texts[0]}
            </div>
          </div>
        )}
      </Section>

      <Section title={t("免责声明 / Disclaimer")}>
        <div className="wac-disclaimer">
          <p>
            <b>{t("用途说明")}</b>
            {t(
              "：本项目仅供个人技术研究、学习与交流使用，作者不对代码的准确性、完整性或特定用途适用性作任何明示或暗示的保证。"
            )}
          </p>
          <p>
            <b>{t("合法合规")}</b>
            {t(
              "：请在遵守当地法律法规的前提下使用本项目。严禁将本项目及其衍生版本用于任何非法用途（包括但不限于网络攻击、数据窃取、非法入侵等）。"
            )}
          </p>
          <p>
            <b>{t("责任自负")}</b>
            {t(
              "：使用者因使用本项目所产生的一切直接或间接后果、法律责任及损失，均由使用者自行承担，原作者不承担任何形式的连带责任。"
            )}
          </p>
          <p>
            <b>{t("无侵权声明")}</b>
            {t("：本项目中的所有内容均属于个人技术实践分享，不涉及任何商业机密或第三方侵权行为。")}
          </p>
          {zhMode && (
            <>
              <p className="wac-disclaimer-en">
                <b>Purpose</b>: This project is for personal technical research, learning and
                exchange only. The author makes no warranty, express or implied, as to its
                accuracy, completeness or fitness for a particular purpose.
              </p>
              <p className="wac-disclaimer-en">
                <b>Compliance</b>: Please use this project in compliance with your local laws
                and regulations. It is strictly prohibited to use this project or its
                derivatives for any illegal purpose, including but not limited to network
                attacks, data theft or unauthorized intrusion.
              </p>
              <p className="wac-disclaimer-en">
                <b>Liability</b>: Any direct or indirect consequence, legal liability or loss
                arising from the use of this project shall be borne solely by the user. The
                original author assumes no joint liability of any kind.
              </p>
              <p className="wac-disclaimer-en">
                <b>Non-infringement</b>: All content in this project is a personal technical
                practice sharing, and involves no commercial secrets or third-party
                infringement.
              </p>
            </>
          )}
          <p className="wac-disclaimer-meta">
            CB BDT · {t("非官方项目，与 WhatsApp / Meta 无任何关联")}
            {zhMode && (
              <>
                <br />
                Unofficial project, not affiliated with WhatsApp or Meta.
              </>
            )}
          </p>
        </div>
      </Section>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderTop: `1px solid ${COLORS.border}`,
          background: "#eef1f2"
        }}>
        <Button variant="primary" onClick={() => void save()} disabled={busy || !dirty}>
          {dirty ? t("保存") : t("已保存")}
        </Button>
        <StatusText tone={status.tone}>{status.text}</StatusText>
      </div>
    </div>
  )
}
