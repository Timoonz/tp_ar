"use strict";

import {
  AmbientLight,
  BoxGeometry,
  Timer,
  Color,
  CylinderGeometry,
  HemisphereLight,
  Mesh,
  MeshNormalMaterial,
  MeshPhongMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  RingGeometry,
  MeshBasicMaterial,
  Object3D,
  Object3DEventMap,
  MeshStandardMaterial,
  BufferGeometry,
  Group,
  Vector3
} from 'three';

import {
  Body,
  Box,
  Plane,
  Vec3,
  World,
  Material,
  ContactMaterial,
  Cylinder,
} from 'cannon-es'

import { ARButton } from 'three/addons/webxr/ARButton.js';

// Example of hard link to official repo for data, if needed
// const MODEL_PATH = 'https://raw.githubusercontent.com/mrdoob/three.js/r173/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';

let container;

// ─── Caméra / scène / renderer ───────────────────────────────────────────────
let camera: PerspectiveCamera;
let scene: Scene;
let renderer: WebGLRenderer;

let reticle: Object3D<Object3DEventMap>;

let controller1, controller2;

let hitTestSource: XRHitTestSource | null = null;
let hitTestSourceRequested = false;

let lastTime: number | null = null;

let GAME_STATE = 'init';

//─── Plateforme ─────────────────────────────────────────────────────────────────────
let platformPosition = new Vector3();
let platformTopY = 0;

//─── Sol invisible ──────────────────────────────────────────────────────────────────
let invisibleFloorBody: Body | null = null;

//─── Monde physique ─────────────────────────────────────────────────────────────────────
let physicsWorld = new World({
  gravity: new Vec3(0, -9, 0),
});

// ─── Matériaux physiques ───────────────────────────────────────────────────────
const floorPhysMaterial = new Material('floor');
const pieceMaterial = new Material('piece');

// Friction/restitution entre les pièces et la plateforme
const pieceFloorContact = new ContactMaterial(floorPhysMaterial, pieceMaterial, {
  friction: 0.6,
  restitution: 0.1,
});
physicsWorld.addContactMaterial(pieceFloorContact);

// Friction/restitution entre les pièces
const piecePieceContact = new ContactMaterial(pieceMaterial, pieceMaterial, {
  friction: 0.6,
  restitution: 0.05,
});
physicsWorld.addContactMaterial(piecePieceContact);

//─── Pièces actives ─────────────────────────────────────────────────────────────────────
interface Piece {
  pieceMesh: Mesh;
  physBody: Body;
}

const activePieces: Piece[] = [];

//─── Pièces ─────────────────────────────────────────────────────────────────────

type PieceShape = "cube" | "cylinder" | "cone" | "bigRect" | "thinRect";

interface PieceConfig {
  shape: PieceShape;
  size: number;
  mass: number;
}

const PIECES: Record<string, PieceConfig> = {
  cube: {
    shape: 'cube',
    size: 0.07,
    mass: 1.0,
  },
  cylinder: {
    shape: 'cylinder',
    size: 0.07,
    mass: 1.0,
  },
  cone: {
    shape: 'cone',
    size: 0.07,
    mass: 1.0,
  },
  bigRect: {
    shape: 'bigRect',
    size: 0.07,
    mass: 2.0,
  },
  thinRect: {
    shape: 'thinRect',
    size: 0.07,
    mass: 0.8,
  },
}

let currentPiece: keyof typeof PIECES = 'cylinder';


// ─── Helper: build Three.js geometry from config ──────────────────────────────
function buildGeometry(config: PieceConfig): BufferGeometry {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return new BoxGeometry(s * 2, s * 2, s * 2);
    case 'cylinder': return new CylinderGeometry(s, s, s * 2, 16);
    case 'cone': return new CylinderGeometry(0, s, s * 2, 16);
    case 'bigRect': return new BoxGeometry(s * 4, s * 1.5, s * 2);
    case 'thinRect': return new BoxGeometry(s * 0.5, s * 3, s * 2);
  }
};

// ─── Helper: half-height of a piece (used to sit it on top of the platform) ──
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

// ─── Helper: build Cannon-ES shape from config ────────────────────────────────
function buildPhysicsShape(config: PieceConfig) {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return new Box(new Vec3(s, s, s));
    case 'cylinder': return new Cylinder(s, s, s * 2, 16);
    case 'cone': return new Cylinder(0.01, s, s * 2, 16); // cannon-es doesn't support radius 0
    case 'bigRect': return new Box(new Vec3(s * 2, s * 0.75, s));
    case 'thinRect': return new Box(new Vec3(s * 0.25, s * 1.5, s));
  }
};


