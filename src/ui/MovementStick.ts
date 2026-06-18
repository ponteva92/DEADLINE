import nipplejs from 'nipplejs';

const DEADZONE = 0.18;
const CURVE = 1.35;

/**
 * Left-thumb virtual joystick (DOM overlay via nipplejs).
 * Returns an analog move vector in SCREEN space (all 360 degrees incl. diagonals),
 * with a deadzone and response curve so movement feels intentional, not jittery.
 * nipplejs reports vector.y positive-up; screen space is positive-down, so moveY negates it.
 */
export class MovementStick {
  private manager: ReturnType<typeof nipplejs.create>;
  private raw = { x: 0, y: 0 };
  private zone: HTMLDivElement;

  constructor() {
    this.zone = document.createElement('div');
    Object.assign(this.zone.style, {
      position: 'fixed',
      left: '0',
      bottom: '0',
      width: '45%',
      height: '62%',
      zIndex: '10',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.zone);

    this.manager = nipplejs.create({
      zone: this.zone,
      mode: 'dynamic',
      color: '#53e07a',
      size: 130,
      fadeTime: 90,
      restJoystick: true,
    });

    this.manager.on('move', (_evt, data: { vector?: { x: number; y: number } }) => {
      if (data.vector) {
        this.raw.x = data.vector.x;
        this.raw.y = data.vector.y;
      }
    });
    this.manager.on('end', () => {
      this.raw.x = 0;
      this.raw.y = 0;
    });
  }

  private shaped(): { x: number; y: number } {
    const x = this.raw.x;
    const y = -this.raw.y;
    const mag = Math.hypot(x, y);
    if (mag < DEADZONE) return { x: 0, y: 0 };
    const norm = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE));
    const scaled = Math.pow(norm, CURVE) / mag;
    return { x: x * scaled, y: y * scaled };
  }

  get moveX(): number {
    return this.shaped().x;
  }
  get moveY(): number {
    return this.shaped().y;
  }

  destroy(): void {
    this.manager.destroy();
    this.zone.remove();
  }
}
