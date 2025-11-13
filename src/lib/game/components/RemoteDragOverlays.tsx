import { memo } from "react";
import CardOutline from "@/lib/game/components/CardOutline";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type {
  RemoteAvatarDrag,
  RemoteHandDrag,
  RemotePermanentDrag,
} from "@/lib/game/hooks/useRemoteCursorSystem";

export type RemoteDragOverlaysProps = {
  handDrags: RemoteHandDrag[];
  permanentDrags: RemotePermanentDrag[];
  avatarDrags: RemoteAvatarDrag[];
};

function RemoteDragOverlaysComponent({
  handDrags,
  permanentDrags,
  avatarDrags,
}: RemoteDragOverlaysProps) {
  if (
    handDrags.length === 0 &&
    permanentDrags.length === 0 &&
    avatarDrags.length === 0
  ) {
    return null;
  }

  return (
    <>
      {handDrags.length > 0 && (
        <group>
          {handDrags.map((d) => (
            <group key={d.key} position={[d.pos.x, 0.33, d.pos.z]}>
              <CardOutline
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={d.rotZ}
                elevation={0.0001}
                color={d.color}
                renderOrder={1000}
              />
              <CardPlane
                slug=""
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={d.rotZ}
                elevation={0.005}
                renderOrder={540}
                interactive={false}
                textureUrl="/api/assets/cardback_spellbook.png"
                forceTextureUrl
              />
            </group>
          ))}
        </group>
      )}

      {permanentDrags.length > 0 && (
        <group>
          {permanentDrags.map((d) => (
            <group key={d.key} position={[d.pos.x, 0.26, d.pos.z]}>
              <CardOutline
                width={d.width}
                height={d.height}
                rotationZ={d.rotZ}
                elevation={0.0001}
                color={d.color}
                renderOrder={1000}
              />
              <CardPlane
                slug={d.slug}
                width={d.width}
                height={d.height}
                rotationZ={d.rotZ}
                elevation={0.001}
                renderOrder={530}
                interactive={false}
                textureUrl={d.textureUrl}
                forceTextureUrl={Boolean(d.textureUrl)}
                textureRotation={d.textureRotation ?? 0}
              />
            </group>
          ))}
        </group>
      )}

      {avatarDrags.length > 0 && (
        <group>
          {avatarDrags.map((d) => (
            <group key={d.key} position={[d.pos.x, 0.26, d.pos.z]}>
              <CardOutline
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={d.rotZ}
                elevation={0.0001}
                color={d.color}
                renderOrder={1000}
              />
              <CardPlane
                slug={d.slug}
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={d.rotZ}
                elevation={0.002}
                polygonOffsetUnits={-1.25}
                polygonOffsetFactor={-0.75}
                renderOrder={550}
                interactive={false}
                textureUrl={
                  d.slug ? undefined : "/api/assets/cardback_spellbook.png"
                }
              />
            </group>
          ))}
        </group>
      )}
    </>
  );
}

export const RemoteDragOverlays = memo(RemoteDragOverlaysComponent);

