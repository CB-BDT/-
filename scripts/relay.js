/**
 * WPP relay 脚本 — 在 MAIN 世界运行，与隔离世界通过 postMessage 通信。
 * 被 chrome.scripting.registerContentScripts 注入，或通过 <script> 标签注入。
 */
;(function() {
  // relay 代际机制：扩展更新后（重载扩展但页面未刷新时），MAIN 世界可能
  // 还运行着旧版 relay，其防双发标记会阻止新版注入，导致新指令（如
  // QUERY_VOICE）在页面里不存在、调用静默超时。解决办法：每版 relay 带
  // 版本号，新版注入时更新全局代际；旧版监听器入口检查代际，不一致即
  // 自我静默退位（防 SEND_MESSAGE 等指令被两代监听器各执行一次的双发）。
  var RELAY_VERSION = 2
  var prevVersion = window.__wacRelayVersion || 0
  if (window.__wacRelayLoaded && prevVersion === RELAY_VERSION) {
    // 同版本重复注入（background 注册 + content script 兜底双路径）：
    // 直接跳过，保证一条指令只被一个监听器执行
    console.log("[wa-copilot] relay v" + RELAY_VERSION + " 已在运行，跳过重复注入（防双发）")
    return
  }
  window.__wacRelayVersion = RELAY_VERSION
  if (window.__wacRelayLoaded) {
    console.log(
      "[wa-copilot] 检测到旧版 relay v" + prevVersion + "，新版 v" + RELAY_VERSION + " 接管（旧监听器退位）"
    )
  }
  window.__wacRelayLoaded = true

  var SOURCE = "wa-copilot"
  console.log("[wa-copilot] relay v" + RELAY_VERSION + " 已注入 MAIN 世界")

  function wpp() { return window.WPP }

  var ready = false
  var initLogged = false
  var onReadyRegistered = false

  async function initWpp() {
    var W = wpp()
    if (!W) return false

    if (!ready && !initLogged) {
      initLogged = true
      console.log("[wa-copilot] WPP 对象状态:", {
        isReady: W.isReady,
        isInjected: W.isInjected,
        version: W.version,
        loaderType: W.loaderType
      })
    }

    if (W.isReady === true) {
      ready = true
      announceReady()
      return true
    }

    // 手动触发 injectLoader（wa-js 应该自动调了，但保险起见）
    if (typeof W.injectLoader === "function" && !W.isInjected) {
      try { W.injectLoader() } catch(e) {}
    }

    // 注册 onReady 回调
    if (typeof W.onReady === "function" && !onReadyRegistered) {
      onReadyRegistered = true
      W.onReady(function() {
        ready = true
        announceReady()
        console.log("[wa-copilot] WPP onReady 回调触发")
      })
    }

    return W.isReady === true
  }

  function announceReady() {
    window.postMessage({ source: SOURCE, type: "WAJS_READY" }, "*")
  }

  function reply(callId, ok, error, data) {
    window.postMessage({ source: SOURCE, type: "WPP_RESULT", callId: callId, ok: ok, error: error, data: data }, "*")
  }

  // 轮询初始化
  var tries = 0
  var timer = setInterval(function() {
    tries++
    initWpp().then(function(ok) {
      if (ok) { clearInterval(timer); return }
      if (tries > 30) {
        clearInterval(timer)
        var W = wpp()
        console.warn("[wa-copilot] WPP 60s 未就绪。", W ? "isReady=" + W.isReady + " isInjected=" + W.isInjected + " loaderType=" + W.loaderType : "window.WPP 不存在")
      }
    })
  }, 2000)

  // 指令监听
  window.addEventListener("message", function(event) {
    // 代际退位：页面里存在更新的 relay 版本时，本旧实例不再处理任何指令，
    // 否则一条指令会被两代监听器各执行一次（消息双发事故）
    if (window.__wacRelayVersion !== RELAY_VERSION) return
    var d = event.data
    if (!d || d.source !== SOURCE) return

    if (d.type === "SEND_LOCATION") {
      var W = wpp()
      if (!W || !W.isReady) {
        reply(d.callId, false, "WPP 未就绪")
        return
      }
      // 用 WPP 自己的当前活跃聊天作为目标 Wid（正规 @c.us 格式）。
      // DOM 提取的 chatId 可能是 @lid 隐私格式，直接传会报 "invalid wid"。
      var target = null
      try {
        var active = W.chat.getActiveChat()
        if (active && active.id && active.id._serialized) target = active.id._serialized
        else if (active && typeof active === "string") target = active
      } catch (e) {}
      if (!target) target = d.chatId

      // 原生 Location 消息 payload（与手机端原生发送字段一致）：
      // - loc：卡片标题；address：独立副标题字段。
      //   纯地图发送时两者留空且不设字段（设了空字符串手机端会渲染空行）
      // - clientUrl：接收端点开跳转的地图链接
      // - jpegThumbnail：2:1（300x150）静态地图，无前缀 base64 JPEG，
      //   中心即经纬度并带红 Pin；手机端按此图渲染卡片，比例不对会拉伸。
      var locPayload = {
        type: "location",
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lng),
        clientUrl: "https://maps.google.com/maps?q=" + d.lat + "," + d.lng
      }
      if (d.name) locPayload.loc = d.name
      if (d.address) locPayload.address = d.address
      if (d.thumbnail) locPayload.jpegThumbnail = d.thumbnail

      W.chat.sendRawMessage(target, locPayload)
        .then(function(res) {
          reply(d.callId, true, undefined, res)
        })
        .catch(function(err) {
          reply(d.callId, false, err.message || String(err))
        })
      return
    }

    if (d.type === "GET_PHONE") {
      var W = wpp()
      if (!W || !W.isReady) {
        reply(d.callId, false, "WPP 未就绪")
        return
      }
      // 多级取号：contact.phoneNumber → contact.user → chat.id.user，
      // 统一清洗为纯数字再校验（formattedPhone 可能含空格/横线）。
      // 返回 { phone, name }，phone 为 +E.164，name 为 WhatsApp 显示名。
      var pickPhone = function(chat) {
        if (!chat) return { phone: null, name: null }
        var digits = ""
        var name = null
        try {
          var ct = chat.contact
          var raw = (ct && (ct.phoneNumber || ct.user)) || (chat.id && chat.id.user) ||
                    (ct && ct.formattedPhone) || ""
          digits = String(raw).replace(/\D/g, "")
          name = (ct && (ct.notifyName || ct.name || ct.formattedName)) || null
        } catch (e2) {}
        return {
          phone: digits.length >= 5 && digits.length <= 20 ? "+" + digits : null,
          name: name
        }
      }
      // DOM 提取的 chatId 可能是 @lid 隐私格式，直接传 getChatById 会报
      // "invalid wid"。优先用当前活跃聊天的完整 chat 对象。
      try {
        var activeObj = null
        try {
          activeObj = W.chat.getActiveChat()
        } catch (e) {}
        if (activeObj && activeObj.id && activeObj.id._serialized) {
          reply(d.callId, true, undefined, pickPhone(activeObj))
          return
        }
        // 本版本 wa-js 没有 getChatById：从本地会话列表按 JID / 号码匹配
        var wantId = (activeObj && typeof activeObj === "string" && activeObj) || d.chatId
        var wantDigits = String(wantId).replace(/\D/g, "")
        W.chat.list().then(function(chats) {
          var chat = null
          if (Array.isArray(chats)) {
            for (var gi = 0; gi < chats.length; gi++) {
              var gc = chats[gi]
              if (!gc || !gc.id) continue
              if (gc.id._serialized === wantId || String(gc.id.user || "") === wantDigits) {
                chat = gc
                break
              }
            }
          }
          reply(d.callId, true, undefined, pickPhone(chat))
        }).catch(function(err) {
          reply(d.callId, false, err.message || String(err))
        })
      } catch (err) {
        reply(d.callId, false, err.message || String(err))
      }
      return
    }

    if (d.type === "GET_DEVICE") {
      var W = wpp()
      if (!W || !W.isReady) {
        reply(d.callId, false, "WPP 未就绪")
        return
      }
      // 同 SEND_LOCATION：@lid chatId 直接传会报 "invalid wid"，
      // 优先用当前活跃聊天的正规 Wid。
      var devTarget = null
      try {
        var devActive = W.chat.getActiveChat()
        if (devActive && devActive.id && devActive.id._serialized) devTarget = devActive.id._serialized
        else if (devActive && typeof devActive === "string") devTarget = devActive
      } catch (e) {}
      try {
        W.chat.getMessages(devTarget || d.chatId, { count: 15 }).then(function(msgs) {
          // 不在 relay 侧判定设备：把原始消息 ID 原样回传，
          // 判定规则统一由 content script 的 deviceDetector 维护。
          var out = []
          if (msgs && msgs.length > 0) {
            for (var i = 0; i < msgs.length; i++) {
              var msg = msgs[i]
              if (!msg || !msg.id) continue
              var rawId = typeof msg.id === "string" ? msg.id : (msg.id.id || "")
              var serialized = typeof msg.id === "object" && msg.id._serialized ? msg.id._serialized : ""
              out.push({ id: rawId, serialized: serialized, fromMe: !!msg.id.fromMe })
            }
          }
          reply(d.callId, true, undefined, out)
        }).catch(function(err) {
          reply(d.callId, false, err.message || String(err))
        })
      } catch(err) {
        reply(d.callId, false, err.message || String(err))
      }
      return
    }

    if (d.type === "LIST_DEVICES") {
      var W2 = wpp()
      if (!W2 || !W2.isReady) {
        reply(d.callId, false, "WPP 未就绪")
        return
      }
      // 批量预取：遍历本地 Store 的会话列表，取每个会话最后一条「对方发的」
      // 消息 ID。纯内存读取，无任何网络请求；用于好友列表的设备标签。
      // lastMessage 是自己发的聊天会深挖最近 8 条（分批限流）。
      // 注意：WPP.chat.list() 返回 Promise<ChatModel[]>，必须 .then，
      // 直接同步调用拿到的是 Promise，.length 为 undefined，结果永远为空。
      var collectFromChats = function(chats) {
        var out = []
        var needDig = []
        if (Array.isArray(chats)) {
          for (var ci = 0; ci < chats.length && out.length + needDig.length < 300; ci++) {
            var c = chats[ci]
            if (!c || !c.id || !c.id._serialized) continue
            var cjid = c.id._serialized
            if (cjid.indexOf("@g.us") !== -1) continue // 群聊无设备概念
            var lm = c.lastMessage
            var lmid = lm && lm.id ? (typeof lm.id === "string" ? lm.id : lm.id.id || "") : ""
            var lmser = lm && lm.id && typeof lm.id === "object" && lm.id._serialized
              ? lm.id._serialized : ""
            var lmFromMe = !!(lm && lm.id && lm.id.fromMe)
            if (!lmid && !lmser) continue
            // 名字（WhatsApp 名 + 用户保存的备注名），供 content 侧建 名字→JID 索引
            var notifyName = ""
            var savedName = ""
            try {
              notifyName = (c.contact && (c.contact.notifyName || c.contact.name)) || ""
              savedName = (c.contact && c.contact.name) || c.name || ""
            } catch (e2) {}
            if (lmFromMe) {
              // 自己发的消息判不出对方设备，标记深挖
              needDig.push({ jid: cjid, id: lmid, serialized: lmser, notifyName: notifyName, savedName: savedName })
            } else {
              out.push({ jid: cjid, id: lmid, serialized: lmser, fromMe: false, notifyName: notifyName, savedName: savedName })
            }
          }
        }
        // 深挖上限 120 个聊天，超出部分等打开聊天时再补
        needDig = needDig.slice(0, 120)
        var digBatch = function() {
          var batch = needDig.splice(0, 12)
          if (!batch.length) {
            // MAIN 世界采样日志：确认真实消息 ID 格式（设备启发式判定依据）
            try {
              console.log(
                "[wa-copilot] LIST_DEVICES 完成 会话=" + out.length + " 待深挖残留=" + needDig.length,
                out.slice(0, 3).map(function(x) {
                  return x.jid + " || ser=" + (x.serialized || "(空)") + " || bare=" + (x.id || "(空)")
                })
              )
            } catch (e3) {}
            reply(d.callId, true, undefined, out)
            return
          }
          var jobs = batch.map(function(item) {
            return W2.chat.getMessages(item.jid, { count: 8 })
              .then(function(msgs) {
                // 从尾往前找第一条对方发的消息
                for (var mi = msgs.length - 1; mi >= 0; mi--) {
                  var m = msgs[mi]
                  if (!m || !m.id || m.fromMe || m.id.fromMe) continue
                  var mid = typeof m.id === "string" ? m.id : m.id.id || ""
                  var mser = m.id._serialized || mid
                  if (mid || mser) {
                    out.push({ jid: item.jid, id: mid, serialized: mser, fromMe: false, notifyName: item.notifyName, savedName: item.savedName })
                  }
                  break
                }
              })
              .catch(function() { /* 单个聊天失败跳过 */ })
          })
          Promise.all(jobs).then(digBatch)
        }
        digBatch()
      }
      try {
        var listPromise = W2.chat.list()
        // 双保险：个别 wa-js 版本可能同步返回数组
        if (listPromise && typeof listPromise.then === "function") {
          listPromise.then(collectFromChats).catch(function(err) {
            reply(d.callId, false, err.message || String(err))
          })
        } else {
          collectFromChats(listPromise)
        }
      } catch (err) {
        reply(d.callId, false, err.message || String(err))
      }
      return
    }

    if (d.type === "SEND_MESSAGE") {
      var Wm = wpp()
      if (!Wm || !Wm.isReady) {
        reply(d.callId, false, "WPP 未就绪")
        return
      }
      // 目标解析（避免 invalid wid）：
      // 1. 若目标恰是当前活跃聊天 → 用活跃对象的正规 Wid（@lid 最稳）
      // 2. chatId 不含 @（如纯显示名）→ 从本地会话列表按 显示名/号码 匹配出 JID
      // 3. 其余（xxx@c.us / xxx@lid）直接交给 sendTextMessage / sendFileMessage
      // 注意：当前版本 wa-js 没有 WPP.chat.getChatById，不要调用。
      var msgTarget = d.chatId

      function doSend(target) {
        var sendOp
        // 发送审计日志：此行出现两次 = 插件真的调了两次发送（上层问题）；
        // 只出现一次但聊天里两条 = WhatsApp 端显示/同步问题，与插件无关
        console.log("[wa-copilot] relay 发送消息 →", target, d.dataUrl ? "（媒体）" : "（文本）", "callId=" + d.callId)
        try {
          if (d.dataUrl) {
            // 图片 / 视频：sendFileMessage 是 wa-js 官方媒体发送 API
            sendOp = Wm.chat.sendFileMessage(target, d.dataUrl, {
              type: d.mediaType || "auto-detect",
              caption: d.text || undefined,
              filename: d.filename || undefined,
              mimetype: d.mimetype || undefined
            })
          } else {
            sendOp = Wm.chat.sendTextMessage(target, String(d.text || ""))
          }
        } catch (err) {
          reply(d.callId, false, err.message || String(err))
          return
        }
        sendOp
          .then(function(res) {
            reply(d.callId, true, undefined, res)
          })
          .catch(function(err) {
            reply(d.callId, false, err.message || String(err))
          })
      }

      try {
        var mActive = Wm.chat.getActiveChat()
        if (mActive && mActive.id && mActive.id._serialized && mActive.id._serialized === d.chatId) {
          doSend(mActive.id._serialized)
          return
        }
      } catch (e5) {}

      if (String(msgTarget).indexOf("@") === -1) {
        // 纯名字 / 纯号码：从本地会话列表匹配（列表首屏即加载，纯内存）
        Wm.chat.list().then(function(chats) {
          var matched = null
          var wanted = String(d.chatId).trim().toLowerCase()
          var digits = wanted.replace(/\D/g, "")
          if (Array.isArray(chats)) {
            for (var i = 0; i < chats.length; i++) {
              var c = chats[i]
              if (!c || !c.id || !c.id._serialized) continue
              var cname = String(
                (c.contact && (c.contact.notifyName || c.contact.name)) || c.name || ""
              ).trim().toLowerCase()
              var cuser = String(c.id.user || "")
              if (cname === wanted || (digits.length >= 5 && cuser === digits)) {
                matched = c
                break
              }
            }
          }
          if (matched) {
            doSend(matched.id._serialized)
          } else {
            reply(d.callId, false, "找不到该联系人的会话：" + d.chatId)
          }
        }).catch(function(err) {
          reply(d.callId, false, err.message || String(err))
        })
        return
      }

      doSend(msgTarget)
      return
    }

    if (d.type === "GET_CHAT_HISTORY") {
      var W3 = wpp()
      if (!W3 || !W3.isReady) {
        reply(d.callId, false, "WPP 未就绪")
        return
      }
      // 拉取当前活跃聊天最近 N 条消息（纯本地 Store 读取，无网络请求）。
      // 只回传 JSON 可克隆的扁平字段，避免 DataCloneError。
      try {
        var ac = null
        try { ac = W3.chat.getActiveChat() } catch (e4) {}
        var jid = ac && ac.id && ac.id._serialized ? ac.id._serialized : (d.chatId || null)
        if (!jid) {
          reply(d.callId, false, "当前没有打开的聊天")
          return
        }
        // count <= 0 语义为「尽可能多」（wa-js 支持 -1 = 全部）。
        // 但超长会话全量拉取可能卡住页面渲染，故用 2000 条硬上限兜底：
        // 对正常客户会话（几十到几百条）等于全量，对极端会话也不会卡死。
        var rawCount = parseInt(d.count, 10)
        var count = (!rawCount || rawCount < 0)
          ? 2000
          : Math.min(Math.max(rawCount, 10), 2000)
        W3.chat.getMessages(jid, { count: count }).then(function(msgs) {
          var out = []
          for (var i = 0; i < msgs.length; i++) {
            var m = msgs[i]
            if (!m) continue
            // 文本取 body；图片/视频等带 caption 的消息保留其说明文字
            var body = m.body || m.caption || ""
            body = String(body).trim()
            if (!body) continue
            // 跳过系统类消息（加密提示/业务通知等），它们不是对话内容
            if (m.type && /^(system|gp2|notification|e2e_notification|call_log)/i.test(String(m.type))) continue
            out.push({
              fromMe: !!(m.fromMe || (m.id && m.id.fromMe)),
              body: body,
              t: typeof m.t === "number" ? m.t : 0,
              type: typeof m.type === "string" ? m.type : "chat"
            })
          }
          reply(d.callId, true, undefined, out)
        }).catch(function(err) {
          reply(d.callId, false, err.message || String(err))
        })
      } catch (err) {
        reply(d.callId, false, err.message || String(err))
      }
      return
    }
  })
})()
