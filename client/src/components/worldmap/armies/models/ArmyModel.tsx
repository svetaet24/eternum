/*
Auto-generated by: https://github.com/pmndrs/gltfjsx
Command: npx gltfjsx@6.2.16 --types --keepnames --keepgroups --keepmeshes --transform --precision 6 client/public/models/unit.glb 
Files: client/public/models/unit.glb [2.62KB] > /Users/aymericdelabrousse/Projects/blockchain/cairo/realms/official-eternum/eternum/unit-transformed.glb [1.42KB] (46%)
*/

import * as THREE from "three";
import React, { forwardRef, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: {
    unit: THREE.Mesh;
  };
  materials: {
    Unit: THREE.MeshStandardMaterial;
  };
};

type ArmyModelProps = JSX.IntrinsicElements["group"] & {
  defaultColor: string;
  hoverColor: string;
};

export const ArmyModel = forwardRef((props: ArmyModelProps, ref) => {
  const { nodes, materials } = useGLTF("/models/unit-transformed.glb") as GLTFResult;
  const [color, setColor] = useState(props.defaultColor);

  const onPointerEnter = () => setColor(props.hoverColor);
  const onPointerLeave = () => setColor(props.defaultColor);

  // Create a new material with selected properties from materials.Unit
  // @ts-ignore
  const material = new THREE.MeshStandardMaterial(materials.Unit);
  material.color.set(color); // Set the color separately

  return (
    // @ts-ignore
    <group {...props} ref={ref} dispose={null}>
      {/* <group {...props} position={ref?.current[Number(props.id)]} dispose={null}> */}
      <group name="Scene">
        <mesh
          name="unit"
          geometry={nodes.unit.geometry}
          material={material}
          rotation={[0, -Math.PI / 2, 0]}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
        />
      </group>
    </group>
  );
});

useGLTF.preload("/models/unit-transformed.glb");
