"use strict";

import {
  BoxGeometry,
  CylinderGeometry,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  RingGeometry,
  MeshBasicMaterial,
  Object3D,
  Object3DEventMap,
  MeshStandardMaterial,
  BufferGeometry,
  Vector3,
  Matrix4,
  Quaternion,
} from 'three';

import {
  Body,
  Box,
  Vec3,
  World,
  Material,
  ContactMaterial,
  Cylinder,
  ConvexPolyhedron,
} from 'cannon-es';

import { ARButton } from 'three/addons/webxr/ARButton.js';

let container: HTMLDivElement;

// ─── Caméra / scène / renderer ───────────────────────────────────────────────
let camera: PerspectiveCamera;
let scene: Scene;
let renderer: WebGLRenderer;

let reticle: Object3D<Object3DEventMap>;

let controller1: any, controller2: any;

let hitTestSource: XRHitTestSource | null = null;
let hitTestSourceRequested = false;

// ─── Manual delta timing ─────────────────────────────────────────────────────
let lastTime: number | null = null;

let GAME_STATE = 'init';

// ─── Platform state ───────────────────────────────────────────────────────────
let platformPosition = new Vector3();
let platformTopY = 0;

// ─── Physics world ───────────────────────────────────────────────────────────
const physicsWorld = new World({ gravity: new Vec3(0, -9.8, 0) });

// ─── Physics materials ────────────────────────────────────────────────────────
const planeSurfaceMaterial = new Material('plane');
const pieceMaterial = new Material('piece');

physicsWorld.addContactMaterial(new ContactMaterial(planeSurfaceMaterial, pieceMaterial, {
  friction: 0.6,
  restitution: 0.1,
}));
physicsWorld.addContactMaterial(new ContactMaterial(pieceMaterial, pieceMaterial, {
  friction: 0.6,
  restitution: 0.05,
}));

// ─── Detected plane → Cannon body map ────────────────────────────────────────
// Key: XRPlane object reference, Value: the static Cannon Body
const detectedPlanesBodies = new Map<XRPlane, Body>();

/**
 * Build a flat Cannon-ES ConvexPolyhedron from an XRPlane's polygon vertices.
 * The polygon is a list of {x,y,z} points lying in the plane's local XZ plane (y≈0).
 * We extrude a small thickness downward to give the body some depth.
 */
function buildPlaneShape(polygon: DOMPointReadOnly[]): ConvexPolyhedron {
  const THICKNESS = 0.05; // half-thickness in metres

  // Top face vertices (y = +THICKNESS) and bottom face (y = -THICKNESS)
  const vertices: Vec3[] = [];
  const n = polygon.length;

  for (const p of polygon) vertices.push(new Vec3(p.x, THICKNESS, p.z));
  for (const p of polygon) vertices.push(new Vec3(p.x, -THICKNESS, p.z));

  // Build faces: top (CCW looking down), bottom (CW looking down), and sides
  const faces: number[][] = [];

  // Top face
  faces.push(Array.from({ length: n }, (_, i) => i));
  // Bottom face (reversed winding)
  faces.push(Array.from({ length: n }, (_, i) => n + (n - 1 - i)));
  // Side quads
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    faces.push([i, next, n + next, n + i]);
  }

  return new ConvexPolyhedron({ vertices, faces });
}

/**
 * Called every frame with the current set of detected planes.
 * Adds new bodies, updates moved planes, removes planes no longer tracked.
 */
