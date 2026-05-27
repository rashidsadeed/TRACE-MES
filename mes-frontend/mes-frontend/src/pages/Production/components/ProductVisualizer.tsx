import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Center, Environment } from "@react-three/drei";
import { Tag, Spin } from "antd";
import * as THREE from "three";

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error("3D Model load error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#ff4d4f" }}>
          Failed to load 3D Model
        </div>
      );
    }
    return this.props.children;
  }
}

interface ProductVisualizerProps {
  status: string;
  /** Optional URL to a GLB/GLTF 3D model file */
  modelUrl?: string;
}

/** Fallback: animated wireframe box when no model URL is provided */
const FallbackBox: React.FC<{ isRunning: boolean }> = ({ isRunning }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current && isRunning) {
      meshRef.current.rotation.y += delta * 0.8;
      meshRef.current.rotation.x += delta * 0.3;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-0.5, 0.7, 0]}>
      <boxGeometry args={[1.6, 1.6, 1.6]} />
      <meshStandardMaterial
        color="#1890ff"
        wireframe
        transparent
        opacity={0.8}
      />
    </mesh>
  );
};

/** Loads and displays a GLB/GLTF 3D model */
const ModelViewer: React.FC<{ url: string; isRunning: boolean }> = ({ url, isRunning }) => {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  const scale = React.useMemo(() => {
    // Calculate the bounding box without mutating the shared scene object
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    return maxDim > 0 ? 2.5 / maxDim : 1;
  }, [scene]);

  useFrame((_, delta) => {
    if (groupRef.current && isRunning) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <Center>
      <group ref={groupRef} scale={scale}>
        <primitive object={scene} />
      </group>
    </Center>
  );
};

const ProductVisualizer: React.FC<ProductVisualizerProps> = React.memo(
  ({ status, modelUrl }) => {
    const isRunning = status === "Running";

    return (
      <div
        style={{
          height: 250,
          background: "#1f1f1f",
          borderRadius: 8,
          position: "relative",
          overflow: "hidden",
          border: "1px solid #303030",
        }}
      >
        <ErrorBoundary>
          <Suspense
            fallback={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <Spin tip="Loading 3D Model..." />
              </div>
            }
          >
            <Canvas
              camera={{ position: [3, 2, 3], fov: 45 }}
              style={{ height: "100%" }}
            >
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 5, 5]} intensity={0.8} />
              <Environment preset="studio" />

              {modelUrl ? (
                <ModelViewer url={modelUrl} isRunning={isRunning} />
              ) : (
                <FallbackBox isRunning={isRunning} />
              )}

              <OrbitControls
                enablePan={false}
                enableZoom={true}
                minDistance={1}
                maxDistance={15}
                autoRotate={!isRunning}
                autoRotateSpeed={1.5}
              />
            </Canvas>
          </Suspense>
        </ErrorBoundary>

        <div style={{ position: "absolute", bottom: 10, right: 10 }}>
          <Tag color="blue">3D Live View</Tag>
        </div>
      </div>
    );
  },
);

ProductVisualizer.displayName = "ProductVisualizer";

export default ProductVisualizer;
