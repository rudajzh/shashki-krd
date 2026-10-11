// Машины потока: три бюджетных седана (в духе Solaris, Rio и Polo), седан бизнес-класса,
// маршрутка-«пазик» и длинный городской автобус. Формы — те же кривые и сечения, что у машины игрока.
import * as THREE from 'three';
import { curve, COL, SEDAN, COUPE, slab, commonDetails, buildMerged } from './cardetail.js?v=22';

// ---------- бюджетные седаны ----------
// front: 'hex' — большая шестигранная решётка снизу, 'tiger' — узкая решётка между фарами, 'bars' — горизонтальные планки
function budgetDetails(S, P, paint, ends) {
  const nose = ends.nose, tail = ends.tail, hl = S.len / 2;
  const fy = Math.min(S.sy(hl), S.top(hl) - 0.035), capW = S.sw(hl) * 0.9;
  P.pair((s) => {
    P.add('light', slab(0.26, 0.085, 0.03, 0.025), 0xeef3ff, s * (capW - 0.2), fy - 0.105, nose - 0.002); // фара
    P.add('light', slab(0.07, 0.04, 0.015, 0.02), 0xfff2c0, s * (capW - 0.16), 0.33, nose);               // противотуманка
    P.box('light', COL.tail, 0.26, 0.1, 0.02, s * (S.sw(-hl) * 0.9 - 0.19), Math.min(S.sy(-hl), S.top(-hl) - 0.035) - 0.1, tail - 0.006); // фонарь
    P.box('light', 0x9c100a, 0.14, 0.025, 0.02, s * 0.5, 0.36, tail - 0.004);                             // отражатель
  });
  if (S.front === 'hex') {
    const g = new THREE.Shape();
    g.moveTo(-0.33, 0.1); g.lineTo(0.33, 0.1); g.lineTo(0.4, 0); g.lineTo(0.3, -0.11); g.lineTo(-0.3, -0.11); g.lineTo(-0.4, 0); g.closePath();
    P.add('dark', new THREE.ExtrudeGeometry(g, { depth: 0.025, bevelEnabled: false }), 0x050506, 0, 0.42, nose - 0.002);
    for (const y of [0.37, 0.42, 0.47]) P.box('dark', 0x202226, 0.6, 0.012, 0.03, 0, y, nose + 0.012);
  } else if (S.front === 'tiger') {
    P.add('dark', slab(0.52, 0.075, 0.03, 0.025), 0x050506, 0, fy - 0.105, nose - 0.002);
    P.box('dark', COL.chrome, 0.5, 0.01, 0.03, 0, fy - 0.07, nose + 0.012);
    P.add('dark', slab(0.7, 0.13, 0.03, 0.025), 0x050506, 0, 0.36, nose - 0.002);
  } else {
    P.add('dark', slab(0.5, 0.085, 0.015, 0.025), 0x050506, 0, fy - 0.105, nose - 0.002);
    for (const y of [-0.13, -0.105, -0.08]) P.box('dark', COL.chrome, 0.48, 0.008, 0.03, 0, fy + y, nose + 0.012);
    P.add('dark', slab(0.62, 0.1, 0.02, 0.025), 0x050506, 0, 0.35, nose - 0.002);
  }
  P.box('dark', COL.trim, S.sw(hl) * 1.7, 0.05, 0.05, 0, 0.21, nose - 0.01);  // нижняя кромка бампера
  P.box('dark', COL.trim, S.sw(-hl) * 1.7, 0.06, 0.05, 0, 0.27, tail + 0.01);
  commonDetails(S, P, paint, ends);
}

const budget = (o) => ({
  wheel: 0.31, tyreW: 0.2, track: 0.75, axF: 1.37, axR: -1.23, belt: 0.86, plateY: 0.62, crease: 55, headWrap: 0.28, tailWrap: 0.3,
  by: curve([[-2.2, 0.3], [-1.9, 0.2], [1.9, 0.19], [2.2, 0.22]]),
  cabin: [-1.62, 1.02], roof: [-0.95, 0.35], pillarB: [-0.2, -0.1], kink: -1.2, doors: [0.85, -0.15, -1.08],
  details: budgetDetails, ...o,
});

