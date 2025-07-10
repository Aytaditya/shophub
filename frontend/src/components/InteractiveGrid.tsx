import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface InteractiveGridProps {
  className?: string;
}

const InteractiveGrid: React.FC<InteractiveGridProps> = ({ className = '' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const animationIdRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Create interactive grid
    const gridSize = 20;
    const spacing = 0.5;
    const gridGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(gridSize * gridSize * 3);
    const colors = new Float32Array(gridSize * gridSize * 3);
    const originalPositions = new Float32Array(gridSize * gridSize * 3);

    let index = 0;
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const x = (i - gridSize / 2) * spacing;
        const y = (j - gridSize / 2) * spacing;
        const z = 0;

        positions[index * 3] = x;
        positions[index * 3 + 1] = y;
        positions[index * 3 + 2] = z;

        originalPositions[index * 3] = x;
        originalPositions[index * 3 + 1] = y;
        originalPositions[index * 3 + 2] = z;

        // Gradient colors
        const color = new THREE.Color();
        color.setHSL((i / gridSize + j / gridSize) * 0.5, 0.7, 0.6);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;

        index++;
      }
    }

    gridGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    gridGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const gridMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.6
    });

    const gridPoints = new THREE.Points(gridGeometry, gridMaterial);
    scene.add(gridPoints);

    // Mouse interaction
    const handleMouseMove = (event: MouseEvent) => {
      if (!mountRef.current) return;
      
      const rect = mountRef.current.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => setIsHovered(false);

    mountRef.current.addEventListener('mousemove', handleMouseMove);
    mountRef.current.addEventListener('mouseenter', handleMouseEnter);
    mountRef.current.addEventListener('mouseleave', handleMouseLeave);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      const positions = gridGeometry.attributes.position.array as Float32Array;
      const time = Date.now() * 0.001;

      // Update grid points based on mouse position and time
      for (let i = 0; i < gridSize * gridSize; i++) {
        const i3 = i * 3;
        const originalX = originalPositions[i3];
        const originalY = originalPositions[i3 + 1];

        // Distance from mouse
        const mouseDistance = Math.sqrt(
          Math.pow(originalX - mouseRef.current.x * 5, 2) + 
          Math.pow(originalY - mouseRef.current.y * 5, 2)
        );

        // Wave effect
        const wave = Math.sin(time * 2 + mouseDistance * 2) * 0.1;
        
        // Mouse influence
        const mouseInfluence = isHovered ? Math.max(0, 1 - mouseDistance / 3) : 0;
        const mouseEffect = mouseInfluence * Math.sin(time * 5) * 0.3;

        positions[i3 + 2] = wave + mouseEffect;
      }

      gridGeometry.attributes.position.needsUpdate = true;

      // Rotate the grid slightly
      gridPoints.rotation.z = Math.sin(time * 0.5) * 0.1;

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (mountRef.current) {
        mountRef.current.removeEventListener('mousemove', handleMouseMove);
        mountRef.current.removeEventListener('mouseenter', handleMouseEnter);
        mountRef.current.removeEventListener('mouseleave', handleMouseLeave);
      }
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      gridGeometry.dispose();
      gridMaterial.dispose();
      renderer.dispose();
    };
  }, [isHovered]);

  return (
    <div 
      ref={mountRef} 
      className={`absolute inset-0 pointer-events-auto ${className}`}
      style={{ zIndex: 1 }}
    />
  );
};

export default InteractiveGrid;