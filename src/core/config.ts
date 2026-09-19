/**
 * 构建期默认值统一出口。
 *
 * 想给自己的私有构建预置默认值（默认翻译引擎、预填某个 Key、Lingva 实例地址），
 * 只改这一个文件即可，不必翻业务代码。
 *
 * 安全约定：本扩展是纯前端 MV3 扩展，没有服务端，也没有运行时环境变量——
 * 任何写进源码的 Key 都会随构建产物公开发布。因此这里一律留空默认值，
 * 由使用者在扩展「设置页」填写自己的 Key（只保存在其浏览器本地 storage 中）。
 */

/** Lingva Translate 公共实例地址（社区公益实例，失效时可换成自建/其他镜像） */
export const LINGVA_ENDPOINT = "https://lingva.ml/api/v1"

export const BUILD_CONFIG = {
  /** 首次安装时的默认翻译引擎：google / lingva / deepl / custom:<模型id> */
  defaultEngine: "google",
  /** 首次安装时预填的 DeepL API Key。开源默认留空 = 使用者自行填写。 */
  defaultDeeplKey: ""
}
