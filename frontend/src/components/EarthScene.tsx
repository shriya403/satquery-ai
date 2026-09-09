"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  Points,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from "three";
import type { DatasetScene } from "../lib/satquery";
import type { EarthView } from "./EarthStage";

type EarthSceneProps = {
  scenes: DatasetScene[];
  selectedDatasetId: string | null;
  onSceneSelect: (datasetId: string) => void;
  autoRotate: boolean;
  reducedMotion: boolean;
  textureUrl: string;
  view: EarthView;
  onViewChange: (view: EarthView) => void;
  onSceneReady: () => void;
};

const EARTH_RADIUS = 1.48;

function wrapLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
}

function lerpLongitude(from: number, to: number, alpha: number): number {
  const delta = wrapLongitude(to - from);
  return wrapLongitude(from + delta * alpha);
}

function latLonToVector(lat: number, lon: number, radius: number): Vector3 {
  const phi = MathUtils.degToRad(90 - lat);
  const theta = MathUtils.degToRad(lon + 180);
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function useSceneAccent(): Color {
  return useMemo(() => new Color("#6ddcf4"), []);
}

function CameraRig({
  autoRotate,
  reducedMotion,
  view,
  onViewChange
}: Pick<EarthSceneProps, "autoRotate" | "reducedMotion" | "view" | "onViewChange">) {
  const current = useRef({ ...view });
  const target = useRef({ ...view });
  const lastSpinAt = useRef(0);

  useEffect(() => {
    target.current = { ...view };
  }, [view]);

  useFrame((state, delta) => {
    if (document.hidden) {
      return;
    }

    if (autoRotate && !reducedMotion) {
      target.current.lon = wrapLongitude(target.current.lon + delta * 2.4);
      lastSpinAt.current += delta;
      if (lastSpinAt.current > 0.5) {
        lastSpinAt.current = 0;
        onViewChange({ ...target.current });
      }
    }

    const damping = reducedMotion ? 1 : 1 - Math.exp(-delta * 4.8);
    current.current.lat = MathUtils.lerp(current.current.lat, target.current.lat, damping);
    current.current.lon = lerpLongitude(current.current.lon, target.current.lon, damping);
    current.current.distance = MathUtils.lerp(current.current.distance, target.current.distance, damping);

    const position = latLonToVector(current.current.lat, current.current.lon, current.current.distance);
    state.camera.position.copy(position);
    state.camera.lookAt(0, 0, 0);
    state.camera.updateProjectionMatrix();
  });

  return null;
}

function StarField({ reducedMotion }: { reducedMotion: boolean }) {
  const pointsRef = useRef<Points>(null);
  const geometry = useMemo(() => {
    const values: number[] = [];
    for (let index = 0; index < 420; index += 1) {
      const radius = 12 + Math.random() * 22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      values.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }

    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute("position", new Float32BufferAttribute(values, 3));
    return starGeometry;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (!pointsRef.current || reducedMotion || document.hidden) {
      return;
    }
    pointsRef.current.rotation.y += delta * 0.006;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#cdd9f7"
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </points>
  );
}

function EarthMesh({ textureUrl, onSceneReady }: Pick<EarthSceneProps, "textureUrl" | "onSceneReady">) {
  const texture = useLoader(TextureLoader, textureUrl);
  const accent = useSceneAccent();

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    onSceneReady();
  }, [onSceneReady, texture]);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 72, 36]} />
        <meshStandardMaterial map={texture} roughness={0.84} metalness={0.02} />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.018, 72, 36]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.11}
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function DatasetMarkers({
  scenes,
  selectedDatasetId,
  onSceneSelect
}: Pick<EarthSceneProps, "scenes" | "selectedDatasetId" | "onSceneSelect">) {
  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  return (
    <group>
      {scenes.map((scene) => {
        const selected = scene.dataset.dataset_id === selectedDatasetId;
        const position = latLonToVector(scene.center.lat, scene.center.lon, EARTH_RADIUS + 0.045);
        const color = selected ? "#ddbb76" : scene.isRealScene ? "#6ddcf4" : "#aab8cc";

        return (
          <mesh
            key={scene.dataset.dataset_id}
            position={position}
            onPointerDown={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
            }}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onSceneSelect(scene.dataset.dataset_id);
            }}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "";
            }}
          >
            <sphereGeometry args={[selected ? 0.045 : 0.032, 18, 18]} />
            <meshBasicMaterial color={color} transparent opacity={selected ? 1 : 0.92} />
          </mesh>
        );
      })}
    </group>
  );
}

function SceneContents(props: EarthSceneProps) {
  return (
    <>
      <color attach="background" args={["#020712"]} />
      <fog attach="fog" args={["#020712", 7, 22]} />
      <ambientLight intensity={0.58} />
      <hemisphereLight args={["#aacfff", "#03050c", 0.72]} />
      <directionalLight position={[3, 1.5, 3.5]} intensity={2.2} color="#f5fbff" />
      <directionalLight position={[-3.6, -1.2, -4]} intensity={0.7} color="#5baeea" />
      <StarField reducedMotion={props.reducedMotion} />
      <EarthMesh textureUrl={props.textureUrl} onSceneReady={props.onSceneReady} />
      <DatasetMarkers scenes={props.scenes} selectedDatasetId={props.selectedDatasetId} onSceneSelect={props.onSceneSelect} />
      <CameraRig
        autoRotate={props.autoRotate}
        reducedMotion={props.reducedMotion}
        view={props.view}
        onViewChange={props.onViewChange}
      />
    </>
  );
}

export function EarthScene(props: EarthSceneProps) {
  return (
    <Canvas
      className="earth-canvas"
      dpr={[1, 1.5]}
      camera={{ fov: 42, near: 0.1, far: 80, position: [0, 0, props.view.distance] }}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance"
      }}
      onCreated={({ gl }) => {
        gl.setClearColor("#020712", 1);
      }}
    >
      <Suspense fallback={null}>
        <SceneContents {...props} />
      </Suspense>
    </Canvas>
  );
}
