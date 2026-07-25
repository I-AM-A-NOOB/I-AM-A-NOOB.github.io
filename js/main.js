import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const cfg = window.StarWarpConfig || {};

/* =========================================================================
 * 1. Three.js 场景搭建
 * ========================================================================= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x04060f, 450, 1200);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.1, 2000
);
camera.position.set(0, 360, 280);
const HOME_CAM = new THREE.Vector3(0, 360, 280);   // 从南方一侧俯视：北上南下、左西右东
const HOME_TARGET = new THREE.Vector3(0, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 35;
controls.maxDistance = 600;
controls.maxPolarAngle = Math.PI * 0.49;   // 不让翻到地下
controls.target.set(0, 0, 0);
// 用户开始拖拽时中断聚焦动画，避免相机lerp与手动操作打架
controls.addEventListener('start', () => { anim.active = false; });

/* ---- 平滑缩放（滚轮 / 双指捏合） ----
 * OrbitControls 的 enableDamping 只对旋转/平移生效，缩放是瞬时的。
 * 这里禁用内置缩放，自己用 lerp 插值目标距离，桌面端和触屏端统一平滑。 */
controls.enableZoom = false;

const zoomState = {
  targetDist: camera.position.distanceTo(controls.target),   // 目标距离
  active: false,
};

// 桌面端：滚轮
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  // deltaY>0 = 缩小（拉远），<0 = 放大（拉近）
  const factor = Math.exp(e.deltaY * 0.0015);
  zoomState.targetDist = THREE.MathUtils.clamp(
    zoomState.targetDist * factor,
    controls.minDistance, controls.maxDistance
  );
  zoomState.active = true;
  anim.active = false;   // 中断聚焦动画
}, { passive: false });

// 移动端：双指捏合（手势在 pointer 事件中处理更可靠）
let pinchPrevDist = null;
const pinchState = { pointers: new Map() };

canvas.addEventListener('pointerdown', (e) => {
  pinchState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchState.pointers.size === 2) {
    const [p1, p2] = [...pinchState.pointers.values()];
    pinchPrevDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pinchState.pointers.has(e.pointerId)) return;
  pinchState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchState.pointers.size === 2 && pinchPrevDist !== null) {
    const [p1, p2] = [...pinchState.pointers.values()];
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const ratio = pinchPrevDist / dist;   // 捏合放大 → dist减小 → ratio>1 → 拉近
    zoomState.targetDist = THREE.MathUtils.clamp(
      zoomState.targetDist * ratio,
      controls.minDistance, controls.maxDistance
    );
    zoomState.active = true;
    anim.active = false;
    pinchPrevDist = dist;
  }
});
const pinchCleanup = (e) => {
  pinchState.pointers.delete(e.pointerId);
  if (pinchState.pointers.size < 2) pinchPrevDist = null;
};
canvas.addEventListener('pointerup', pinchCleanup);
canvas.addEventListener('pointercancel', pinchCleanup);
canvas.addEventListener('pointerleave', pinchCleanup);

/** 在 animate 循环中调用：平滑插值到目标缩放距离 */
function updateSmoothZoom() {
  if (!zoomState.active) return;
  const curDist = camera.position.distanceTo(controls.target);
  const newDist = THREE.MathUtils.lerp(curDist, zoomState.targetDist, 0.15);
  if (Math.abs(newDist - zoomState.targetDist) < 0.05) {
    zoomState.active = false;
  }
  // 沿 "相机→target" 方向缩放
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, newDist);
}

/* ---- 星空背景 ---- */
function makeStars() {
  const g = new THREE.BufferGeometry();
  const N = 1400;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    // 球壳分布
    const r = 600 + Math.random() * 250;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pos[i*3+1] = r * Math.cos(ph);
    pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
    const t = Math.random();
    c.setHSL(0.55 + t*0.1, 0.5, 0.6 + t*0.3);
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 1.6, vertexColors: true, transparent: true, opacity: 0.9,
    depthWrite: false, sizeAttenuation: true,
  });
  return new THREE.Points(g, m);
}
scene.add(makeStars());

/* ---- 地图组（所有省份 + 标签锚点） ---- */
const mapGroup = new THREE.Group();
scene.add(mapGroup);