// плавный силуэт с покатой крышей и высоким багажником
const SOLARIS = budget({
  len: 4.4, wid: 1.73, front: 'hex',
  top: curve([[-2.2, 0.9], [-2.12, 1.04], [-1.85, 1.075], [-1.62, 1.1], [-1.25, 1.3], [-0.95, 1.42], [-0.3, 1.468], [0.1, 1.455], [0.35, 1.42], [0.65, 1.25], [1.02, 1.02], [1.5, 0.95], [1.9, 0.86], [2.12, 0.76], [2.2, 0.68]]),
  sw: curve([[-2.2, 0.74], [-2.05, 0.83], [-1.5, 0.865], [1.3, 0.865], [1.95, 0.83], [2.2, 0.7]]),
  sy: curve([[-2.2, 0.84], [-1.9, 0.99], [-0.5, 0.95], [0.9, 0.89], [1.6, 0.82], [2.2, 0.64]]),
  tw: curve([[-2.2, 0.56], [-1.62, 0.62], [-0.95, 0.52], [0.35, 0.52], [1.02, 0.66], [1.8, 0.6], [2.2, 0.48]]),
});
// чуть ниже и острее, узкая решётка между фарами
const RIO = budget({
  len: 4.42, wid: 1.74, front: 'tiger', headWrap: 0.24,
  top: curve([[-2.21, 0.9], [-2.12, 1.03], [-1.85, 1.06], [-1.65, 1.085], [-1.25, 1.29], [-0.95, 1.41], [-0.3, 1.458], [0.1, 1.448], [0.38, 1.41], [0.68, 1.24], [1.05, 1.01], [1.5, 0.94], [1.9, 0.85], [2.13, 0.75], [2.21, 0.67]]),
  sw: curve([[-2.21, 0.75], [-2.05, 0.835], [-1.5, 0.87], [1.3, 0.87], [1.95, 0.835], [2.21, 0.72]]),
  sy: curve([[-2.21, 0.83], [-1.9, 0.98], [-0.5, 0.945], [0.9, 0.885], [1.6, 0.815], [2.21, 0.64]]),
  tw: curve([[-2.21, 0.57], [-1.65, 0.63], [-0.95, 0.52], [0.38, 0.52], [1.05, 0.67], [1.8, 0.61], [2.21, 0.5]]),
  cabin: [-1.65, 1.05], roof: [-0.95, 0.38],
});
// более «рубленый»: плоская крыша, почти горизонтальный капот, длинная корма
const POLO = budget({
  len: 4.48, wid: 1.71, front: 'bars', headWrap: 0.18, tailWrap: 0.24, crease: 46,
  top: curve([[-2.24, 0.92], [-2.16, 1.05], [-1.9, 1.07], [-1.7, 1.09], [-1.35, 1.28], [-1.0, 1.43], [-0.3, 1.47], [0.2, 1.462], [0.42, 1.43], [0.7, 1.27], [1.06, 1.03], [1.5, 0.975], [1.95, 0.9], [2.16, 0.8], [2.24, 0.7]]),
  sw: curve([[-2.24, 0.76], [-2.1, 0.83], [-1.5, 0.855], [1.4, 0.855], [2.0, 0.83], [2.24, 0.73]]),
  sy: curve([[-2.24, 0.86], [-1.9, 0.98], [-0.5, 0.955], [0.9, 0.9], [1.6, 0.84], [2.24, 0.66]]),
  tw: curve([[-2.24, 0.58], [-1.7, 0.63], [-1.0, 0.54], [0.42, 0.54], [1.06, 0.67], [1.8, 0.62], [2.24, 0.52]]),
  cabin: [-1.7, 1.06], roof: [-1.0, 0.42], axF: 1.4, axR: -1.25,
});

