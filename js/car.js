// Физика машины: двухколейная «велосипедная» модель на плоскости.
// Силы шин считаются по углу увода с насыщением (упрощённая формула Пацейки),
// есть перенос веса при разгоне/торможении и круг трения на ведущей оси.
// Оси: x — восток, z — юг; yaw = 0 — носом на +z; «влево» = (cos yaw, −sin yaw).

const G = 9.81;

export const CAR_SETUP = {
  mass: 1420,        // кг
  inertia: 2350,     // момент инерции вокруг вертикали
  a: 1.22,           // от центра масс до передней оси, м
  b: 1.42,           // до задней оси
  cgH: 0.5,          // высота центра масс
  grip: 1.18,        // сцепление шин
  tyreB: 13, tyreC: 1.45, // жёсткость и форма кривой шины
  power: 235000,     // Вт
  driveForce: 11500, // предел тяги на низкой скорости, Н
  brakeG: 1.15,      // замедление на тормозах, g
  dragK: 0.42,       // аэродинамика
  steerLock: 0.6,    // максимальный угол колёс на месте, рад
};

const tyre = (alpha, load, S) => -S.grip * load * Math.sin(S.tyreC * Math.atan(S.tyreB * alpha));

export class Car {
  constructor(setup = CAR_SETUP) {
    this.s = setup;
    this.x = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.r = 0;
    this.steer = 0;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = this.vz = this.r = 0;
    this.steer = 0;
    this.u = 0; this.vl = 0;        // скорость вдоль и поперёк кузова
    this.ax = 0; this.ay = 0;       // ускорения в осях кузова (для наклонов и переноса веса)
    this.slip = 0;                  // 0..1 — насколько шины сорваны
    this.rpm = 900; this.gear = 1;
    this.reverse = false;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  step(dt, inp) {
    const S = this.s, L = S.a + S.b;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); // вперёд
    const lx = fz, lz = -fx;                                 // влево
    const u = this.vx * fx + this.vz * fz;
    const vl = this.vx * lx + this.vz * lz;
    const au = Math.abs(u);

    // руль: чем быстрее едем, тем меньше угол, иначе на 150 км/ч машину срывает от одного касания
    const lock = S.steerLock / (1 + 0.75 * (au / 9) * (au / 9));
    const target = inp.steer * lock;
    const rate = lock * (Math.abs(target) < Math.abs(this.steer) ? 9 : 6.5);
    const ds = target - this.steer;
    this.steer += Math.abs(ds) < rate * dt ? ds : Math.sign(ds) * rate * dt;
    const cd = Math.cos(this.steer), sd = Math.sin(this.steer);

    // задний ход включается, когда стоим и держим тормоз
    if (au < 0.6 && inp.brake > 0.1 && inp.throttle < 0.1) this.reverse = true;
    if (inp.throttle > 0.1 && u > -0.6) this.reverse = false;
    const rev = this.reverse && u < 0.6;
    // на задней передаче педали меняются ролями: «тормоз» едет назад, «газ» тормозит
    const throttle = rev ? 0 : inp.throttle;
    const brake = rev ? inp.throttle : inp.brake;

    // нагрузка на оси с переносом веса
    const shift = S.mass * this.ax * S.cgH / L;
    const Fzf = Math.max(600, S.mass * G * S.b / L - shift);
    const Fzr = Math.max(600, S.mass * G * S.a / L + shift);

    // продольные силы
    const dir = u > 0.3 ? 1 : u < -0.3 ? -1 : u / 0.3;
    // полный привод 35/65: резвый старт, но задняя ось всё ещё нагружена сильнее и срывается первой
    const drive = rev ? (u > -9 ? -inp.brake * 5200 : 0) : throttle * Math.min(S.driveForce, S.power / Math.max(au, 4));
    const Fb = brake * S.brakeG * S.mass * G;
    let Fxf = drive * 0.35 - dir * Fb * 0.62;
    let Fxr = drive * 0.65 - dir * Fb * 0.38;
    if (throttle < 0.05) Fxr -= dir * 700; // торможение двигателем
    // круг трения: чем больше шина тратит на разгон/торможение, тем меньше остаётся на поворот.
    // Пределы 0.8 — это «АБС и антипробуксовка»: шины не срываются от одного нажатия педали.
    const capR = S.grip * Fzr, capF = S.grip * Fzf;
    Fxr = Math.max(-capR * 0.8, Math.min(capR * 0.8, Fxr));
    Fxf = Math.max(-capF * 0.85, Math.min(capF * 0.85, Fxf));
    let rearGrip = 1;
    if (inp.handbrake) { Fxr = -dir * capR * 0.6; rearGrip = 0.6; }
    const kr = Math.sqrt(Math.max(0.05, 1 - (Fxr / capR) ** 2)) * rearGrip;
    const kf = Math.sqrt(Math.max(0.05, 1 - (Fxf / capF) ** 2));

    // углы увода: скорость колеса в его собственных осях
    const vfy = vl + S.a * this.r, vry = vl - S.b * this.r;
    const wfx = u * cd + vfy * sd, wfy = -u * sd + vfy * cd;
    const alphaF = Math.atan2(wfy, Math.max(Math.abs(wfx), 2.2));
    const alphaR = Math.atan2(vry, Math.max(au, 2.2));
    const Fyf = tyre(alphaF, Fzf, S) * kf; // поперёк переднего колеса
    const Fyr = tyre(alphaR, Fzr, S) * kr;

    // суммарные силы в осях кузова
    const drag = S.dragK * u * au + dir * 190;
    const Fx = Fxr + Fxf * cd - Fyf * sd - drag;
    const Fy = Fyr + Fyf * cd + Fxf * sd;
    const Mz = S.a * (Fyf * cd + Fxf * sd) - S.b * Fyr;

    const axw = (Fx * fx + Fy * lx) / S.mass, azw = (Fx * fz + Fy * lz) / S.mass;
    this.vx += axw * dt; this.vz += azw * dt;
    this.r += (Mz / S.inertia) * dt;
    // на парковочных скоростях гасим остаточное вращение и снос, чтобы машина не «плавала» стоя
    if (au < 1.5) {
      const k = Math.exp(-dt * (1.5 - au) * 6);
      this.r *= k;
      const nvl = (this.vx * lx + this.vz * lz) * (1 - k);
      this.vx -= lx * nvl; this.vz -= lz * nvl;
      if (au < 0.25 && throttle < 0.05 && !(rev && inp.brake > 0.05)) { this.vx *= k; this.vz *= k; }
    }
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.yaw += this.r * dt;

    const sm = Math.min(1, dt * 12);
    this.ax += (Fx / S.mass - this.ax) * sm;
    this.ay += (Fy / S.mass - this.ay) * sm;
    this.u = u; this.vl = vl;
    const sl = Math.max(Math.abs(alphaR), Math.abs(alphaF) * 0.8);
    const slipNow = au > 4 ? Math.min(1, Math.max(0, (sl - 0.09) / 0.22)) : 0;
    this.slip += (slipNow - this.slip) * Math.min(1, dt * 10);
    this.updateEngine(dt, throttle);
  }

  updateEngine(dt, throttle) {
    const TOP = [0, 15, 27, 40, 54, 69, 86]; // потолок каждой передачи, м/с
    const v = Math.abs(this.u);
    if (this.gear < 6 && v > TOP[this.gear] * 0.96) this.gear++;
    else if (this.gear > 1 && v < TOP[this.gear - 1] * 0.62) this.gear--;
    const lo = this.gear === 1 ? 0 : TOP[this.gear - 1] * 0.55;
    const k = Math.max(0, Math.min(1, (v - lo) / (TOP[this.gear] - lo)));
    const want = 1100 + k * 5900 + throttle * 350;
    this.rpm += (want - this.rpm) * Math.min(1, dt * 9);
  }
}
