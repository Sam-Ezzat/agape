// WHY: Unit tests for RoomingNotesClassifier
// Verifies keyword-based classification accuracy with various note formats

import { RoomingNotesClassifier } from '../RoomingNotesClassifier';
import { ClassifiedNotes } from '../../../types/auto-assignment';

describe('RoomingNotesClassifier', () => {
  let classifier: RoomingNotesClassifier;

  beforeEach(() => {
    classifier = new RoomingNotesClassifier();
  });

  describe('Empty or null notes', () => {
    it('should handle null notes', async () => {
      const result = await classifier.classify(null);
      
      expect(result.roommateRequests).toHaveLength(0);
      expect(result.healthIssues).toHaveLength(0);
      expect(result.accessibility).toBe(false);
      expect(result.raw).toBe('');
    });

    it('should handle undefined notes', async () => {
      const result = await classifier.classify(undefined);
      
      expect(result.roommateRequests).toHaveLength(0);
      expect(result.raw).toBe('');
    });

    it('should handle empty string', async () => {
      const result = await classifier.classify('');
      
      expect(result.roommateRequests).toHaveLength(0);
    });

    it('should handle whitespace only', async () => {
      const result = await classifier.classify('   \n  \t  ');
      
      expect(result.roommateRequests).toHaveLength(0);
    });
  });

  describe('Roommate requests - English', () => {
    it('should extract single roommate name', async () => {
      const result = await classifier.classify('I want to room with John Smith');
      
      expect(result.roommateRequests).toContain('John Smith');
      expect(result.roommateRequests).toHaveLength(1);
    });

    it('should extract multiple roommate names', async () => {
      const result = await classifier.classify('Roommate with John Smith, pair with Mark Johnson');
      
      expect(result.roommateRequests.length).toBeGreaterThan(0);
    });

    it('should handle "together with" pattern', async () => {
      const result = await classifier.classify('together with Michael Anderson');
      
      expect(result.roommateRequests).toContain('Michael Anderson');
    });

    it('should handle "share with" pattern', async () => {
      const result = await classifier.classify('share with David Wilson');
      
      expect(result.roommateRequests).toContain('David Wilson');
    });

    it('should not extract very short names', async () => {
      const result = await classifier.classify('with AB');
      
      expect(result.roommateRequests).toHaveLength(0);
    });

    it('should not extract very long names', async () => {
      const result = await classifier.classify('with ' + 'A'.repeat(60));
      
      expect(result.roommateRequests).toHaveLength(0);
    });
  });

  describe('Roommate requests - Arabic', () => {
    it('should extract Arabic roommate name', async () => {
      const result = await classifier.classify('مع محمد أحمد');
      
      expect(result.roommateRequests).toContain('محمد أحمد');
    });

    it('should extract multiple Arabic names', async () => {
      const result = await classifier.classify('أريد أن أكون مع أحمد علي وزميل الغرفة يوسف');
      
      expect(result.roommateRequests.length).toBeGreaterThan(0);
    });

    it('should handle mixed Arabic and English', async () => {
      const result = await classifier.classify('Roommate with أحمد محمد or with John Smith');
      
      expect(result.roommateRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Health issues', () => {
    it('should detect health mentions - English', async () => {
      const result = await classifier.classify('I have a medical condition that requires medication');
      
      expect(result.healthIssues.length).toBeGreaterThan(0);
    });

    it('should detect specific conditions', async () => {
      const result = await classifier.classify('I have asthma and diabetes');
      
      expect(result.healthIssues.length).toBeGreaterThan(0);
      expect(result.healthIssues.some(h => h.toLowerCase().includes('asthma'))).toBe(true);
      expect(result.healthIssues.some(h => h.toLowerCase().includes('diabetes'))).toBe(true);
    });

    it('should detect allergies', async () => {
      const result = await classifier.classify('I have allergies to dust');
      
      expect(result.healthIssues.length).toBeGreaterThan(0);
    });

    it('should detect health mentions - Arabic', async () => {
      const result = await classifier.classify('لدي حالة صحية تتطلب علاج');
      
      expect(result.healthIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Wheelchair needs', () => {
    it('should detect wheelchair - English', async () => {
      const result = await classifier.classify('I use a wheelchair');
      
      expect(result.wheelchair).toBe(true);
      expect(result.accessibility).toBe(true);
    });

    it('should detect wheelchair - Arabic', async () => {
      const result = await classifier.classify('أستخدم كرسي متحرك');
      
      expect(result.wheelchair).toBe(true);
      expect(result.accessibility).toBe(true);
    });

    it('should detect "wheel chair" with space', async () => {
      const result = await classifier.classify('I need wheel chair access');
      
      expect(result.wheelchair).toBe(true);
    });
  });

  describe('Elderly', () => {
    it('should detect elderly - English', async () => {
      const result = await classifier.classify('I am elderly and need special care');
      
      expect(result.elderly).toBe(true);
    });

    it('should detect senior citizen', async () => {
      const result = await classifier.classify('Senior citizen, needs easy access');
      
      expect(result.elderly).toBe(true);
    });

    it('should detect elderly - Arabic', async () => {
      const result = await classifier.classify('كبير السن ويحتاج رعاية');
      
      expect(result.elderly).toBe(true);
    });
  });

  describe('Bathroom proximity', () => {
    it('should detect bathroom proximity need', async () => {
      const result = await classifier.classify('Need room near bathroom');
      
      expect(result.nearBathroom).toBe(true);
    });

    it('should detect bathroom proximity - Arabic', async () => {
      const result = await classifier.classify('قريب من الحمام');
      
      expect(result.nearBathroom).toBe(true);
    });
  });

  describe('Elevator needs', () => {
    it('should detect elevator need - English', async () => {
      const result = await classifier.classify('Need elevator access');
      
      expect(result.nearElevator).toBe(true);
      expect(result.accessibility).toBe(true);
    });

    it('should detect elevator need - Arabic', async () => {
      const result = await classifier.classify('يحتاج مصعد');
      
      expect(result.nearElevator).toBe(true);
    });

    it('should detect lift (British English)', async () => {
      const result = await classifier.classify('Needs lift access');
      
      expect(result.nearElevator).toBe(true);
    });
  });

  describe('Family', () => {
    it('should detect family mentions - English', async () => {
      const result = await classifier.classify('Traveling with my family');
      
      expect(result.family).toBe(true);
    });

    it('should detect spouse mentions', async () => {
      const result = await classifier.classify('Coming with my wife');
      
      expect(result.family).toBe(true);
    });

    it('should detect children mentions', async () => {
      const result = await classifier.classify('Have 2 children with me');
      
      expect(result.family).toBe(true);
    });

    it('should detect family - Arabic', async () => {
      const result = await classifier.classify('مع عائلتي');
      
      expect(result.family).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should detect accessibility keyword - English', async () => {
      const result = await classifier.classify('Need accessible room');
      
      expect(result.accessibility).toBe(true);
    });

    it('should detect special needs', async () => {
      const result = await classifier.classify('Have special needs');
      
      expect(result.accessibility).toBe(true);
    });

    it('should detect accessibility - Arabic', async () => {
      const result = await classifier.classify('ذوي الاحتياجات الخاصة');
      
      expect(result.accessibility).toBe(true);
    });

    it('should mark accessibility true if wheelchair detected', async () => {
      const result = await classifier.classify('wheelchair user');
      
      expect(result.accessibility).toBe(true);
    });
  });

  describe('No preference', () => {
    it('should detect no preference - English', async () => {
      const result = await classifier.classify('No preference, any room is fine');
      
      expect(result.noPreference).toBe(true);
    });

    it('should detect "doesn\'t matter"', async () => {
      const result = await classifier.classify('Room doesn\'t matter');
      
      expect(result.noPreference).toBe(true);
    });

    it('should detect no preference - Arabic', async () => {
      const result = await classifier.classify('لا يوجد تفضيل');
      
      expect(result.noPreference).toBe(true);
    });
  });

  describe('Complex real-world examples', () => {
    it('should handle multiple categories', async () => {
      const result = await classifier.classify(
        'I want to room with John Smith. I have asthma and need elevator access. Prefer near bathroom.'
      );
      
      expect(result.roommateRequests).toContain('John Smith');
      expect(result.healthIssues.length).toBeGreaterThan(0);
      expect(result.nearElevator).toBe(true);
      expect(result.nearBathroom).toBe(true);
      expect(result.accessibility).toBe(true);
    });

    it('should handle Arabic complex notes', async () => {
      const result = await classifier.classify(
        'أريد أن أكون مع أحمد محمد. كبير السن ويحتاج مصعد. مع عائلتي.'
      );
      
      expect(result.roommateRequests.length).toBeGreaterThan(0);
      expect(result.elderly).toBe(true);
      expect(result.nearElevator).toBe(true);
      expect(result.family).toBe(true);
    });

    it('should handle mixed language notes', async () => {
      const result = await classifier.classify(
        'Roommate with محمد أحمد. Medical condition requiring medication. قريب من الحمام'
      );
      
      expect(result.roommateRequests.length).toBeGreaterThan(0);
      expect(result.healthIssues.length).toBeGreaterThan(0);
      expect(result.nearBathroom).toBe(true);
    });

    it('should preserve raw notes', async () => {
      const originalNotes = 'Room with John, need elevator';
      const result = await classifier.classify(originalNotes);
      
      expect(result.raw).toBe(originalNotes);
    });
  });

  describe('Batch classification', () => {
    it('should classify multiple notes', async () => {
      const notes = [
        'Room with John Smith',
        'I have diabetes',
        'No preference',
        null,
        'مع أحمد محمد'
      ];

      const results = await classifier.classifyBatch(notes);
      
      expect(results).toHaveLength(5);
      expect(results[0].roommateRequests).toContain('John Smith');
      expect(results[1].healthIssues.length).toBeGreaterThan(0);
      expect(results[2].noPreference).toBe(true);
      expect(results[3].roommateRequests).toHaveLength(0);
      expect(results[4].roommateRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle notes with special characters', async () => {
      const result = await classifier.classify('Room with John-Smith & family!!!');
      
      expect(result.family).toBe(true);
    });

    it('should handle very long notes', async () => {
      const longNotes = 'Room with John. '.repeat(100);
      const result = await classifier.classify(longNotes);
      
      expect(result.roommateRequests).toContain('John');
    });

    it('should remove duplicate roommate names', async () => {
      const result = await classifier.classify('Room with John Smith, roommate John Smith, with John Smith');
      
      // Should have only one "John Smith" despite multiple mentions
      const johnSmithCount = result.roommateRequests.filter(name => 
        name.toLowerCase().includes('john smith')
      ).length;
      
      expect(johnSmithCount).toBe(1);
    });
  });
});