// ---------- ещё три машины игрока ----------
// Народный седан нулевых: округлый, невысокий, с узкими фарами
export const PRIORA = budget({
  len: 4.35, wid: 1.68, front: 'bars', headWrap: 0.3, tailWrap: 0.26, crease: 58,
  top: curve([[-2.175, 0.92], [-2.1, 1.04], [-1.85, 1.065], [-1.6, 1.09], [-1.2, 1.3], [-0.9, 1.4], [-0.3, 1.42], [0.15, 1.405], [0.4, 1.36], [0.72, 1.18], [1.05, 1.0], [1.5, 0.93], [1.9, 0.84], [2.1, 0.74], [2.175, 0.66]]),
  sw: curve([[-2.175, 0.72], [-2.0, 0.81], [-1.5, 0.84], [1.3, 0.84], [1.9, 0.81], [2.175, 0.68]]),
  sy: curve([[-2.175, 0.83], [-1.9, 0.97], [-0.5, 0.93], [0.9, 0.87], [1.6, 0.8], [2.175, 0.62]]),
  tw: curve([[-2.175, 0.54], [-1.6, 0.6], [-0.9, 0.5], [0.4, 0.5], [1.05, 0.64], [1.8, 0.58], [2.175, 0.46]]),
  cabin: [-1.6, 1.05], roof: [-0.9, 0.4], eye: [0.35, 1.13, -0.14], hoodCam: [1.22, 0.92], cabinStyle: 'budget',
});

// «Классика»: угловатый седан семидесятых — плоский капот, прямые стойки, хромированные бамперы и решётка
function classicDetails(S, P, paint, ends) {
  const nose = ends.nose, tail = ends.tail, hl = S.len / 2, fy = S.sy(hl);
  P.add('dark', slab(0.66, 0.2, 0.02, 0.03), COL.chrome, 0, fy - 0.16, nose - 0.01);          // рамка решётки
  P.add('dark', slab(0.6, 0.15, 0.015, 0.035), 0x050506, 0, fy - 0.16, nose - 0.008);
  for (let i = -5; i <= 5; i++) P.box('dark', COL.chrome, 0.012, 0.14, 0.02, i * 0.052, fy - 0.16, nose + 0.03);
  P.pair((s) => {
    P.add('dark', slab(0.3, 0.2, 0.02, 0.03), COL.chrome, s * 0.58, fy - 0.16, nose - 0.01);  // прямоугольная фара в хроме
    P.add('light', slab(0.25, 0.15, 0.015, 0.035), 0xf2f6ff, s * 0.58, fy - 0.16, nose - 0.006);
    P.box('light', 0xffa21a, 0.07, 0.08, 0.03, s * (S.sw(hl) - 0.03), fy - 0.16, nose - 0.03);  // поворотник на углу
    P.box('dark', 0x16181b, 0.07, 0.13, 0.12, s * (S.sw(hl) + 0.005), 0.5, hl - 0.03);          // пластиковый клык бампера
    P.box('dark', 0x16181b, 0.07, 0.13, 0.12, s * (S.sw(-hl) + 0.005), 0.5, -hl + 0.03);
    P.box('dark', COL.chrome, 0.012, 0.022, S.len - 0.5, s * (S.sw(0) + 0.004), 0.62, 0);       // молдинг по борту
    // задний фонарь из трёх секций
    const ty = S.sy(-hl) - 0.14, tx = s * 0.58;
    P.box('dark', COL.chrome, 0.34, 0.2, 0.02, tx, ty, tail + 0.002);
    P.box('light', COL.tail, 0.13, 0.16, 0.03, tx + s * 0.09, ty, tail - 0.008);
    P.box('light', 0xffa21a, 0.08, 0.16, 0.03, tx - s * 0.03, ty, tail - 0.008);
    P.box('light', 0xe9e9e4, 0.07, 0.16, 0.03, tx - s * 0.115, ty, tail - 0.008);
  });
  P.box('dark', COL.chrome, S.wid + 0.04, 0.1, 0.1, 0, 0.5, nose);                              // бамперы
  P.box('dark', COL.chrome, S.wid + 0.04, 0.1, 0.1, 0, 0.5, tail);
  commonDetails(S, P, paint, ends);
}
export const CLASSIC = budget({
  len: 4.14, wid: 1.62, wheel: 0.29, tyreW: 0.18, track: 0.69, axF: 1.3, axR: -1.12, crease: 34, bulge: 0.025, headWrap: 0, tailWrap: 0, belt: 0.88, plateY: 0.64,
  top: curve([[-2.07, 0.93], [-2.04, 0.985], [-1.3, 1.0], [-1.18, 1.02], [-0.92, 1.36], [-0.75, 1.425], [0.25, 1.435], [0.42, 1.4], [0.82, 1.03], [0.95, 1.0], [2.0, 0.96], [2.07, 0.93]]),
  sw: curve([[-2.07, 0.77], [-2.0, 0.8], [1.95, 0.8], [2.07, 0.77]]),
  sy: curve([[-2.07, 0.88], [-2.0, 0.95], [-0.5, 0.95], [0.9, 0.94], [2.0, 0.92], [2.07, 0.88]]),
  tw: curve([[-2.07, 0.66], [-1.2, 0.68], [-0.9, 0.6], [0.4, 0.6], [0.85, 0.7], [2.07, 0.66]]),
  by: curve([[-2.07, 0.33], [-1.85, 0.26], [1.85, 0.25], [2.07, 0.3]]),
  cabin: [-1.2, 0.85], roof: [-0.85, 0.35], pillarB: [-0.22, -0.12], kink: -1.05, doors: [0.72, -0.17, -1.02],
  details: classicDetails, eye: [0.33, 1.14, -0.14], hoodCam: [1.24, 0.84], cabinStyle: 'classic',
});