function createPiece(config: PieceConfig): Piece {
  const spawnY = platformTopY + pieceHalfHeight(config) + 0.4;

  // mesh Three.js 
  const pieceMesh = new Mesh(
    buildGeometry(config),
    new MeshStandardMaterial({ color: 0x8e44ad })
  );
  pieceMesh.castShadow = true;
  pieceMesh.position.set(platformPosition.x, spawnY, platformPosition.z);
  scene.add(pieceMesh);

  // bidy Cannon-ES 
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

// ─── Création de la plateforme ────
function createPlatform(width: number, height: number, depth: number): Mesh {
  const platformMesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshStandardMaterial({ color: 0x7ec850, roughness: 0.9, metalness: 0.0 })
  );
  platformMesh.receiveShadow = true;
  platformMesh.castShadow = true;

  const platformBody = new Body({
    type: Body.STATIC,
    material: floorPhysMaterial,
    shape: new Box(new Vec3(width / 2, height / 2, depth / 2)),
  });

  physicsWorld.addBody(platformBody);

  (platformMesh as any).__physBody = platformBody;

  return platformMesh;
}

function onSelect() {

  if (reticle.visible && GAME_STATE == 'init') {

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

    // Sol invisible : placé 0.5 m sous la plateforme pour rattraper les pièces qui tombent
    const FLOOR_OFFSET = 0.5;
    invisibleFloorBody = new Body({
      type: Body.STATIC,
      material: floorPhysMaterial,
      shape: new Plane(),
    });
    invisibleFloorBody.position.set(
      platformMesh.position.x,
      platformMesh.position.y - FLOOR_OFFSET,
      platformMesh.position.z
    );
    // Plane est orienté vers le haut par défaut avec Cannon-ES (normale = +Y)
    invisibleFloorBody.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
    physicsWorld.addBody(invisibleFloorBody);



    GAME_STATE = 'play';
    scene.remove(reticle);
  }

  else if (GAME_STATE == 'play') {
    const keys = Object.keys(PIECES);
    currentPiece = keys[Math.floor(Math.random() * keys.length)];
    createPiece(PIECES[currentPiece]);
  }

}

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

  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

  const geometry = new CylinderGeometry(0.1, 0.1, 0.2, 32).translate(0, 0.1, 0);


  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('select', onSelect);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('select', onSelect);
  scene.add(controller2);

  reticle = new Mesh(
    new RingGeometry(0.15, 0.2, 32).rotateX(- Math.PI / 2),
    new MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  window.addEventListener('resize', onWindowResize);

};

function animate(_timestamp: any, frame: { getHitTestResults: (arg0: XRHitTestSource) => any; }) {

  if (frame) {

    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (hitTestSourceRequested === false) {
      if (session) {
        session.requestReferenceSpace('viewer').then(function (referenceSpace) {

          session.requestHitTestSource?.({ space: referenceSpace })?.then(function (source) {

            hitTestSource = source;

          });

        });

        session.addEventListener('end', function () {

          hitTestSourceRequested = false;
          hitTestSource = null;

        });

        hitTestSourceRequested = true;
      }


    }
    if (GAME_STATE == "init") {
      if (hitTestSource) {

        const hitTestResults = frame.getHitTestResults(hitTestSource);

        if (hitTestResults.length) {
          const hit = hitTestResults[0];
          reticle.visible = true;
          reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
        } else {
          reticle.visible = false;
        }
      }
    }

    if (GAME_STATE === 'play') {
      const now = performance.now();
      if (lastTime === null) {
        lastTime = now;
      }
      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      physicsWorld.step(1 / 60, delta, 3);

      // Sync Three.js meshes to Cannon-ES bodies
      for (const { pieceMesh, physBody } of activePieces) {
        pieceMesh.position.set(
          physBody.position.x,
          physBody.position.y,
          physBody.position.z
        );
        pieceMesh.quaternion.set(
          physBody.quaternion.x,
          physBody.quaternion.y,
          physBody.quaternion.z,
          physBody.quaternion.w
        );
      }
    }

  }

  renderer.render(scene, camera);

};


init();


function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
