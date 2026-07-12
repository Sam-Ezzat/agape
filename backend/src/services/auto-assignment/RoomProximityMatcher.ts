/**
 * Room Proximity Matcher
 * 
 * WHY: Finds nearby rooms for splitting groups
 * Priority: Adjacent rooms → Same floor → Same building
 * 
 * SOLID: Single Responsibility - Only handles room proximity logic
 */

import { Room } from '@prisma/client';
import logger from '@/utils/logger';

export interface RoomWithDetails extends Room {
  floor?: {
    floorNumber: number;
    building?: {
      id: string;
      name: string;
    };
  };
}

export interface ProximityMatch {
  rooms: Room[];
  proximityLevel: 'adjacent' | 'same_floor' | 'same_building' | 'none';
  distance?: number; // Room number difference for adjacent rooms
}

export class RoomProximityMatcher {
  /**
   * Find nearby rooms for a group split
   * Returns best matches in priority order
   */
  public findNearbyRooms(
    targetCapacity: number,
    availableRooms: RoomWithDetails[],
    count: number = 2
  ): ProximityMatch | null {
    logger.info('Finding nearby rooms', { targetCapacity, count, availableRooms: availableRooms.length });

    // Filter rooms by capacity
    const suitableRooms = availableRooms.filter(
      room => room.capacity >= Math.ceil(targetCapacity / count)
    );

    if (suitableRooms.length < count) {
      logger.warn('Not enough suitable rooms for split', {
        required: count,
        available: suitableRooms.length,
      });
      return null;
    }

    // Try to find adjacent rooms (highest priority)
    const adjacentMatch = this.findAdjacentRooms(suitableRooms, count);
    if (adjacentMatch) {
      logger.info('Found adjacent rooms', { rooms: adjacentMatch.rooms.map(r => r.roomNumber) });
      return adjacentMatch;
    }

    // Try to find same-floor rooms (medium priority)
    const sameFloorMatch = this.findSameFloorRooms(suitableRooms, count);
    if (sameFloorMatch) {
      logger.info('Found same-floor rooms', { rooms: sameFloorMatch.rooms.map(r => r.roomNumber) });
      return sameFloorMatch;
    }

    // Try to find same-building rooms (lowest priority)
    const sameBuildingMatch = this.findSameBuildingRooms(suitableRooms, count);
    if (sameBuildingMatch) {
      logger.info('Found same-building rooms', { rooms: sameBuildingMatch.rooms.map(r => r.roomNumber) });
      return sameBuildingMatch;
    }

    // No proximity match, just return any available rooms
    logger.warn('No proximity match found, returning any available rooms');
    return {
      rooms: suitableRooms.slice(0, count),
      proximityLevel: 'none',
    };
  }

  /**
   * Find adjacent rooms (same floor, consecutive room numbers)
   * Example: Room 101 & 102, or Room 201 & 202
   */
  private findAdjacentRooms(
    rooms: RoomWithDetails[],
    count: number
  ): ProximityMatch | null {
    // Group by floor
    const floorGroups = new Map<string, RoomWithDetails[]>();
    
    for (const room of rooms) {
      if (!room.floor) continue;
      
      const floorKey = `${room.floor.building?.id || 'unknown'}-${room.floor.floorNumber}`;
      if (!floorGroups.has(floorKey)) {
        floorGroups.set(floorKey, []);
      }
      floorGroups.get(floorKey)!.push(room);
    }

    // Check each floor for adjacent rooms
    for (const [floorKey, floorRooms] of floorGroups.entries()) {
      if (floorRooms.length < count) continue;

      // Sort by room number
      const sortedRooms = floorRooms
        .filter(r => this.isNumericRoomNumber(r.roomNumber))
        .sort((a, b) => this.extractRoomNumber(a.roomNumber) - this.extractRoomNumber(b.roomNumber));

      // Find consecutive rooms
      for (let i = 0; i <= sortedRooms.length - count; i++) {
        const candidates = sortedRooms.slice(i, i + count);
        
        if (this.areConsecutive(candidates)) {
          const distance = Math.abs(
            this.extractRoomNumber(candidates[candidates.length - 1].roomNumber) -
            this.extractRoomNumber(candidates[0].roomNumber)
          );

          return {
            rooms: candidates,
            proximityLevel: 'adjacent',
            distance,
          };
        }
      }
    }

    return null;
  }

