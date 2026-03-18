import { Container, Graphics } from "pixi.js";
import type { Viewport } from "pixi-viewport";

const FRAME_COLOR = 0x1a1a2e;
const FRAME_SIZE = 10000;
const BORDER_COLOR = 0x666666;

let spriteFrame: Container | null = null;

export function updateSpriteFrame(
  viewport: Viewport,
  w: number,
  h: number,
): void {
  if (spriteFrame) {
    viewport.removeChild(spriteFrame);
    spriteFrame.destroy({ children: true });
  }

  spriteFrame = new Container();

  const bg = new Graphics();

  // Top
  bg.rect(-FRAME_SIZE, -FRAME_SIZE, w + FRAME_SIZE * 2, FRAME_SIZE);
  bg.fill(FRAME_COLOR);
  // Bottom
  bg.rect(-FRAME_SIZE, h, w + FRAME_SIZE * 2, FRAME_SIZE);
  bg.fill(FRAME_COLOR);
  // Left
  bg.rect(-FRAME_SIZE, 0, FRAME_SIZE, h);
  bg.fill(FRAME_COLOR);
  // Right
  bg.rect(w, 0, FRAME_SIZE, h);
  bg.fill(FRAME_COLOR);

  spriteFrame.addChild(bg);

  // 1px border around sprite area
  const border = new Graphics();
  border.rect(-1, -1, w + 2, h + 2);
  border.stroke({ color: BORDER_COLOR, width: 1, alignment: 0 });
  spriteFrame.addChild(border);

  // Insert at bottom of viewport (behind sprite)
  viewport.addChildAt(spriteFrame, 0);
}
