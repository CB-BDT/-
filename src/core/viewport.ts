export interface ViewportWatcher {
  observe(el: Element): void
  unobserve(el: Element): void
  disconnect(): void
}

/**
 * 视口懒加载。root 保持 null：IntersectionObserver 计算交叉时会
 * 逐级考虑 overflow 裁剪祖先，因此 WhatsApp 内层滚动容器滚出的
 * 消息同样会被判定为不可见，不会误触发。
 */
export function createViewportWatcher(options: {
  rootMargin?: string
  onEnter: (el: HTMLElement) => void
}): ViewportWatcher {
  const { rootMargin = "300px 0px", onEnter } = options

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        io.unobserve(entry.target)
        onEnter(entry.target as HTMLElement)
      }
    },
    { root: null, rootMargin, threshold: 0 }
  )

  return {
    observe: (el) => io.observe(el),
    unobserve: (el) => io.unobserve(el),
    disconnect: () => io.disconnect()
  }
}
