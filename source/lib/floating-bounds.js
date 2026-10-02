// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
function expandedBounds(anchor, size, area) {
  const width = Math.min(size.width, area.width), height = Math.min(size.height, area.height);
  return {
    x: Math.max(area.x, Math.min(anchor.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(anchor.y, area.y + area.height - height)),
    width, height,
  };
}
module.exports = { expandedBounds };
