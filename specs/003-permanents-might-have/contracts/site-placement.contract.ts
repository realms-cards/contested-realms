/**
 * Contract: Site Edge-Based Placement
 * 
 * Defines the interface for positioning sites toward tile edges
 * facing the owning player rather than in tile centers
 */

export interface SiteEdgePlacement {
  siteId: number;
  tileCoordinates: {
    x: number;
    z: number;
  };
  ownerPlayerId: number;
  edgePosition: {
    x: number; // Offset from tile center toward player
    z: number; // Offset from tile center toward player
  };
  placementAngle: number; // Radians (0-2π) toward player position
}

export interface PlayerPositionReference {
  playerId: number;
  position: {
    x: number;
    z: number;
  };
}

export interface TileBounds {
  center: {
    x: number;
    z: number;
  };
  size: {
    width: number;
    depth: number;
  };
}

export interface SitePlacementQuery {
  tileCoordinates: {
    x: number;
    z: number;
  };
  ownerPlayerId: number;
}

export interface SitePlacementResponse {
  recommendedPosition: {
    x: number;
    z: number;
  };
  placementAngle: number;
  isValidPlacement: boolean;
  conflictingSites?: number[]; // IDs of sites too close to recommended position
}

/**
 * Store contract for site placement management
 */
export interface ISitePlacementStore {
  // Position calculations
  calculateEdgePosition(query: SitePlacementQuery): SitePlacementResponse;
  
  // Site placement state
  setSitePlacement(placement: SiteEdgePlacement): void;
  getSitePlacement(siteId: number): SiteEdgePlacement | null;
  getSitesOnTile(tileX: number, tileZ: number): SiteEdgePlacement[];
  
  // Player position management
  updatePlayerPosition(playerId: number, position: {x: number, z: number}): void;
  getPlayerPosition(playerId: number): PlayerPositionReference | null;
  
  // Validation
  validateSitePlacement(placement: SiteEdgePlacement): boolean;
}

/**
 * Component contract for site rendering
 */
export interface ISiteRenderComponent {
  siteId: number;
  placement: SiteEdgePlacement;
  onPlacementUpdate(newPlacement: SiteEdgePlacement): void;
  onPositionConflict(conflictingSiteIds: number[]): void;
}

/**
 * Contract validation rules
 */
export const SitePlacementValidation = {
  isValidTileCoordinate: (x: number, z: number): boolean => {
    // Assuming game board is 20x20 tiles (adjust as needed)
    return x >= 0 && x < 20 && z >= 0 && z < 20 && 
           Number.isInteger(x) && Number.isInteger(z);
  },
  
  isValidEdgeOffset: (offsetX: number, offsetZ: number): boolean => {
    // Edge offset should keep site within tile bounds
    const maxOffset = 0.4; // 40% of tile size toward edge
    return Math.abs(offsetX) <= maxOffset && Math.abs(offsetZ) <= maxOffset;
  },
  
  isValidAngle: (angle: number): boolean => {
    return angle >= 0 && angle <= 2 * Math.PI;
  },
  
  calculateMinDistance: (pos1: {x: number, z: number}, pos2: {x: number, z: number}): number => {
    return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.z - pos2.z, 2));
  },
  
  hasPlacementConflict: (
    newPlacement: SiteEdgePlacement, 
    existingPlacements: SiteEdgePlacement[]
  ): boolean => {
    const minDistance = 0.3; // Minimum distance between sites
    return existingPlacements.some(existing => 
      SitePlacementValidation.calculateMinDistance(
        newPlacement.edgePosition, 
        existing.edgePosition
      ) < minDistance
    );
  }
};