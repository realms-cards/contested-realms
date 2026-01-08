import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type { GameState } from "@/lib/game/store/types";

type DraggingSiteGhostProps = {
  draggingSite: GameState["draggingSite"];
};

export function DraggingSiteGhost({ draggingSite }: DraggingSiteGhostProps) {
  if (!draggingSite) return null;

  const { site, worldPos } = draggingSite;
  const rotZ =
    -Math.PI / 2 +
    (site.owner === 1 ? 0 : Math.PI) +
    (site.tapped ? -Math.PI / 2 : 0);

  return (
    <group position={[worldPos.x, 0.15, worldPos.z]}>
      {site.card?.slug ? (
        <CardPlane
          slug={site.card.slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          depthWrite
          depthTest
          rotationZ={rotZ}
          elevation={0}
          renderOrder={2000}
        />
      ) : (
        <mesh rotation-x={-Math.PI / 2} rotation-z={rotZ} castShadow>
          <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
          <meshStandardMaterial
            color={site.owner === 1 ? "#2f6fed" : "#d94e4e"}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </group>
  );
}