// Рамный внедорожник-«кубик»: вертикальные борта и стёкла, круглые фары, запаска на задней двери
function suvDetails(S, P, paint, ends) {
  const nose = ends.nose, tail = ends.tail, hl = S.len / 2;
  P.add('dark', slab(1.0, 0.3, 0.03, 0.03), 0x050506, 0, 0.99, nose - 0.01);                   // решётка
  for (const y of [0.9, 0.99, 1.08]) P.box('dark', COL.chrome, 0.96, 0.03, 0.03, 0, y, nose + 0.02);
  P.add('dark', new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16), COL.chrome, 0, 0.99, nose + 0.03, 0, 0, Math.PI / 2);
  P.box('dark', 0x101114, S.wid + 0.06, 0.24, 0.2, 0, 0.62, nose - 0.02);                       // бампер
  P.box('dark', 0x101114, S.wid + 0.06, 0.22, 0.16, 0, 0.6, tail + 0.02);
  P.pair((s) => {
    P.add('dark', new THREE.CylinderGeometry(0.135, 0.135, 0.04, 20), COL.chrome, s * 0.7, 0.99, nose + 0.01, 0, 0, Math.PI / 2); // круглая фара
    P.add('light', new THREE.CircleGeometry(0.115, 20), 0xf4f8ff, s * 0.7, 0.99, nose + 0.034);
    P.box('light', 0xfff2c0, 0.16, 0.05, 0.03, s * 0.66, 0.66, nose + 0.085);                   // ходовой огонь в бампере
    P.box('light', 0xffa21a, 0.13, 0.05, 0.07, s * 0.8, S.top(hl - 0.5) + 0.02, hl - 0.5);      // поворотник на крыле
    P.box('dark', 0x101114, 0.03, 0.09, S.len - 1.0, s * (S.sw(0) + 0.012), 0.92, -0.05);       // молдинг по борту
    P.box('dark', 0x16181b, 0.2, 0.05, 1.9, s * (S.sw(0) + 0.07), 0.42, 0.05);                  // подножка
    P.box('light', COL.tail, 0.14, 0.11, 0.03, s * 0.84, 0.82, tail - 0.004);                   // задний фонарь
    P.box('light', 0xffa21a, 0.14, 0.05, 0.03, s * 0.84, 0.91, tail - 0.004);
    for (const z of S.doors) { const y0 = S.by(z) + 0.14, y1 = S.sy(z) - 0.03; P.box('dark', 0x050506, 0.008, y1 - y0, 0.014, s * (S.sw(z) + 0.001), (y0 + y1) / 2, z); }
    for (const z of [S.doors[1] + 0.22, S.doors[2] + 0.22]) P.box('dark', COL.chrome, 0.024, 0.03, 0.2, s * (S.sw(z) + 0.004), S.sy(z) - 0.12, z);
    const mz = 0.62, my = S.sy(mz) + 0.14, mx = s * (S.sw(mz) + 0.13);
    P.box('paint', paint, 0.2, 0.15, 0.09, mx, my, mz, s * 0.15);                                // зеркало
    P.box('dark', COL.trim, 0.12, 0.03, 0.05, s * (S.sw(mz) + 0.03), my - 0.06, mz);
  });
  // запаска в чехле на задней двери
  P.add('dark', new THREE.CylinderGeometry(0.39, 0.39, 0.22, 24), 0x121316, 0, 1.08, tail - 0.1, 0, 0, Math.PI / 2);
  P.add('dark', new THREE.TorusGeometry(0.39, 0.02, 6, 24), COL.chrome, 0, 1.08, tail - 0.215);
  P.box('light', COL.plate, 0.52, 0.11, 0.012, -0.55, 0.78, tail - 0.004);
}
export const GELIK = {
  len: 4.72, wid: 1.94, wheel: 0.41, tyreW: 0.3, track: 0.83, axF: 1.5, axR: -1.38, belt: 1.25, crease: 30, bulge: 0.03, headWrap: 0, tailWrap: 0, tailY: 0.86, tailX: 0.84, crown: 0.035,
  cab: [0.2, 0.05, 0.95, 0.93], roofInset: 0.06,
  top: curve([[-2.36, 1.9], [-2.2, 1.95], [0.35, 1.95], [0.5, 1.88], [0.75, 1.3], [0.85, 1.25], [2.2, 1.22], [2.36, 1.16]]),
  sw: curve([[-2.36, 0.93], [2.2, 0.93], [2.36, 0.9]]),
  sy: curve([[-2.36, 1.25], [0.6, 1.25], [0.85, 1.19], [2.36, 1.11]]),
  tw: curve([[-2.36, 0.84], [0.4, 0.84], [0.8, 0.8], [2.36, 0.78]]),
  by: curve([[-2.36, 0.44], [-2.1, 0.37], [2.1, 0.37], [2.36, 0.44]]),
  cabin: [-2.32, 0.78], roof: [-2.25, 0.4], pillarB: [-0.3, -0.2], kink: -1.55, doors: [0.7, -0.25, -1.25],
  details: suvDetails, eye: [0.4, 1.62, -0.1], hoodCam: [1.72, 1.0], cabinStyle: 'lux',
};

