import { useEffect, useState } from "react"

import type { ContactRecord } from "~core/crm"
import { t } from "~core/i18n"
import { TARGET_LANGUAGES, languageLabel } from "~core/languages"

export interface ContactModalProps {
  title: string
  initial: ContactRecord
  dark: boolean
  exists: boolean
  onSave: (record: ContactRecord) => void
  onDelete: () => void
  onClose: () => void
}

type FormState = {
  name: string
  job: string
  interests: string
  birthday: string
  note: string
  targetLang: string
}

export function ContactModal({
  title,
  initial,
  dark,
  exists,
  onSave,
  onDelete,
  onClose
}: ContactModalProps) {
  // 字段文案走 t()：必须在渲染期求值，才能跟随界面语言切换
  const FIELDS: Array<{
    key: keyof FormState
    label: string
    placeholder: string
    textarea?: boolean
  }> = [
    { key: "name", label: t("姓名"), placeholder: t("张三") },
    { key: "job", label: t("工作"), placeholder: t("采购经理") },
    { key: "interests", label: t("兴趣"), placeholder: t("足球 / 咖啡") },
    { key: "birthday", label: t("生日（MM-DD）"), placeholder: "10-15" },
    { key: "note", label: t("备注"), placeholder: t("其他补充信息"), textarea: true }
  ]

  const [form, setForm] = useState<FormState>({
    name: initial.name ?? "",
    job: initial.job ?? "",
    interests: initial.interests ?? "",
    birthday: initial.birthday ?? "",
    note: initial.note ?? "",
    targetLang: initial.targetLang ?? ""
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [onClose])

  const empty = Object.values(form).every((value) => !value.trim())

  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div
      className="wac-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}>
      <div className="wac-card" data-dark={dark}>
        <div className="wac-head">
          <strong>{t("客户备注")}</strong>
          <span title={title}>{title}</span>
        </div>

        <div className="wac-body">
          {FIELDS.map((field) => (
            <div className="wac-field" key={field.key}>
              <label htmlFor={`wac-${field.key}`}>{field.label}</label>
              {field.textarea ? (
                <textarea
                  id={`wac-${field.key}`}
                  rows={2}
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) => set(field.key, event.target.value)}
                />
              ) : (
                <input
                  id={`wac-${field.key}`}
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  spellCheck={false}
                  onChange={(event) => set(field.key, event.target.value)}
                />
              )}
            </div>
          ))}

          <div className="wac-field">
            <label htmlFor="wac-targetLang">{t("发送目标语言")}</label>
            <select
              id="wac-targetLang"
              value={form.targetLang}
              onChange={(event) => set("targetLang", event.target.value)}>
              <option value="">{t("自动（按手机号归属国）")}</option>
              {TARGET_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageLabel(code)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="wac-foot">
          <button
            type="button"
            className="wac-danger"
            disabled={!exists}
            onClick={onDelete}>
            {t("删除")}
          </button>
          <div className="wac-spacer" />
          <button type="button" onClick={onClose}>
            {t("取消")}
          </button>
          <button
            type="button"
            className="wac-primary"
            disabled={empty}
            onClick={() => onSave({ ...form, updatedAt: Date.now() })}>
            {t("保存")}
          </button>
        </div>
      </div>
    </div>
  )
}
