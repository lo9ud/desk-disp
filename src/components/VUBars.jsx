import { useEffect, useRef, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const FrequencyReading = {
  magnitude: 0
};

function makeSineWave(array) {
  const len = array.length;
  const padding = 0.2;
  const freq_hi = 7;
  const speed_hi = 2;
  const freq_mid = 4;
  const speed_mid = 1;
  const freq_lo = 2;
  const speed_lo = -1;

  const hi = (i, t) => Math.sin((i / len) * Math.PI * freq_hi + t * speed_hi);
  const mid = (i, t) => Math.sin((i / len) * Math.PI * freq_mid + t * speed_mid);
  const lo = (i, t) => Math.sin((i / len) * Math.PI * freq_lo + t * speed_lo);
  const t = Date.now() / 1000;

  return array.map((_, i) => ((hi(i, t) + mid(i, t) + lo(i, t)) / 3 * 0.5 + 0.5) * (1 - padding * 2) + padding);
}

function VUBars({ data: frequencyData }) {
  const meshRef = useRef();
  const peaksRef = useRef();
  const firstZero = useRef(null);
  const max = useRef(null);
  const { viewport } = useThree();
  
  const barCount = frequencyData?.length || 64;
  const barDensity = 0.4;
  
  // Create instanced geometry for bars
  const [barGeometry, peakGeometry] = useMemo(() => {
    const barGeo = new THREE.BoxGeometry(1, 1, 1);
    const peakGeo = new THREE.BoxGeometry(1, 0.1, 1);
    return [barGeo, peakGeo];
  }, []);

  // Create materials
  const [barMaterial, peakMaterial] = useMemo(() => {
    const barMat = new THREE.MeshBasicMaterial({ 
      color: new THREE.Color(0.255, 0.251, 0.251) 
    });
    const peakMat = new THREE.MeshBasicMaterial({ 
      color: new THREE.Color(1, 1, 1) 
    });
    return [barMat, peakMat];
  }, []);

  // Create instanced meshes
  const barInstances = useMemo(() => {
    return new THREE.InstancedMesh(barGeometry, barMaterial, barCount);
  }, [barGeometry, barMaterial, barCount]);

  const peakInstances = useMemo(() => {
    return new THREE.InstancedMesh(peakGeometry, peakMaterial, barCount);
  }, [peakGeometry, peakMaterial, barCount]);

  useFrame(() => {
    if (!frequencyData || !meshRef.current || !peaksRef.current) return;

    const floor = 0.6;
    let magnitudes = frequencyData.map((f) => {
      return Math.max(
        Math.pow((f.magnitude - floor) / (1 - floor), 3),
        0.04
      );
    });

    // Handle silence with sine wave
    if (frequencyData.every((f) => f.magnitude <= 0.01)) {
      if (!firstZero.current) {
        firstZero.current = new Date();
      } else if (Date.now() - firstZero.current.getTime() > 2000) {
        magnitudes = makeSineWave(magnitudes);
      }
    } else {
      firstZero.current = null;
    }

    // Update max values for peaks
    if (!max.current) {
      max.current = magnitudes;
    } else {
      max.current = max.current.map((m, i) =>
        Math.max(m * 0.98, magnitudes[i])
      );
    }

    // Calculate dimensions
    const totalWidth = viewport.width;
    const barWidth = totalWidth / barCount;
    const barSpacing = barWidth * (1 - barDensity);
    const actualBarWidth = barWidth - barSpacing;
    
    const dummy = new THREE.Object3D();
    const peakDummy = new THREE.Object3D();

    // Update bar instances
    magnitudes.forEach((magnitude, i) => {
      const x = (i - barCount / 2) * barWidth + barWidth / 2;
      const height = magnitude * viewport.height;
      const y = height / 2 - viewport.height / 2;

      // Main bar
      dummy.position.set(x, y, 0);
      dummy.scale.set(actualBarWidth, height, actualBarWidth);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Peak indicator
      const peakHeight = max.current[i] * viewport.height;
      const peakY = peakHeight - viewport.height / 2;
      peakDummy.position.set(x, peakY, 0.01);
      peakDummy.scale.set(actualBarWidth, 0.1, actualBarWidth);
      peakDummy.updateMatrix();
      peaksRef.current.setMatrixAt(i, peakDummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    peaksRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive ref={meshRef} object={barInstances} />
      <primitive ref={peaksRef} object={peakInstances} />
    </>
  );
}

export default function R3FVUMeter({ data }) {
  const [containerSize, setContainerSize] = useState({ width: 400, height: 200 });
  const containerRef = useRef();

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Generate demo data if no data provided
  const demoData = useMemo(() => {
    return Array.from({ length: 64 }, (_, i) => ({
      magnitude: Math.random() * 0.8 + 0.1
    }));
  }, []);

  return (
    <div 
      ref={containerRef}
    >
      <Canvas
        camera={{ 
          position: [0, 0, 200],
          fov: 75
        }}
        gl={{alpha: true}}
        style={{ width: containerSize.width, height: containerSize.height }}
      >
        <VUBars data={data || demoData} />
      </Canvas>
    </div>
  );
}