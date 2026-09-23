# TradeLingo for WhatsApp（免费开源多功能翻译插件）

WhatsApp Web 浏览器扩展（Chrome / Edge，Manifest V3）：在聊天页面直接完成**双向翻译**、**联系人资料管理**与**话术/定时消息**，以及AI总结话术全部内容，AI帮忙回复话术内容，发送定位，定时发送消息 等全部数据留在本地。

> 非官方项目，与 WhatsApp / Meta 无任何关联。使用前必须看文末免责声明。

## 功能

**翻译**
- 收到消息自动翻译，译文以徽章形式挂在气泡下方（视口懒加载，聊天记录再多也不卡）
- 每条消息的译文可**单独切换引擎**：谷歌免费 / Lingva 免费 / DeepL / 自定义 AI 模型
- 出站翻译工具栏：输入中文即可翻译成客户语言，支持「替换并发送」与「回车自动发送译文」
- 支持说话者性别（阴性/男性词形），西班牙语等语言的人称词形更准确
- 引擎失败自动降级到备用引擎；Key 配置类错误不降级、直接报错

**客户与消息**
- 按手机号识别国家 / 默认语言，自动匹配入站目标语言（可手动覆盖并按会话记忆）
- 联系人资料卡与备注（姓名、职位、兴趣、生日、备注），在聊天顶栏下方以常驻条**完全展开**显示
- 对方设备类型识别（iOS / Android / Web / 未知）
- 定位消息在地图上预览
- 快捷话术面板（可拖宽并记忆宽度）
- 定时消息（防风控随机延迟、防重复发送、离线补发）

**AI**
- AI 会话总结：读取该客户**全部聊天记录**（本地接口上限内尽量多取，超长会话自动截取最近部分并标注），流式输出，可保存到客户备注
- AI 思考回复：读取最近 50 条聊天 + 你填写的**目的提示词**（自动保存），生成 **A/B/C** 三个候选回复，点一下直接填入聊天输入框；候选语言可单独设置（默认跟随「接收消息译为」，即你读得懂的语言），发送时再自动翻译成客户语言

**界面**
- 界面语言支持 **简体中文 / English** 切换（默认简体中文）：覆盖底部工具栏、右侧话术面板、客户资料卡、定时消息弹窗、设置页与全部提示文案
- 切换后立即生效并记住，无需重启浏览器或重装扩展

## 快速开始

### 1. 构建

```bash
npm install
npm run build
```

产物目录：`build/chrome-mv3-prod`

### 2. 安装到浏览器

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `build/chrome-mv3-prod` 目录
4. 打开并刷新 https://web.whatsapp.com

### 3. 关于 API Key（重要）

本仓库**不含任何密钥**，请使用你自己的账号：

| 引擎 | 是否需要 Key | 说明 |
| --- | --- | --- |
| 谷歌翻译（免费） | 不需要 | 默认引擎，装好即用 |
| Lingva（免费） | 不需要 | 社区公共实例，稳定性一般 |
| DeepL | **需要** | 在扩展「设置页」填写你自己的 Key（免费版以 `:fx` 结尾） |
| 自定义 AI 模型 | **需要** | 任意 OpenAI 兼容接口：填「接口地址 + 模型名 + API Key」即可一键导入 |

所有 Key 只保存在你的浏览器本地存储中，不会上传到任何服务器。

### 4. 界面语言

设置页最上方「**界面语言**」可选 **简体中文**（默认）或 **English**。切换后插件注入的所有界面与提示文案立即变为所选语言，并保存在本地；已安装的老版本升级后仍默认中文，界面不会突然变化。

## 开发

```bash
npm run dev      # Plasmo 开发模式（热重载）
npm run build    # 生产构建
npx tsc --noEmit # 类型检查
npm run package  # 打包为 zip
```

技术栈：Plasmo + TypeScript + React，MV3 双世界通信（隔离世界 content script ↔ MAIN 世界 wa-js relay）。

### 目录结构

```
src/
  contents/whatsapp.ts   内容脚本主入口（消息同步、徽章、工具栏装配）
  bg/                    后台：路由、翻译链与降级、缓存、任务队列
  core/                  配置、设置、存储、CRM、话术、定时任务、设备识别、界面多语言（i18n）等
  engines/               各翻译引擎实现（google / lingva / deepl / custom）
  ui/                    界面组件（徽章、工具栏、设置页、资料卡、话术面板）
  adapters/              WhatsApp DOM / wa-js 适配层
scripts/relay.js         MAIN 世界桥接脚本（随构建复制到产物）
```

### 构建期默认值

想给自己的私有构建预置默认值（默认引擎、预填 Key、Lingva 实例地址），改 `src/core/config.ts` 一处即可，无需翻业务代码。可选环境变量见 `.env.example`。

## 隐私

- 扩展**没有服务端**，不收集、不上传任何聊天数据
- 翻译请求直接由浏览器发往你选择的引擎（谷歌 / Lingva / DeepL / 你自填的中转站）
- 联系人资料、话术、定时任务、译文缓存全部存放在浏览器本地
- 内置自检浮层（`Ctrl+Shift+D` / `Cmd+Shift+D`）只在本机渲染调试信息，供提 issue 时截图，不联网

## 界面识别

本扩展注入的界面使用 **CB BDT** 专属视觉（冷钛蓝 `#3a5769` + 金属铜橙 `#a85d2f` + 钢印浮雕），与 WhatsApp 原生绿完全不同，便于一眼区分「哪块是插件、哪块是 WhatsApp 自带」。注入的界面都会带 CB BDT 品牌标记（话术面板头部/折叠圆钮、底部工具栏、设置页头部）。

## 免责声明 / Disclaimer

**中文**

1. **用途说明**：本项目仅供个人技术研究、学习与交流使用，作者不对代码的准确性、完整性或特定用途适用性作任何明示或暗示的保证。
2. **合法合规**：请在遵守当地法律法规的前提下使用本项目。严禁将本项目及其衍生版本用于任何非法用途（包括但不限于网络攻击、数据窃取、非法入侵等）。
3. **责任自负**：使用者因使用本项目所产生的一切直接或间接后果、法律责任及损失，均由使用者自行承担，原作者不承担任何形式的连带责任。
4. **无侵权声明**：本项目中的所有内容均属于个人技术实践分享，不涉及任何商业机密或第三方侵权行为。

此外：本项目为第三方非官方工具，与 WhatsApp、Meta 无任何关联，也未获其授权或认可；请遵守 WhatsApp 服务条款，勿用于群发骚扰、垃圾信息等违规用途；自动化操作存在账号风控风险，使用者需自行承担。

**English**

1. **Purpose**: This project is for personal technical research, learning and exchange only. The author makes no warranty, express or implied, as to its accuracy, completeness or fitness for a particular purpose.
2. **Compliance**: Please use this project in compliance with your local laws and regulations. It is strictly prohibited to use this project or its derivatives for any illegal purpose, including but not limited to network attacks, data theft or unauthorized intrusion.
3. **Liability**: Any direct or indirect consequence, legal liability or loss arising from the use of this project shall be borne solely by the user. The original author assumes no joint liability of any kind.
4. **Non-infringement**: All content in this project is a personal technical practice sharing, and involves no commercial secrets or third-party infringement.

In addition: this is an unofficial third-party tool, not affiliated with, authorized or endorsed by WhatsApp or Meta. Please comply with WhatsApp's Terms of Service and do not use it for spam or bulk harassment. Automation carries account-risk; you bear that risk yourself.

## License

[MIT](./LICENSE)