// ---------- автобусы ----------
// Борт автобуса: юбка, кузов, цветная полоса под окнами, окна со стойками, двери с правой стороны.
function skinBus(S, z, j, paint, side) {
  if (j <= 1) return ['dark', COL.under];
  if (j === 2) return ['dark', COL.trim];
  const hl = S.len / 2, door = side < 0 && S.busDoors.some(([a, b]) => z > a && z < b);
  if (door && j >= 3 && j <= 8) return j === 8 ? ['glass', 0x10161d] : ['dark', 0x1c1f24];
  if (j === 5) return ['paint', S.stripe];
  if (j === 8) {
    if (Math.abs(z) > hl - 0.3) return ['paint', paint];                                    // угловые стойки
    const k = ((z + hl) % S.pillarStep + S.pillarStep) % S.pillarStep;
    return k < 0.13 ? ['paint', paint] : ['glass', COL.glass];
  }
  return ['paint', paint];
}

function busDetails(S, P, paint, ends) {
  const nose = ends.nose, tail = ends.tail, w = S.sw(S.len / 2) * 0.9, top = S.top(S.len / 2), sill = S.sy(0);
  // перёд: большое лобовое, табло маршрута над ним, фары, решётка, бампер
  P.add('glass', slab(w * 1.86, top * 0.9 - sill - 0.1, 0.12, 0.03), COL.glass, 0, (sill + 0.05 + top * 0.9) / 2, nose - 0.012);
  P.box('light', 0xff9a1a, w * 1.1, 0.2, 0.03, 0, top * 0.9 + 0.05, nose - 0.02);               // светящееся табло
  P.box('dark', 0x050506, w * 1.5, 0.24, 0.03, 0, top * 0.9 + 0.05, nose - 0.03);
  P.pair((s) => {
    if (S.round) { // круглые фары, как у «пазика»
      P.add('light', new THREE.CircleGeometry(0.11, 12), 0xfff3d0, s * (w - 0.3), sill - 0.42, nose + 0.012);
      P.add('light', new THREE.CircleGeometry(0.06, 10), 0xffb030, s * (w - 0.1), sill - 0.42, nose + 0.012);
    } else {
      P.add('light', slab(0.34, 0.1, 0.03, 0.02), 0xeef3ff, s * (w - 0.32), sill - 0.5, nose);
    }
    P.box('light', COL.tail, 0.12, 0.36, 0.02, s * (w - 0.14), sill - 0.3, tail - 0.006);         // вертикальные фонари
    // зеркала на длинных кронштейнах
    P.box('dark', COL.trim, 0.28, 0.04, 0.04, s * (S.sw(S.len / 2 - 0.4) + 0.12), top * 0.72, S.len / 2 - 0.35);
    P.box('dark', COL.trim, 0.05, 0.32, 0.16, s * (S.sw(S.len / 2 - 0.4) + 0.27), top * 0.66, S.len / 2 - 0.35);
  });
  P.add('dark', slab(w * 0.9, 0.2, 0.03, 0.02), 0x0a0b0d, 0, sill - 0.45, nose);                  // решётка
  P.box('dark', COL.trim, w * 2.05, 0.2, 0.08, 0, S.by(0) + 0.12, nose - 0.02);                    // бамперы
  P.box('dark', COL.trim, w * 2.05, 0.2, 0.08, 0, S.by(0) + 0.12, tail + 0.02);
  // корма: окно, номер, решётка мотора
  P.add('glass', slab(w * 1.6, (top * 0.9 - sill) * 0.55, 0.1, 0.03), COL.glass, 0, sill + (top * 0.9 - sill) * 0.62, tail - 0.012, Math.PI);
  P.box('light', COL.plate, 0.52, 0.11, 0.012, 0, sill - 0.5, tail - 0.004);
  if (!S.round) P.add('dark', slab(w * 1.3, 0.3, 0.03, 0.02), 0x0a0b0d, 0, sill - 0.15, tail - 0.002, Math.PI);
  // на крыше: люки у «пазика», блоки кондиционеров у большого автобуса
  if (S.round) { for (const z of [-1.4, 1.2]) P.box('dark', 0x8a8d92, 0.7, 0.05, 0.7, 0, top + 0.02, z); }
  else { for (const z of [-3.2, 1.6]) P.box('dark', 0x2a2d32, 1.7, 0.24, 2.4, 0, top + 0.1, z); }
}

