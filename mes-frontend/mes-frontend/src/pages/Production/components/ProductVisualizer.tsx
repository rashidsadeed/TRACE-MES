import React from "react";
import { Tag } from "antd";

interface ProductVisualizerProps {
  status: string;
}

const cubeStyle: React.CSSProperties = {
  position: "absolute",
  width: "100%",
  height: "100%",
  background: "rgba(24, 144, 255, 0.5)",
  border: "2px solid #1890ff",
};

const CUBE_FACES: React.CSSProperties[] = [
  { ...cubeStyle, transform: "translateZ(40px)" },
  { ...cubeStyle, transform: "rotateY(180deg) translateZ(40px)" },
  { ...cubeStyle, transform: "rotateY(90deg) translateZ(40px)" },
  { ...cubeStyle, transform: "rotateY(-90deg) translateZ(40px)" },
  { ...cubeStyle, transform: "rotateX(90deg) translateZ(40px)" },
  { ...cubeStyle, transform: "rotateX(-90deg) translateZ(40px)" },
];

const SPIN_KEYFRAMES = `
  @keyframes production-spin {
    from { transform: rotateX(-30deg) rotateY(0deg); }
    to   { transform: rotateX(-30deg) rotateY(360deg); }
  }
`;

const ProductVisualizer: React.FC<ProductVisualizerProps> = React.memo(
  ({ status }) => {
    const isRunning = status === "Running";

    return (
      <div
        style={{
          height: 250,
          background: "#1f1f1f",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          border: "1px solid #303030",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            transformStyle: "preserve-3d",
            animation: isRunning
              ? "production-spin 4s infinite linear"
              : "none",
            transform: "rotateX(-30deg) rotateY(45deg)",
          }}
        >
          {CUBE_FACES.map((face, i) => (
            <div key={i} style={face} />
          ))}
        </div>

        <div style={{ position: "absolute", bottom: 10, right: 10 }}>
          <Tag color="blue">3D Live View</Tag>
        </div>

        <style>{SPIN_KEYFRAMES}</style>
      </div>
    );
  },
);

ProductVisualizer.displayName = "ProductVisualizer";

export default ProductVisualizer;
