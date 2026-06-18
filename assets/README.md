# Art assets

Drop PNGs at the exact paths below and they replace the procedural placeholders
automatically — no code change. Any file you DON'T provide just keeps its
built-in vector placeholder, so the game always runs.

| Logical sprite | File path (relative to project root) | Suggested size | Notes |
|----------------|--------------------------------------|----------------|-------|
| Player         | `assets/characters/player.png`       | ~96×96 | Draw FACING RIGHT (+X). Code rotates it to aim. |
| Zombie         | `assets/characters/zombie.png`       | ~80×80 | Top-down; facing doesn't matter (no rotation). |
| Tree (wood)    | `assets/environment/tree.png`        | ~96×96 | Resource node. |
| Metal deposit  | `assets/environment/metal.png`       | ~96×96 | Resource node. |
| Tech cache     | `assets/environment/tech.png`        | ~96×96 | Resource node. |
| Light tower    | `assets/towers/tower_light.png`      | ~96×96 | Draw turret/barrel FACING RIGHT; it rotates to target. |
| Heavy tower    | `assets/towers/tower_heavy.png`      | ~96×96 | Facing right. |
| Wall           | `assets/towers/wall.png`             | ~96×96 | Static block, no rotation. |
| Projectile     | `assets/effects/projectile.png`      | ~32×16 | Drawn long axis = travel direction. If you provide one, the team color tint is dropped. |

Notes
- Source size is flexible — the renderer scales every sprite to a fixed in-game
  size with `setDisplaySize`, so a 512×512 PNG and a 64×64 PNG both render correctly.
- Use transparent backgrounds (PNG with alpha).
- Spritesheet/animation support (walk cycles etc.) is the next art step; right now
  each entry is a single still image. The loader lives in `src/scenes/BootScene.ts`
  and the path map in `src/render/assets.ts`.