// ПАЗ-образная маршрутка: короткая, высокая, со скруглённой крышей и круглыми фарами
const PAZ = {
  len: 7.0, wid: 2.44, wheel: 0.42, tyreW: 0.26, track: 0.99, axF: 2.3, axR: -1.3, belt: 1.05, bulge: 0.07, crease: 58, round: true,
  top: curve([[-3.5, 2.7], [-3.25, 2.9], [0, 2.94], [3.1, 2.9], [3.5, 2.62]]),
  sw: curve([[-3.5, 1.1], [-3.25, 1.2], [3.2, 1.2], [3.5, 1.08]]),
  sy: curve([[-3.5, 1.42], [3.5, 1.42]]), tw: curve([[-3.5, 0.82], [3.5, 0.82]]), roofInset: 0.2,
  by: curve([[-3.5, 0.6], [-3.1, 0.45], [3.2, 0.45], [3.5, 0.55]]),
  cabin: [-9, 9], roof: [-9, 9], cab: [0.03, 0.06, 0.1, 0.8], pillarStep: 1.16, busDoors: [[1.15, 1.95]], stripe: 0xf0b400,
  skin: skinBus, details: busDetails,
};

// 12-метровый низкопольный городской автобус: плоский перёд, три двери, полоса под окнами
const CITYBUS = {
  len: 12.0, wid: 2.55, wheel: 0.48, tyreW: 0.3, track: 1.03, axF: 3.25, axR: -2.55, belt: 1.0, bulge: 0.05, crease: 55,
  top: curve([[-6, 2.9], [-5.8, 3.0], [5.8, 3.0], [6, 2.88]]),
  sw: curve([[-6, 1.2], [-5.8, 1.265], [5.8, 1.265], [6, 1.2]]),
  sy: curve([[-6, 1.22], [6, 1.22]]), tw: curve([[-6, 1.0], [6, 1.0]]), roofInset: 0.14,
  by: curve([[-6, 0.5], [-5.5, 0.34], [5.6, 0.34], [6, 0.42]]),
  cabin: [-9, 9], roof: [-9, 9], cab: [0.02, 0.05, 0.08, 0.86], pillarStep: 1.5, busDoors: [[4.0, 5.2], [0.2, 1.6], [-4.1, -2.9]], stripe: 0x1c9a78,
  skin: skinBus, details: busDetails,
};