function syncDetectedPlanes(
  detectedPlanes: XRPlaneSet,
  frame: XRFrame,
  referenceSpace: XRReferenceSpace
) {
  // ── Remove bodies for planes no longer tracked ──
  for (const [plane, body] of detectedPlanesBodies) {
    if (!detectedPlanes.has(plane)) {
      physicsWorld.removeBody(body);
      detectedPlanesBodies.delete(plane);
    }
  }

  // ── Add or update bodies for currently tracked planes ──
  for (const plane of detectedPlanes) {
    const pose = frame.getPose(plane.planeSpace, referenceSpace);
    if (!pose) continue;

    const m = pose.transform.matrix; // Float32Array, column-major

    // Extract position and quaternion from the XR pose matrix
    const px = m[12], py = m[13], pz = m[14];
    const qx = m[0] * 0 + m[1] * 0; // we'll use Matrix4 decompose below

    // Use Three.js Matrix4 to decompose cleanly
    const mat4 = new Matrix4().fromArray(m);
    const pos = new Vector3();
    const quat = new Quaternion();
    const scale = new Vector3();
    mat4.decompose(pos, quat, scale);

    if (!detectedPlanesBodies.has(plane)) {
      // ── New plane: create a body ──
      const shape = buildPlaneShape(plane.polygon);
      const body = new Body({
        type: Body.STATIC,
        material: planeSurfaceMaterial,
      });
      body.addShape(shape);
      body.position.set(pos.x, pos.y, pos.z);
      body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
      physicsWorld.addBody(body);
      detectedPlanesBodies.set(plane, body);

    } else {
      // ── Existing plane: update position/orientation as tracking refines it ──
      const body = detectedPlanesBodies.get(plane)!;
      body.position.set(pos.x, pos.y, pos.z);
      body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    }
  }
}

// ─── Active pieces ────────────────────────────────────────────────────────────
interface Piece { pieceMesh: Mesh; physBody: Body; }
const activePieces: Piece[] = [];

// ─── Piece configs ────────────────────────────────────────────────────────────
type PieceShape = 'cube' | 'cylinder' | 'cone' | 'bigRect' | 'thinRect';
interface PieceConfig { shape: PieceShape; size: number; mass: number; }

const PIECES: Record<string, PieceConfig> = {
  cube: { shape: 'cube', size: 0.07, mass: 1.0 },
  cylinder: { shape: 'cylinder', size: 0.07, mass: 1.0 },
  cone: { shape: 'cone', size: 0.07, mass: 1.0 },
  bigRect: { shape: 'bigRect', size: 0.07, mass: 2.0 },
  thinRect: { shape: 'thinRect', size: 0.07, mass: 0.8 },
};

let currentPiece: keyof typeof PIECES = 'cylinder';

function buildGeometry(config: PieceConfig): BufferGeometry {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return new BoxGeometry(s * 2, s * 2, s * 2);
    case 'cylinder': return new CylinderGeometry(s, s, s * 2, 16);
    case 'cone': return new CylinderGeometry(0, s, s * 2, 16);
    case 'bigRect': return new BoxGeometry(s * 4, s * 1.5, s * 2);
    case 'thinRect': return new BoxGeometry(s * 0.5, s * 3, s * 2);
  }
}

function pieceHalfHeight(config: PieceConfig): number {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return s;
    case 'cylinder': return s;
    case 'cone': return s;
    case 'bigRect': return s * 0.75;
    case 'thinRect': return s * 1.5;
  }
}

function buildPhysicsShape(config: PieceConfig) {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return new Box(new Vec3(s, s, s));
    case 'cylinder': return new Cylinder(s, s, s * 2, 16);
    case 'cone': return new Cylinder(0.01, s, s * 2, 16);
    case 'bigRect': return new Box(new Vec3(s * 2, s * 0.75, s));
    case 'thinRect': return new Box(new Vec3(s * 0.25, s * 1.5, s));
  }
}

function createPiece(config: PieceConfig): Piece {
  const spawnY = platformTopY + pieceHalfHeight(config) + 0.4;

  const pieceMesh = new Mesh(
    buildGeometry(config),
    new MeshStandardMaterial({ color: 0x8e44ad })
  );
  pieceMesh.castShadow = true;
  pieceMesh.position.set(platformPosition.x, spawnY, platformPosition.z);
  scene.add(pieceMesh);

  const physBody = new Body({
    mass: config.mass,
    type: Body.DYNAMIC,
    material: pieceMaterial,
    shape: buildPhysicsShape(config),
    linearDamping: 0.1,
    angularDamping: 0.1,
  });
  physBody.position.set(platformPosition.x, spawnY, platformPosition.z);
  physicsWorld.addBody(physBody);

  const piece: Piece = { pieceMesh, physBody };
  activePieces.push(piece);
  return piece;
}

