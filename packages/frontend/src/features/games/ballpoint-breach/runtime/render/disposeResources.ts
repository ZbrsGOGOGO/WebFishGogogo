// WebFish integration: explicit ownership-aware cleanup for repeated SPA mounts.
import * as THREE from 'three';
import { OutlinedMeshGroup } from './OutlinedMesh';

export interface PreservedResources {
  geometries?: ReadonlySet<THREE.BufferGeometry>;
  materials?: ReadonlySet<THREE.Material>;
}

export function disposeObjectResources(root: THREE.Object3D, preserved: PreservedResources = {}): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof OutlinedMeshGroup) object.releaseOutlineResources();
    // Cached outline resources use reference counts, not surface ownership.
    if (object.parent instanceof OutlinedMeshGroup && object === object.parent.outline) return;
    const drawable = object as THREE.Mesh;
    if (drawable.geometry && !preserved.geometries?.has(drawable.geometry)) geometries.add(drawable.geometry);
    for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) {
      if (material && !preserved.materials?.has(material)) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
      }
    }
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