/* ---- 光照 ---- */
scene.add(new THREE.AmbientLight(0x4a5a8a, 1.1));
const key = new THREE.DirectionalLight(0xcfe0ff, 1.4);
key.position.set(60, 120, 80);
scene.add(key);
// 轮廓光（rim）：放在地图正后方高处，仅给边缘打一抹粉紫
// 位置 Y 抬高、Z 拉远，避免低角度时直射顶面/侧面
const rim = new THREE.DirectionalLight(0xff6fae, 0.28);
rim.position.set(-40, 200, -160);
scene.add(rim);

/* =========================================================================
 * 2. 加载 SVG 并挤出立体块
 * ========================================================================= */
const provinces = [];   // { idx, name, mesh, edges, mat, bbox, worldCenter, svgCenter, labelEl }
let focusedIdx = -1;
let hoveredIdx = -1;

const loaderEl = document.getElementById('loader');
const labelsLayer = document.getElementById('labels');

async function loadMap() {
  const res = await fetch('asset/PRC.svg');
  const text = await res.text();

  // 用官方 SVGLoader 解析整段 SVG（完整支持所有路径命令）
  const svgLoader = new SVGLoader();
  const svgData = svgLoader.parse(text);   // { paths: [ {path, subPaths, color, ... } ] }

  const svgEl = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  const vb = (svgEl.getAttribute('viewBox') || '0 0 423.14 411.13')
    .split(/\s+/).map(Number);
  const [vx, vy, vw, vh] = vb;
  const cx = vx + vw / 2, cy = vy + vh / 2;
  const S = (cfg.MAP_SCALE || 1.0);

  console.log(`%c[StarWarp] 检测到 ${svgData.paths.length} 个 <path>。质心如下：`, 'color:#38e1ff');
  console.log('%c idx │  svgX   svgY  │ name', 'color:#7f8fb3');

  const geomCache = [];

  for (let i = 0; i < svgData.paths.length; i++) {
    const subPaths = svgData.paths[i].subPaths;
    if (!subPaths || !subPaths.length) continue;
    const shapes = SVGLoader.createShapes(svgData.paths[i]);

    const depth = cfg.EXTRUDE_DEPTH || 3.2;
    const bevel = cfg.EXTRUDE_BEVEL ?? 0.18;
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth, bevelEnabled: bevel > 0,
      bevelThickness: bevel, bevelSize: bevel * 0.6,
      bevelSegments: 2, steps: 1,
    });

    // 把几何从 svg 坐标变换到世界坐标
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(-cx, -cy, 0));
    geo.scale(S, -S, 1);                   // SVG→世界: X右=东, Y翻转(南→负Y)

    // 用面积加权质心代替 bbox 中心，避免不规则省份标签偏移
    // shapes 的点坐标是原始 SVG 坐标（未经 translate/scale 变换）
    let totalArea = 0, acx = 0, acy = 0;
    for (const shape of shapes) {
      const pts = shape.getPoints();
      if (pts.length < 3) continue;
      let area2 = 0, sx = 0, sy = 0;   // area2 = 2*area（带符号）
      for (let j = 0; j < pts.length; j++) {
        const p1 = pts[j], p2 = pts[(j + 1) % pts.length];
        const cross = p1.x * p2.y - p2.x * p1.y;
        area2 += cross;
        sx += (p1.x + p2.x) * cross;
        sy += (p1.y + p2.y) * cross;
      }
      const a = area2 / 2;
      if (Math.abs(a) < 1e-6) continue;
      // 面积加权: 质心 × |面积|, 质心 = (sx/(6a), sy/(6a))
      // 故加权贡献 = (sx/6 * sign(a), sy/6 * sign(a))
      const sign = a > 0 ? 1 : -1;
      acx += (sx / 6) * sign;
      acy += (sy / 6) * sign;
      totalArea += Math.abs(a);
    }
    // SVG 坐标空间质心（原始坐标，无需反变换）
    let svgCenterX, svgCenterY;
    if (totalArea > 1e-6) {
      svgCenterX = acx / totalArea;
      svgCenterY = acy / totalArea;
    } else {
      geo.computeBoundingBox();
      const bk = geo.boundingBox;
      // 兜底: 从变换后坐标反变换
      svgCenterX = (bk.min.x + bk.max.x) / 2 / S + cx;
      svgCenterY = -((bk.min.y + bk.max.y) / 2) / S + cy;
    }

    // 让地图平铺在 XZ 水平面上：绕 X 轴转 -90°
    // rotateX(-π/2): (x,y,z) → (x, z, -y)
    // 挤出方向 Z(0~depth) → Y(0~depth) 向上凸起 ✓
    // SVG Y 经翻转后 y'=-(svgY-cy)*S → 旋转后 z = -y' = (svgY-cy)*S
    // 南方 svgY 大 → z 正 → 屏幕近端(下方) ✓  南下北上
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();

    // 世界坐标质心：从 SVG 质心推导
    // x'=(svgX-cx)*S, y'=-(svgY-cy)*S → 旋转后 (x', depth/2, -y') = ((svgX-cx)*S, depth/2, (svgY-cy)*S)
    const worldCenter = new THREE.Vector3(
      (svgCenterX - cx) * S,
      (cfg.EXTRUDE_DEPTH || 3.2) / 2,   // 挤出厚度中点
      (svgCenterY - cy) * S
    );

    // 保留 bbox 用于聚焦距离计算
    geo.computeBoundingBox();
    const bb = geo.boundingBox.clone();

    const name = cfg.PROVINCE_NAMES?.[i] || '';

    const mat = new THREE.MeshStandardMaterial({
      color: cfg.COLORS?.provinceTop ?? 0x2a3f6b,
      metalness: 0.2, roughness: 0.65,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // 侧面颜色：用第二个材质
    mat2Side(mesh, cfg.COLORS?.provinceSide ?? 0x0e1730);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 30),
      new THREE.LineBasicMaterial({
        color: cfg.COLORS?.provinceStroke ?? 0x4a6ba8,
        transparent: true, opacity: 0.7,
      })
    );

    const group = new THREE.Group();
    group.add(mesh);
    group.add(edges);
    mapGroup.add(group);

    // 标签
    const labelEl = document.createElement('div');
    labelEl.className = 'prov-label' + (name ? ' named' : '');
    labelEl.textContent = name || String(i);
    labelsLayer.appendChild(labelEl);

    const prov = {
      idx: i, name, group, mesh, edges, mat,
      bbox: bb, worldCenter: worldCenter.clone(),
      svgCenter: [svgCenterX, svgCenterY],
      labelEl,
    };
    provinces.push(prov);

    // 控制台打印
    console.log(
      `  ${String(i).padStart(3)} │ ${svgCenterX.toFixed(1).padStart(6)} ${svgCenterY.toFixed(1).padStart(6)} │ ${name || '—'}`
    );

    geomCache.push(geo);
  }

  await loadSchools();
  buildIndexByProvince();
  highlightStudentProvinces();
  buildSidebar();
  buildConnLines();
  showOverviewPanel();          // 数据就绪后刷新统计
  loaderEl.classList.add('hidden');
  setTimeout(() => loaderEl.remove(), 700);
  animate();
}

