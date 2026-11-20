export function bindWordReorder(list, canReorder, moveWord) {
  const wordButton = "[data-word-drag]";
  const wordGroup = "[data-word-id]";
  let drag = null;

  function updateDropTarget() {
    const { x, y, source } = drag;
    const hovered = document.elementFromPoint(x, y);
    // A drop in the gap between groups goes immediately before the next group.
    const group = hovered === list
      ? Array.from(list.children).find((child) => child.getBoundingClientRect().bottom > y)
      : hovered?.closest(wordGroup);
    const target = group?.parentElement === list && group !== source ? group : null;
    if (drag.target !== target) drag.target?.removeAttribute("data-word-drop");
    drag.target = target;
    if (target) {
      const bounds = target.getBoundingClientRect();
      target.dataset.wordDrop = y >= bounds.top + bounds.height / 2 ? "after" : "before";
    }
  }

  function scrollDuringDrag() {
    if (!drag.source.isConnected || !canReorder()) {
      endDrag();
      return;
    }
    const { x, y } = drag;
    const { left, right } = list.getBoundingClientRect();
    if (x >= left && x <= right && y >= 0 && y <= window.innerHeight) {
      const edge = 64;
      const distance = Math.max(0, y - (window.innerHeight - edge)) - Math.max(0, edge - y);
      if (distance) {
        window.scrollBy(0, distance / 4);
        updateDropTarget();
      }
    }
    drag.frame = requestAnimationFrame(scrollDuringDrag);
  }

  function endDrag() {
    const { pointerId, source, target, frame } = drag;
    drag = null;
    cancelAnimationFrame(frame);
    source.removeAttribute("data-word-dragging");
    target?.removeAttribute("data-word-drop");
    if (list.hasPointerCapture(pointerId)) list.releasePointerCapture(pointerId);
  }

  list.addEventListener("pointerdown", (event) => {
    const button = event.target.closest(wordButton);
    if (!button || !canReorder() || drag || event.pointerType !== "mouse" || event.button !== 0 ||
        !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const { clientX: x, clientY: y, pointerId } = event;
    drag = { pointerId, source: button.closest(wordGroup), startX: x, startY: y, x, y, target: null, frame: 0 };
    list.setPointerCapture(pointerId);
  });

  list.addEventListener("pointermove", (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.frame) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
      drag.source.dataset.wordDragging = "";
      drag.frame = requestAnimationFrame(scrollDuringDrag);
    }
    updateDropTarget();
  });

  list.addEventListener("pointerup", (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    if (drag.frame) {
      drag.x = event.clientX;
      drag.y = event.clientY;
      updateDropTarget();
    }
    const { source, target } = drag;
    const placeAfter = target?.dataset.wordDrop === "after";
    endDrag();
    if (!target || !source.isConnected || !canReorder()) return;
    const neighbour = placeAfter ? source.previousElementSibling : source.nextElementSibling;
    if (neighbour !== target) moveWord(source.dataset.wordId, target.dataset.wordId, placeAfter);
  });

  for (const type of ["pointercancel", "lostpointercapture"]) {
    list.addEventListener(type, (event) => {
      if (drag?.pointerId === event.pointerId) endDrag();
    });
  }
  list.addEventListener("contextmenu", (event) => {
    if (drag || (event.ctrlKey && event.target.closest(wordButton) && canReorder())) event.preventDefault();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) endDrag();
  });
}
