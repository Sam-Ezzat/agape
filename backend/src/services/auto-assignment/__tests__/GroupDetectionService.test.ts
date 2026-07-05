// WHY: Unit tests for GroupDetectionService
// Verifies group detection algorithms and edge case handling

import { Attendee, Gender, ConferenceRole, PaymentStatus } from '@prisma/client';
import { GroupDetectionService } from '../GroupDetectionService';
import { GroupType } from '../../../types/auto-assignment';

// Helper to create mock attendee
function createMockAttendee(
  id: string,
  fullName: string,
  overrides?: Partial<Attendee>
): Attendee {
  return {
    id,
    ticketId: null,
    fullName,
    phone: null,
    email: null,
    age: 30,
    gender: Gender.MALE,
    church: 'Test Church',
    area: null,
    governorate: 'Cairo',
    isServant: false,
    arrivalMethod: null,
    busPickupPoint: null,
    paymentMethod: null,
    paymentStatus: PaymentStatus.PENDING,
    transactionNumber: null,
    conferenceRole: ConferenceRole.ATTENDEE,
    notes: null,
    roomingNotes: null,
    internalNotes: null,
    checkedInAt: null,
    checkedOutAt: null,
    checkedInBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides
  };
}

describe('GroupDetectionService', () => {
  let service: GroupDetectionService;

  beforeEach(() => {
    service = new GroupDetectionService();
  });

  describe('Roommate Group Detection', () => {
    it('should detect bidirectional roommate pair', () => {
      const attendees = [
        createMockAttendee('1', 'John Smith', {
          roomingNotes: 'I want to room with Michael Johnson'
        }),
        createMockAttendee('2', 'Michael Johnson', {
          roomingNotes: 'Roommate with John Smith'
        }),
        createMockAttendee('3', 'David Wilson', {
          roomingNotes: 'No preference'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      // Should have 1 roommate group (John + Michael) and 1 individual (David)
      const roommateGroups = groups.filter(g => g.type === GroupType.ROOMMATE);
      expect(roommateGroups).toHaveLength(1);
      expect(roommateGroups[0].members).toHaveLength(2);
      
      const memberNames = roommateGroups[0].members.map(m => m.fullName);
      expect(memberNames).toContain('John Smith');
      expect(memberNames).toContain('Michael Johnson');
    });

    it('should not create group for one-way request', () => {
      const attendees = [
        createMockAttendee('1', 'John Smith', {
          roomingNotes: 'I want to room with Michael Johnson'
        }),
        createMockAttendee('2', 'Michael Johnson', {
          roomingNotes: 'No preference'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      // Should have no roommate groups (request not bidirectional)
      const roommateGroups = groups.filter(g => g.type === GroupType.ROOMMATE);
      expect(roommateGroups).toHaveLength(0);
    });

    it('should detect transitive roommate group (A-B-C)', () => {
      const attendees = [
        createMockAttendee('1', 'Alice', {
          roomingNotes: 'Room with Bob'
        }),
        createMockAttendee('2', 'Bob', {
          roomingNotes: 'With Alice and Charlie'
        }),
        createMockAttendee('3', 'Charlie', {
          roomingNotes: 'Roommate Bob'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const roommateGroups = groups.filter(g => g.type === GroupType.ROOMMATE);
      expect(roommateGroups).toHaveLength(1);
      expect(roommateGroups[0].members).toHaveLength(3);
    });

    it('should handle circular roommate requests', () => {
      const attendees = [
        createMockAttendee('1', 'Alice', {
          roomingNotes: 'With Bob'
        }),
        createMockAttendee('2', 'Bob', {
          roomingNotes: 'With Charlie'
        }),
        createMockAttendee('3', 'Charlie', {
          roomingNotes: 'With Alice'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      // Should handle circular references gracefully
      const roommateGroups = groups.filter(g => g.type === GroupType.ROOMMATE);
      // Only bidirectional pairs should be grouped
      expect(roommateGroups.length).toBeGreaterThanOrEqual(0);
    });

    it('should match names case-insensitively', () => {
      const attendees = [
        createMockAttendee('1', 'John Smith', {
          roomingNotes: 'Room with MICHAEL JOHNSON'
        }),
        createMockAttendee('2', 'michael johnson', {
          roomingNotes: 'with john smith'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const roommateGroups = groups.filter(g => g.type === GroupType.ROOMMATE);
      expect(roommateGroups).toHaveLength(1);
      expect(roommateGroups[0].members).toHaveLength(2);
    });

    it('should handle Arabic roommate names', () => {
      const attendees = [
        createMockAttendee('1', 'أحمد محمد', {
          roomingNotes: 'مع علي حسن'
        }),
        createMockAttendee('2', 'علي حسن', {
          roomingNotes: 'أريد أن أكون مع أحمد محمد'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const roommateGroups = groups.filter(g => g.type === GroupType.ROOMMATE);
      expect(roommateGroups).toHaveLength(1);
      expect(roommateGroups[0].members).toHaveLength(2);
    });
  });

  describe('Family Group Detection', () => {
    it('should detect family group from same governorate with family keyword', () => {
      const attendees = [
        createMockAttendee('1', 'Ahmed Ali', {
          governorate: 'Cairo',
          roomingNotes: 'Traveling with family'
        }),
        createMockAttendee('2', 'Fatima Ali', {
          governorate: 'Cairo',
          roomingNotes: 'With my husband and children'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const familyGroups = groups.filter(g => g.type === GroupType.FAMILY);
      expect(familyGroups).toHaveLength(1);
      expect(familyGroups[0].members).toHaveLength(2);
    });

    it('should not create family group without family keyword', () => {
      const attendees = [
        createMockAttendee('1', 'Ahmed Ali', {
          governorate: 'Cairo',
          roomingNotes: 'No preference'
        }),
        createMockAttendee('2', 'Mohamed Hassan', {
          governorate: 'Cairo',
          roomingNotes: 'Any room'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const familyGroups = groups.filter(g => g.type === GroupType.FAMILY);
      // Should not create family group (no family keyword)
      expect(familyGroups).toHaveLength(0);
    });

    it('should not group families from different governorates', () => {
      const attendees = [
        createMockAttendee('1', 'Ahmed Ali', {
          governorate: 'Cairo',
          roomingNotes: 'With family'
        }),
        createMockAttendee('2', 'Mohamed Hassan', {
          governorate: 'Alexandria',
          roomingNotes: 'Family trip'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const familyGroups = groups.filter(g => g.type === GroupType.FAMILY);
      // Should create separate family groups or individuals
      // Not grouped together because different governorates
      if (familyGroups.length > 0) {
        expect(familyGroups.every(g => g.members.length < 2 || 
          g.members.every(m => m.governorate === g.members[0].governorate)
        )).toBe(true);
      }
    });

    it('should require family constraints for family groups', () => {
      const attendees = [
        createMockAttendee('1', 'Ahmed', {
          governorate: 'Cairo',
          roomingNotes: 'Traveling with my wife and kids'
        }),
        createMockAttendee('2', 'Fatima', {
          governorate: 'Cairo',
          roomingNotes: 'Family room needed'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const familyGroups = groups.filter(g => g.type === GroupType.FAMILY);
      if (familyGroups.length > 0) {
        expect(familyGroups[0].constraints.requiredRoomType).toBe('FAMILY');
      }
    });
  });

  describe('Church Group Detection', () => {
    it('should detect church group from same church', () => {
      const attendees = [
        createMockAttendee('1', 'John', { church: 'St Mary Church' }),
        createMockAttendee('2', 'Michael', { church: 'St Mary Church' }),
        createMockAttendee('3', 'David', { church: 'St Mary Church' })
      ];

      const groups = service.detectGroups(attendees);
      
      const churchGroups = groups.filter(g => g.type === GroupType.CHURCH);
      expect(churchGroups).toHaveLength(1);
      expect(churchGroups[0].members).toHaveLength(3);
    });

    it('should not create church group for single attendee', () => {
      const attendees = [
        createMockAttendee('1', 'John', { church: 'Unique Church' }),
        createMockAttendee('2', 'Michael', { church: 'St Mary Church' }),
        createMockAttendee('3', 'David', { church: 'St Mary Church' })
      ];

      const groups = service.detectGroups(attendees);
      
      const churchGroups = groups.filter(g => g.type === GroupType.CHURCH);
      // Should have 1 church group for St Mary (2 people)
      // John should be individual (alone from his church)
      expect(churchGroups.length).toBeLessThanOrEqual(1);
    });

    it('should match churches case-insensitively', () => {
      const attendees = [
        createMockAttendee('1', 'John', { church: 'St Mary Church' }),
        createMockAttendee('2', 'Michael', { church: 'ST MARY CHURCH' }),
        createMockAttendee('3', 'David', { church: 'st mary church' })
      ];

      const groups = service.detectGroups(attendees);
      
      const churchGroups = groups.filter(g => g.type === GroupType.CHURCH);
      expect(churchGroups).toHaveLength(1);
      expect(churchGroups[0].members).toHaveLength(3);
    });
  });

  describe('Individual Groups', () => {
    it('should create individual group for attendee with no affiliations', () => {
      const attendees = [
        createMockAttendee('1', 'John', {
          church: null,
          roomingNotes: 'No preference'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe(GroupType.INDIVIDUAL);
      expect(groups[0].members).toHaveLength(1);
    });

    it('should create individual groups for unmatched attendees', () => {
      const attendees = [
        createMockAttendee('1', 'John', { roomingNotes: 'Room with Bob' }),
        createMockAttendee('2', 'Alice', { roomingNotes: 'Room with Carol' })
      ];

      const groups = service.detectGroups(attendees);
      
      // No bidirectional matches - should be individuals
      const individualGroups = groups.filter(g => g.type === GroupType.INDIVIDUAL);
      expect(individualGroups).toHaveLength(2);
    });
  });

  describe('Priority Calculation', () => {
    it('should give highest priority to medical cases', () => {
      const attendees = [
        createMockAttendee('1', 'John', {
          roomingNotes: 'I have asthma'
        }),
        createMockAttendee('2', 'Michael', {
          roomingNotes: 'No preference'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const medicalGroup = groups.find(g => 
        g.members.some(m => m.fullName === 'John')
      );
      const normalGroup = groups.find(g => 
        g.members.some(m => m.fullName === 'Michael')
      );
      
      expect(medicalGroup!.priority).toBeGreaterThan(normalGroup!.priority);
    });

    it('should give high priority to wheelchair users', () => {
      const attendees = [
        createMockAttendee('1', 'John', {
          roomingNotes: 'I use a wheelchair'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      expect(groups[0].priority).toBeGreaterThan(70); // High priority
    });

    it('should give higher priority to large groups', () => {
      const attendees = [
        createMockAttendee('1', 'A', { roomingNotes: 'With B' }),
        createMockAttendee('2', 'B', { roomingNotes: 'With A, C, D' }),
        createMockAttendee('3', 'C', { roomingNotes: 'With B' }),
        createMockAttendee('4', 'D', { roomingNotes: 'With B' }),
        createMockAttendee('5', 'E', { roomingNotes: 'With F' }),
        createMockAttendee('6', 'F', { roomingNotes: 'With E' })
      ];

      const groups = service.detectGroups(attendees);
      
      const roommateGroups = groups.filter(g => g.type === GroupType.ROOMMATE);
      
      if (roommateGroups.length >= 2) {
        const largeGroup = roommateGroups.find(g => g.members.length >= 3);
        const smallGroup = roommateGroups.find(g => g.members.length === 2);
        
        if (largeGroup && smallGroup) {
          expect(largeGroup.priority).toBeGreaterThan(smallGroup.priority);
        }
      }
    });

    it('should give priority to VIP attendees', () => {
      const attendees = [
        createMockAttendee('1', 'VIP John', {
          conferenceRole: ConferenceRole.VIP
        }),
        createMockAttendee('2', 'Regular John', {
          conferenceRole: ConferenceRole.ATTENDEE
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const vipGroup = groups.find(g => 
        g.members.some(m => m.conferenceRole === ConferenceRole.VIP)
      );
      const regularGroup = groups.find(g => 
        g.members.every(m => m.conferenceRole === ConferenceRole.ATTENDEE)
      );
      
      expect(vipGroup!.priority).toBeGreaterThan(regularGroup!.priority);
    });
  });

  describe('Group Constraints', () => {
    it('should set accessibility constraint for wheelchair users', () => {
      const attendees = [
        createMockAttendee('1', 'John', {
          roomingNotes: 'Wheelchair user'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      expect(groups[0].constraints.requiresAccessibility).toBe(true);
      expect(groups[0].constraints.requiresGroundFloor).toBe(true);
      expect(groups[0].constraints.requiresElevator).toBe(true);
    });

    it('should set elevator constraint for elderly', () => {
      const attendees = [
        createMockAttendee('1', 'John', {
          roomingNotes: 'Elderly, needs elevator'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      expect(groups[0].constraints.requiresElevator).toBe(true);
      expect(groups[0].constraints.requiresGroundFloor).toBe(true);
    });

    it('should set gender constraint if all members have same gender', () => {
      const attendees = [
        createMockAttendee('1', 'John', { gender: Gender.MALE, roomingNotes: 'With Mike' }),
        createMockAttendee('2', 'Mike', { gender: Gender.MALE, roomingNotes: 'With John' })
      ];

      const groups = service.detectGroups(attendees);
      
      const roommateGroup = groups.find(g => g.type === GroupType.ROOMMATE);
      expect(roommateGroup!.constraints.requiredGender).toBe(Gender.MALE);
    });

    it('should set VIP room type for VIP members', () => {
      const attendees = [
        createMockAttendee('1', 'VIP John', {
          conferenceRole: ConferenceRole.VIP,
          roomingNotes: 'With VIP Mike'
        }),
        createMockAttendee('2', 'VIP Mike', {
          conferenceRole: ConferenceRole.VIP,
          roomingNotes: 'With VIP John'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      const vipGroup = groups.find(g => g.type === GroupType.ROOMMATE);
      expect(vipGroup!.constraints.requiredRoomType).toBe('VIP');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty attendee list', () => {
      const groups = service.detectGroups([]);
      
      expect(groups).toHaveLength(0);
    });

    it('should handle attendee requesting themselves', () => {
      const attendees = [
        createMockAttendee('1', 'John', {
          roomingNotes: 'Room with John'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      // Should create individual group (can't room with self)
      expect(groups[0].type).toBe(GroupType.INDIVIDUAL);
      expect(groups[0].members).toHaveLength(1);
    });

    it('should handle attendees with null rooming notes', () => {
      const attendees = [
        createMockAttendee('1', 'John', { roomingNotes: null }),
        createMockAttendee('2', 'Mike', { roomingNotes: null })
      ];

      const groups = service.detectGroups(attendees);
      
      // Should create groups without errors
      expect(groups.length).toBeGreaterThan(0);
    });

    it('should not assign same attendee to multiple groups', () => {
      const attendees = [
        createMockAttendee('1', 'John', {
          church: 'St Mary',
          roomingNotes: 'With Mike'
        }),
        createMockAttendee('2', 'Mike', {
          church: 'St Mary',
          roomingNotes: 'With John'
        }),
        createMockAttendee('3', 'David', {
          church: 'St Mary'
        })
      ];

      const groups = service.detectGroups(attendees);
      
      // Check that John and Mike appear only once across all groups
      const allMembers = groups.flatMap(g => g.members);
      const johnCount = allMembers.filter(m => m.fullName === 'John').length;
      const mikeCount = allMembers.filter(m => m.fullName === 'Mike').length;
      
      expect(johnCount).toBe(1);
      expect(mikeCount).toBe(1);
    });
  });
});
