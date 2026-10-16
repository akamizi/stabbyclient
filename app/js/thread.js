const byTime = (a, b) => (a.created_at || "").localeCompare(b.created_at || "") || String(a.id).localeCompare(String(b.id));

// Flattens a /context response into display order. Replies are placed by
// in_reply_to_id; anything whose parent chain never reaches the root (missing
// parent, cycle, self-parent) is shown at depth 1 exactly once.
export function buildThread(root, context) {
  const ancestors = context?.ancestors ?? [];
  const descendants = [...(context?.descendants ?? [])].sort(byTime);
  const children = new Map();
  for (const d of descendants) {
    const list = children.get(d.in_reply_to_id) ?? [];
    list.push(d);
    children.set(d.in_reply_to_id, list);
  }
  const ids = new Set(descendants.map((d) => d.id));
  const visited = new Set();
  const nodes = [];

  function walk(parentId, depth) {
    for (const child of children.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      nodes.push({ status: child, depth });
      walk(child.id, depth + 1);
    }
  }

  walk(root.id, 1);
  // Orphans: parent is neither the root nor a known descendant.
  for (const d of descendants) {
    if (visited.has(d.id)) continue;
    if (d.in_reply_to_id !== root.id && !ids.has(d.in_reply_to_id)) {
      visited.add(d.id);
      nodes.push({ status: d, depth: 1 });
      walk(d.id, 2);
    }
  }
  // Cycles and self-parents: whatever is still unseen.
  for (const d of descendants) {
    if (visited.has(d.id)) continue;
    visited.add(d.id);
    nodes.push({ status: d, depth: 1 });
    walk(d.id, 2);
  }
  return { ancestors, nodes };
}

export function limitVisible(nodes, n) {
  return { visible: nodes.slice(0, n), hiddenCount: Math.max(0, nodes.length - n) };
}
