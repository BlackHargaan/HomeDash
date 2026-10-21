// HTML5 drag-and-drop helpers used to move items between whole days
// (month cells, the time grid's all-day row). Timed moves in the time grid use
// pointer events instead — see TimeGrid.jsx.
export function dragProps(item, dragItem) {
  return {
    draggable: true,
    onDragStart: (e) => { dragItem.current = item; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', item.title || '') } catch { /* some browsers */ } },
    onDragEnd: () => { dragItem.current = null },
  }
}
export function dropProps(day, dragItem, onDrop) {
  return {
    onDragOver: (e) => { if (dragItem.current) { e.preventDefault(); e.currentTarget.classList.add('drop-over') } },
    onDragLeave: (e) => e.currentTarget.classList.remove('drop-over'),
    onDrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('drop-over'); if (dragItem.current) { onDrop(dragItem.current, day) } },
  }
}

