export { xrStore, enterVR, enterAR, isXRSupported } from "./xrStore";
export { XRProvider } from "./XRProvider";
export { VRControllers } from "./VRControllers";
export {
  useXRSession,
  useIsXRPresenting,
  type XRSessionState,
} from "./useXRSession";
export { VRSceneSetup } from "./VRSceneSetup";
export { VRHand3D } from "./VRHand3D";
export { VRLifeCounter, VRTurnIndicator, VRStatusBar } from "./VRSpatialUI";
export { VRCameraController } from "./VRCameraController";

// Hand tracking and interactions
export {
  VRCardInteraction,
  useVRGrabState,
  type VRGrabState,
} from "./VRCardInteraction";
export { VRGrabbable, useVRGrab, type VRGrabbableRef } from "./VRGrabbable";
export {
  VRHandTracking,
  useHandPinch,
  type PinchState,
} from "./VRHandTracking";
export { VRCardPlacement, useVRCardPlacement } from "./VRCardPlacement";

// Drag integration and visual feedback
export { VRDragBridge, type VRDragState } from "./VRDragBridge";
export {
  VRCardHighlight,
  VRTileHighlight,
  VRDropZone,
} from "./VRCardHighlight";
export {
  VRRadialMenu,
  defaultCardMenuItems,
  type RadialMenuItem,
} from "./VRRadialMenu";