const BODY = [0xf2f2f0, 0xf2f2f0, 0xf2f2f0, 0xc4c8cc, 0xc4c8cc, 0x1b1c1f, 0x1b1c1f, 0x6b7077, 0x6b7077, 0x23395d, 0x7d1a1a, 0xd8cdb4];
const TAXI = 0xf5c400;

// kind: что это, weight: как часто встречается, behave: 'bus' — держится правого ряда и не уступает, 'pushy' — часто перестраивается
export const VEHICLES = {
  solaris: { spec: SOLARIS, weight: 26, colors: [...BODY, TAXI, TAXI] },
  rio: { spec: RIO, weight: 24, colors: [...BODY, TAXI] },
  polo: { spec: POLO, weight: 20, colors: [...BODY, TAXI] },
  lux: { spec: { ...SEDAN, blackRoof: false }, weight: 9, colors: [0x1b1c1f, 0x1b1c1f, 0xf2f2f0, 0x6b7077, 0x23395d] },
  coupe: { spec: COUPE, weight: 0, colors: [0xd92b2b, 0xf0b400, 0xf2f2f0, 0x1f5fd0] }, // в обычном потоке не ездит — только гонщики
  lada: { spec: PRIORA, weight: 14, colors: [...BODY] },
  seven: { spec: CLASSIC, weight: 8, colors: [0xf2f2f0, 0xd8cdb4, 0x7d1a1a, 0x23395d, 0x2f5d3a, 0xf2f2f0] },
  gelik: { spec: GELIK, weight: 3, colors: [0x1b1c1f, 0x1b1c1f, 0xf2f2f0, 0x6b7077] },
  paz: { spec: PAZ, weight: 12, colors: [0xf2f2f0, 0xf2f2f0, 0xf5c400, 0xf07f1a], behave: 'pushy', slow: 0.92 },
  bus: { spec: CITYBUS, weight: 9, colors: [0xf4f4f1], behave: 'bus', slow: 0.82 },
};

let material = null;
const cache = new Map();
export function vehicleMesh(kind, color, envMap) {
  material ||= new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.36, envMap, envMapIntensity: 1.0 });
  const key = kind + color;
  if (!cache.has(key)) cache.set(key, buildMerged(VEHICLES[kind].spec, color));
  const m = new THREE.Mesh(cache.get(key), material);
  m.frustumCulled = false;
  return m;
}

// случайный вид транспорта с учётом того, как часто он встречается
export function pickKind(rnd) {
  const kinds = Object.keys(VEHICLES), total = kinds.reduce((s, k) => s + VEHICLES[k].weight, 0);
  let r = rnd() * total;
  for (const k of kinds) { r -= VEHICLES[k].weight; if (r <= 0) return k; }
  return kinds[0];
}
