"use strict";

// ⚠️ DO NOT EDIT main.js DIRECTLY ⚠️
// This file is generated from the TypeScript source main.ts
// Any changes made here will be overwritten.

// Import only what you need, to help your bundler optimize final code size using tree shaking
// see https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)

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
  MeshStandardMaterial
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

const timer = new Timer();
timer.connect(document);

//─── Monde physique ─────────────────────────────────────────────────────────────────────
let physicsWorld = new World({
  gravity: new Vec3(0, -9, 0),
});

// ─── Matériaux physiques ───────────────────────────────────────────────────────
const floorPhysMaterial = new Material();


const PLATFORM_DIM = 2;
function createPlatform(width: number, height: number, depth: number) {
  const platformMesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshStandardMaterial({ color: 0x7ec850, roughness: 0.9, metalness: 0.0 })
  );
  // platformMesh.position.set(x, y, z);
  platformMesh.receiveShadow = true;
  platformMesh.castShadow = true;
  // scene.add(platformMesh);

  const platformBody = new Body({
    type: Body.STATIC,
    material: floorPhysMaterial,
    shape: new Box(new Vec3(width / 2, height / 2, depth / 2)),
  });
  // platformBody.position.set(x, y, z);
  physicsWorld.addBody(platformBody);
  return platformMesh;
}


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

  renderer.render(scene, camera);

};

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




  function onSelect() {

    if (reticle.visible) {

      // const material = new MeshPhongMaterial({ color: 0xffffff * Math.random() });
      // const mesh = new Mesh(geometry, material);
      // reticle.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      // mesh.scale.y = Math.random() * 2 + 1;
      // scene.add(mesh);

      const platformMesh = createPlatform(PLATFORM_DIM, 1, PLATFORM_DIM);
      reticle.matrix.decompose(platformMesh.position, platformMesh.quaternion, platformMesh.scale);
      scene.add(platformMesh);
      // Penser à mettre la physique du plateau à jour ?
    }

  }

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

init();


function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

}