function mat2Side(mesh, color) {
  // ExtrudeGeometry: materialIndex 0 = 侧面/上下表面? 实际 0=extrude cap(z), 1=side
  // 我们统一用一个材质即可，侧面单独着色靠 vertexColors 太麻烦，这里用 onBeforeCompile 微调
  mesh.userData.sideColor = new THREE.Color(color);
  mat2SidePatch(mesh);
}
function mat2SidePatch(mesh) {
  const sideColor = mesh.userData.sideColor;
  mesh.material.onBeforeCompile = (shader) => {
    shader.uniforms.uSide = { value: sideColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying float vH;`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vH = position.y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSide; varying float vH;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( mix(uSide, diffuse, smoothstep(0.0, 0.6, vH)), opacity );`);
  };
  mesh.material.needsUpdate = true;
}

/* =========================================================================
 * 5. 学校数据
 * ========================================================================= */
let schoolsData = [];

async function loadSchools() {
  const r = await fetch('data/schools.json');
  schoolsData = (await r.json()).schools || [];
}

/* 省名 -> 学校分组 */
const schoolsByProvince = {};
function buildIndexByProvince() {
  for (const sc of schoolsData) {
    (schoolsByProvince[sc.province] ||= []).push(sc);
  }
}

/** 高亮有学生数据的省份：加亮描边 + 微调顶面色 */
function highlightStudentProvinces() {
  const hasStudents = new Set(Object.keys(schoolsByProvince));
  for (const p of provinces) {
    if (hasStudents.has(p.name)) {
      p.edges.material.opacity = 1.0;
      p.edges.material.color.setHex(cfg.COLORS?.studentStroke ?? 0x38e1ff);
    }
  }
}

