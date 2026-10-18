// Lets a row be dragged sideways away: past `threshold` pixels, on letting go, it is gone
// (onSwipe is called); short of it, or if the movement is more up and down than sideways, it
// snaps back and the page scrolls as usual. wasDragged() tells a tap from the end of a drag, so
// the click that some browsers send after a drag can be ignored.
export function makeSwipeable(el, { onSwipe, threshold = 80 }) {
  let x0 = 0;
  let y0 = 0;
  let id = null;
  let dragging = false;
  let dragged = false;

  const rest = () => {
    el.style.transition = "";
    el.style.transform = "";
    el.style.opacity = "";
  };
  el.onpointerdown = (e) => {
    if (e.button > 0) return;
    x0 = e.clientX;
    y0 = e.clientY;
    id = e.pointerId;
    dragging = false;
    dragged = false;
  };
  el.onpointermove = (e) => {
    if (id === null || e.pointerId !== id) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      dragging = true;
      el.setPointerCapture?.(id);
      el.style.transition = "none";
    }
    if (dragging) {
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / (threshold * 3)));
    }
  };
  const finish = (e, cancelled) => {
    if (id === null || e.pointerId !== id) return;
    const dx = e.clientX - x0;
    id = null;
    dragged = dragging;
    if (dragging && !cancelled && Math.abs(dx) >= threshold) {
      el.style.transition = "";
      el.style.transform = `translateX(${dx > 0 ? 100 : -100}%)`;
      el.style.opacity = "0";
      dragging = false;
      onSwipe();
      return;
    }
    dragging = false;
    rest();
  };
  el.onpointerup = (e) => finish(e, false);
  el.onpointercancel = (e) => finish(e, true);
  return { wasDragged: () => dragged };
}