// ─── Plateforme ─────────────────────────────────────────────────────────────────
function createPlatform(width: number, height: number, depth: number): Mesh {
  const platformMesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshStandardMaterial({ color: 0x7ec850, roughness: 0.9, metalness: 0.0 })
  );
  platformMesh.receiveShadow = true;
  platformMesh.castShadow = true;

  const platformBody = new Body({
    type: Body.STATIC,
    material: planeSurfaceMaterial,
    shape: new Box(new Vec3(width / 2, height / 2, depth / 2)),
  });
  physicsWorld.addBody(platformBody);
  (platformMesh as any).__physBody = platformBody;

  return platformMesh;
}

// ─── Select handler ───────────────────────────────────────────────────────────
function onSelect() {
  if (reticle.visible && GAME_STATE === 'init') {
    const PLATFORM_HEIGHT = 0.1;
    const platformMesh = createPlatform(1, PLATFORM_HEIGHT, 1);

    reticle.matrix.decompose(platformMesh.position, platformMesh.quaternion, platformMesh.scale);
    scene.add(platformMesh);

    const body: Body = (platformMesh as any).__physBody;
    body.position.set(platformMesh.position.x, platformMesh.position.y, platformMesh.position.z);
    body.quaternion.set(
      platformMesh.quaternion.x,
      platformMesh.quaternion.y,
      platformMesh.quaternion.z,
      platformMesh.quaternion.w
    );

    platformPosition.copy(platformMesh.position);
    platformTopY = platformMesh.position.y + PLATFORM_HEIGHT / 2;
    lastTime = performance.now();

    GAME_STATE = 'play';
    scene.remove(reticle);

  } else if (GAME_STATE === 'play') {
    const keys = Object.keys(PIECES);
    currentPiece = keys[Math.floor(Math.random() * keys.length)];
    createPiece(PIECES[currentPiece]);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  container = document.createElement('div');
  document.body.appendChild(container);

  scene = new Scene();
  camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  const light = new HemisphereLight(0xffffff, 0xbbbbff, 3);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  // ── plane-detection added as optional so the app still works without it ──
  document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['plane-detection'],
  }));

  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('select', onSelect);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('select', onSelect);
  scene.add(controller2);

  reticle = new Mesh(
    new RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  window.addEventListener('resize', onWindowResize);
}

// ─── Animate loop ─────────────────────────────────────────────────────────────
function animate(_timestamp: any, frame: XRFrame & { detectedPlanes?: XRPlaneSet }) {
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace()!;
    const session = renderer.xr.getSession()!;

    // ── Hit-test setup ──
    if (!hitTestSourceRequested && session) {
      session.requestReferenceSpace('viewer').then((viewerSpace) => {
        session.requestHitTestSource?.({ space: viewerSpace })?.then((source) => {
          hitTestSource = source;
        });
      });
      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
        // Clear plane bodies when session ends
        for (const body of detectedPlanesBodies.values()) physicsWorld.removeBody(body);
        detectedPlanesBodies.clear();
      });
      hitTestSourceRequested = true;
    }

    // ── Reticle update ──
    if (GAME_STATE === 'init' && hitTestSource) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length) {
        reticle.visible = true;
        reticle.matrix.fromArray(hits[0].getPose(referenceSpace)!.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }

    // ── Sync detected planes to Cannon-ES static bodies ──
    if (frame.detectedPlanes && frame.detectedPlanes.size > 0) {
      syncDetectedPlanes(frame.detectedPlanes, frame, referenceSpace);
    }
  }

  // ── Physics step ──
  if (GAME_STATE === 'play') {
    const now = performance.now();
    if (lastTime === null) lastTime = now;
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    physicsWorld.step(1 / 60, delta, 3);

    for (const { pieceMesh, physBody } of activePieces) {
      pieceMesh.position.set(physBody.position.x, physBody.position.y, physBody.position.z);
      pieceMesh.quaternion.set(
        physBody.quaternion.x, physBody.quaternion.y,
        physBody.quaternion.z, physBody.quaternion.w
      );
    }
  }

  renderer.render(scene, camera);
}

init();

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}