/** 构建左右侧边栏：有学生数据的省份信息卡片 */
const sidebarL = document.getElementById('sidebar-left');
const sidebarR = document.getElementById('sidebar-right');
function buildSidebar() {
  sidebarL.innerHTML = '';
  sidebarR.innerHTML = '';

  // 固定左右分配
  const leftOrder  = ['陕西省','湖北省','四川省','湖南省','广东省','香港特别行政区'];
  const rightOrder = ['北京市','天津市','江苏省','上海市','浙江省'];

  const cardHtml = (e) => {
    let h = `<div class="pc-head">${e.name}：${e.total} 人</div>`;
    for (const sc of e.schools) {
      h += `<div class="pc-school">
        <h4>${sc.name}<span class="pc-n">${sc.students.length} 人</span></h4>
        <div class="pc-students">${
          sc.students.map(s => `<span>${s}</span>`).join('')
        }</div>
      </div>`;
    }
    return `<div class="prov-card" data-province="${e.name}">${h}</div>`;
  };

  for (const name of leftOrder) {
    const schools = schoolsByProvince[name];
    if (schools) {
      sidebarL.insertAdjacentHTML('beforeend', cardHtml({
        name, schools, total: schools.reduce((n,s) => n + s.students.length, 0),
      }));
    }
  }
  for (const name of rightOrder) {
    const schools = schoolsByProvince[name];
    if (schools) {
      sidebarR.insertAdjacentHTML('beforeend', cardHtml({
        name, schools, total: schools.reduce((n,s) => n + s.students.length, 0),
      }));
    }
  }
}

/* =========================================================================
 * 6. 交互：Raycaster / 高亮 / 聚焦
 * ========================================================================= */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function getProvinceMeshes() {
  return provinces.map(p => p.mesh);
}

canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(getProvinceMeshes(), false);
  const idx = hits.length ? provinces.findIndex(p => p.mesh === hits[0].object) : -1;
  if (idx !== hoveredIdx) {
    if (hoveredIdx >= 0 && hoveredIdx !== focusedIdx) restoreProvince(hoveredIdx);
    hoveredIdx = idx;
    if (hoveredIdx >= 0 && hoveredIdx !== focusedIdx) tintProvince(hoveredIdx, cfg.COLORS?.hovered ?? 0x3a5da0);
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
  }
});

// 拖拽阈值：按下→松开移动超过此像素视为拖拽，不触发聚焦
let pointerDownPos = null;
const DRAG_THRESHOLD = 6;

canvas.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

// 用 pointerup 而非 click：OrbitControls 在 pointerdown 时 setPointerCapture，
// click 事件可能被其拖拽逻辑吞掉。pointerup 在 OrbitControls 释放后触发，更可靠。
canvas.addEventListener('pointerup', (e) => {
  if (!pointerDownPos) return;
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  pointerDownPos = null;
  // 拖拽则忽略
  if (dx*dx + dy*dy > DRAG_THRESHOLD * DRAG_THRESHOLD) return;

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(getProvinceMeshes(), false);

  // 已聚焦时：点击当前省 → 保持；点击其他省 → 切换到该省；点击空白 → 返回概览
  if (focusedIdx >= 0) {
    if (hits.length) {
      const idx = provinces.findIndex(p => p.mesh === hits[0].object);
      if (idx === focusedIdx) return;     // 点的是当前省，不切换
      // 点击其他省份 → 切换聚焦目标
      focusProvince(idx);
      return;
    }
    unfocus();   // 点击空白 → 回到全国视图
    return;
  }

  if (hits.length) {
    const idx = provinces.findIndex(p => p.mesh === hits[0].object);
    focusProvince(idx);
  }
});

// 右键点击 → 退出聚焦，返回全国视图
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (focusedIdx >= 0) unfocus();
});

function tintProvince(idx, color) {
  const p = provinces[idx];
  if (!p) return;
  p.mat.color.setHex(color);
  p.mat.emissive = new THREE.Color(color).multiplyScalar(0.2);
  p.edges.material.opacity = 1;
}
function restoreProvince(idx) {
  const p = provinces[idx];
  if (!p) return;
  p.mat.color.setHex(cfg.COLORS?.provinceTop ?? 0x2a3f6b);
  p.mat.emissive = new THREE.Color(0x000000);
  const hasStudents = p.name in schoolsByProvince;
  p.edges.material.opacity = hasStudents ? 1.0 : 0.7;
  p.edges.material.color.setHex(hasStudents ? (cfg.COLORS?.studentStroke ?? 0x38e1ff) : (cfg.COLORS?.provinceStroke ?? 0x4a6ba8));
}

