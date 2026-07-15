type ScrollContainer = Pick<HTMLElement, 'scrollHeight' | 'scrollTo'>

export function scrollToLatest(element: ScrollContainer | null) {
  if (!element) return
  void element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
}
