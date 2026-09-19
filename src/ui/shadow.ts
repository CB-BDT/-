export function createShadowMount(host: HTMLElement, css: string): HTMLElement {
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = css
  shadow.appendChild(style)
  const mount = document.createElement("div")
  shadow.appendChild(mount)
  return mount
}