function focusProvince(idx) {
  if (focusedIdx >= 0 && focusedIdx !== idx) restoreProvince(focusedIdx);
  focusedIdx = idx;
  const p = provinces[idx];
  tintProvince(idx, cfg.COLORS?.focused ?? 0xff5fa8);

  const F = cfg.FOCUS || {};

  // 根据省份大小动态计算聚焦距离：bbox 对角线越大，相机离得越远
  const bb = p.bbox;
  const sizeX = bb.max.x - bb.min.x;
  const sizeZ = bb.max.z - bb.min.z;
  const diag = Math.sqrt(sizeX*sizeX + sizeZ*sizeZ);   // 省份在世界平面的对角线
  const baseD = F.distance ?? 70;                       // 基准距离
  const d = Math.max(baseD * 0.5, diag * (F.sizeRatio ?? 1.6) + (F.minOffset ?? 15));

  // 旋转轴 = 该省中心：controls.target 移到该省 worldCenter
  anim.targetLook.copy(p.worldCenter);

  // 相机移到该省正上方略偏前方，保持俯视角度
  // 方向：沿当前"相机→target"方向拉近到距离 d
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  // 若方向近乎竖直（初次加载），用默认斜俯视方向
  if (dir.lengthSq() < 0.01) dir.set(0, 1, 0.6).normalize();
  anim.targetCam.copy(p.worldCenter).addScaledVector(dir, d);
  zoomState.targetDist = d;   // 同步缩放目标，避免动画结束后被平滑缩放拉回
  anim.active = true;

  // 标签
  provinces.forEach(q => q.labelEl.classList.toggle('focused', q.idx === idx));

  // 面板操作按钮
  updatePanelAction();

  // 面板内容
  showPanel(p);
  // 聚焦时隐藏侧边栏
  sidebarL.style.display = 'none';
  sidebarR.style.display = 'none';
}

function unfocus() {
  if (focusedIdx < 0) return;
  restoreProvince(focusedIdx);
  focusedIdx = -1;
  anim.targetCam.copy(HOME_CAM);
  anim.targetLook.copy(HOME_TARGET);
  zoomState.targetDist = HOME_CAM.distanceTo(HOME_TARGET);   // 同步缩放目标
  anim.active = true;
  provinces.forEach(q => q.labelEl.classList.remove('focused'));
  updatePanelAction();
  // 恢复侧边栏
  sidebarL.style.display = '';
  sidebarR.style.display = '';
  showOverviewPanel();
}

/* ---- 聚焦动画状态 ---- */
const anim = {
  active: false,
  targetCam: new THREE.Vector3(),      // 相机目标位置
  targetLook: new THREE.Vector3(),     // controls.target 目标
};

/* =========================================================================
 * 7. 信息面板
 * ========================================================================= */
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelBody  = document.getElementById('panel-body');
const panelActionBtn = document.getElementById('panel-action');

/** 更新面板操作按钮的文本和状态 */
function updatePanelAction() {
  if (focusedIdx >= 0) {
    panelActionBtn.textContent = '回到全国概览';
    panelActionBtn.classList.add('focused');
  } else {
    panelActionBtn.textContent = '重置视角';
    panelActionBtn.classList.remove('focused');
  }
}

panelActionBtn.addEventListener('click', () => {
  if (focusedIdx >= 0) {
    unfocus();
  } else {
    /* 全国概览时：重置相机到初始位置 */
    anim.targetCam.copy(HOME_CAM);
    anim.targetLook.copy(HOME_TARGET);
    zoomState.targetDist = HOME_CAM.distanceTo(HOME_TARGET);
    anim.active = true;
  }
});

function showOverviewPanel() {
  panelTitle.textContent = '全国概览';
  const provs = schoolsData.reduce((m,s)=>m.add(s.province), new Set()).size;
  panelBody.innerHTML = `
    <div class="stat">
      <div><b>${schoolsData.length}</b><span>所高校</span></div>
      <div><b>${provs}</b><span>个省份</span></div>
      <div><b>${schoolsData.reduce((n,s)=>n+s.students.length,0)}</b><span>位同学</span></div>
    </div>
  `;
  panel.classList.remove('open');
}
function showPanel(p) {
  const list = schoolsByProvince[p.name] || [];
  panelTitle.textContent = p.name || `省份 #${p.idx}`;
  panel.classList.add('open');
  let html = `
    <div class="stat">
      <div><b>${list.length}</b><span>所高校</span></div>
      <div><b>${list.reduce((n,s)=>n+s.students.length,0)}</b><span>位同学</span></div>
    </div>`;
  if (!list.length) {
    html += `<p class="muted">该省暂无记录数据</p>`;
  } else {
    for (const sc of list) {
      html += `<div class="school">
        <h3>${sc.name}</h3>
        <div class="city">${sc.city}</div>
        <div class="students">${sc.students.map(s=>`<span class="s">${s}</span>`).join('')}</div>
      </div>`;
    }
  }
  panelBody.innerHTML = html;
}