  /**
   * Find rooms on the same floor
   */
  private findSameFloorRooms(
    rooms: RoomWithDetails[],
    count: number
  ): ProximityMatch | null {
    // Group by floor
    const floorGroups = new Map<string, RoomWithDetails[]>();
    
    for (const room of rooms) {
      if (!room.floor) continue;
      
      const floorKey = `${room.floor.building?.id || 'unknown'}-${room.floor.floorNumber}`;
      if (!floorGroups.has(floorKey)) {
        floorGroups.set(floorKey, []);
      }
      floorGroups.get(floorKey)!.push(room);
    }

    // Find floor with enough rooms
    for (const [floorKey, floorRooms] of floorGroups.entries()) {
      if (floorRooms.length >= count) {
        // Sort by room number for consistency
        const sortedRooms = floorRooms
          .filter(r => this.isNumericRoomNumber(r.roomNumber))
          .sort((a, b) => this.extractRoomNumber(a.roomNumber) - this.extractRoomNumber(b.roomNumber))
          .slice(0, count);

        if (sortedRooms.length === count) {
          return {
            rooms: sortedRooms,
            proximityLevel: 'same_floor',
          };
        }
      }
    }

    return null;
  }

  /**
   * Find rooms in the same building
   */
  private findSameBuildingRooms(
    rooms: RoomWithDetails[],
    count: number
  ): ProximityMatch | null {
    // Group by building
    const buildingGroups = new Map<string, RoomWithDetails[]>();
    
    for (const room of rooms) {
      if (!room.floor?.building) continue;
      
      const buildingId = room.floor.building.id;
      if (!buildingGroups.has(buildingId)) {
        buildingGroups.set(buildingId, []);
      }
      buildingGroups.get(buildingId)!.push(room);
    }

    // Find building with enough rooms
    for (const [buildingId, buildingRooms] of buildingGroups.entries()) {
      if (buildingRooms.length >= count) {
        // Prefer rooms on closer floors
        const sortedRooms = buildingRooms
          .sort((a, b) => {
            const floorDiff = (a.floor?.floorNumber || 0) - (b.floor?.floorNumber || 0);
            if (floorDiff !== 0) return floorDiff;
            
            // Within same floor, sort by room number
            return this.extractRoomNumber(a.roomNumber) - this.extractRoomNumber(b.roomNumber);
          })
          .slice(0, count);

        if (sortedRooms.length === count) {
          return {
            rooms: sortedRooms,
            proximityLevel: 'same_building',
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if room number is numeric (can be compared)
   */
  private isNumericRoomNumber(roomNumber: string): boolean {
    const num = this.extractRoomNumber(roomNumber);
    return !isNaN(num) && isFinite(num);
  }

  /**
   * Extract numeric part from room number
   * Example: "Room 101" → 101, "101" → 101, "A-101" → 101
   */
  private extractRoomNumber(roomNumber: string): number {
    const match = roomNumber.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : NaN;
  }

  /**
   * Check if rooms are consecutive (room numbers differ by 1)
   */
  private areConsecutive(rooms: RoomWithDetails[]): boolean {
    if (rooms.length < 2) return true;

    for (let i = 1; i < rooms.length; i++) {
      const prev = this.extractRoomNumber(rooms[i - 1].roomNumber);
      const curr = this.extractRoomNumber(rooms[i].roomNumber);
      
      if (isNaN(prev) || isNaN(curr)) return false;
      if (curr - prev !== 1) return false;
    }

    return true;
  }

  /**
   * Calculate proximity score (higher = better)
   * Used for ranking multiple proximity matches
   */
  public calculateProximityScore(match: ProximityMatch): number {
    switch (match.proximityLevel) {
      case 'adjacent':
        return 100 - (match.distance || 0); // Closer rooms = higher score
      case 'same_floor':
        return 50;
      case 'same_building':
        return 25;
      case 'none':
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Find best room for a single attendee (no splitting needed)
   */
  public findBestSingleRoom(
    targetCapacity: number,
    availableRooms: RoomWithDetails[]
  ): Room | null {
    // Prefer rooms that match capacity exactly (minimize empty beds)
    const exactMatch = availableRooms.find(r => r.capacity === targetCapacity);
    if (exactMatch) return exactMatch;

    // Find smallest room that fits
    const suitableRooms = availableRooms
      .filter(r => r.capacity >= targetCapacity)
      .sort((a, b) => a.capacity - b.capacity);

    return suitableRooms[0] || null;
  }
}