/* =========================================================================
 * 8. 标签投影 & 主循环
 * ========================================================================= */
const tmpV = new THREE.Vector3();
/** 将 3D 世界坐标投影为屏幕像素坐标，z>1 或屏幕外返回 null */
function projectToScreen(worldPos) {
  tmpV.copy(worldPos).add(mapGroup.position);
  tmpV.y += (cfg.EXTRUDE_DEPTH || 3.2) / 2;
  tmpV.project(camera);
  if (tmpV.z > 1) return null;
  return {
    x: (tmpV.x * 0.5 + 0.5) * window.innerWidth,
    y: (-tmpV.y * 0.5 + 0.5) * window.innerHeight,
  };
}
function updateLabels() {
  if (!showLabels) return;
  for (const p of provinces) {
    const pos = projectToScreen(p.worldCenter);
    if (!pos) { p.labelEl.style.display='none'; continue; }
    p.labelEl.style.display = '';
    p.labelEl.style.transform = `translate(-50%,-50%) translate(${pos.x}px,${pos.y}px)`;
  }
}

/** 绘制侧栏卡片 → 省份中心的连接线 */
const connSvg = document.getElementById('conn-lines');
let connLines = [];   // { el: SVG <line>, cardEl, provName }

function buildConnLines() {
  connSvg.innerHTML = '';
  connLines = [];
  const name2prov = {};
  for (const p of provinces) name2prov[p.name] = p;

  const cards = document.querySelectorAll('.prov-card[data-province]');
  for (const card of cards) {
    const name = card.dataset.province;
    const prov = name2prov[name];
    if (!prov) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    connSvg.appendChild(line);
    connLines.push({ el: line, cardEl: card, prov });
  }
}

function updateConnLines() {
  for (const cl of connLines) {
    // 卡片可见性
    const cardDisplay = cl.cardEl.style.display;
    if (cardDisplay === 'none' || !cl.cardEl.offsetParent) {
      cl.el.setAttribute('x1', '0'); cl.el.setAttribute('y1', '0');
      cl.el.setAttribute('x2', '0'); cl.el.setAttribute('y2', '0');
      continue;
    }
    const pos = projectToScreen(cl.prov.worldCenter);
    if (!pos) continue;
    const cr = cl.cardEl.getBoundingClientRect();
    const cx1 = sidebarL.contains(cl.cardEl) ? cr.right  : cr.left;
    const cy1 = cr.top + cr.height / 2;
    cl.el.setAttribute('x1', cx1);
    cl.el.setAttribute('y1', cy1);
    cl.el.setAttribute('x2', pos.x);
    cl.el.setAttribute('y2', pos.y);
  }
}

let showLabels = false;    // 默认隐藏编号，按 L 切换
window.addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L') {
    showLabels = !showLabels;
    labelsLayer.style.display = showLabels ? '' : 'none';
  }
  if (e.key === 'Escape') unfocus();
});

// 初始隐藏标签层
labelsLayer.style.display = 'none';

function animate() {
  requestAnimationFrame(animate);

  // 平滑缩放
  updateSmoothZoom();

  // 聚焦动画：相机位置 + 视点目标平滑过渡
  if (anim.active) {
    const sp = cfg.FOCUS?.lerpSpeed ?? 0.06;
    camera.position.lerp(anim.targetCam, sp);
    controls.target.lerp(anim.targetLook, sp);
    if (camera.position.distanceTo(anim.targetCam) < 0.3 &&
        controls.target.distanceTo(anim.targetLook) < 0.3) anim.active = false;
  }

  controls.update();
  updateLabels();
  updateConnLines();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

showOverviewPanel();
loadMap().catch(err => {
  loaderEl.textContent = '加载失败：' + err.message;
  console.error(err);
});
