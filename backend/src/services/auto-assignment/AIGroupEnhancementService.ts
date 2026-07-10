// WHY: AI-powered enhancement layer for group detection
// Analyzes rooming notes semantically to discover implicit compatibility and relationships
// Complements rule-based group detection with AI understanding of context and preferences

import OpenAI from 'openai';
import { Attendee } from '@prisma/client';
import { AttendeeGroup, ClassifiedNotes, GroupType } from '@/types/auto-assignment';
import logger from '@/utils/logger';

/**
 * Configuration for AI group enhancement
 */
interface AIEnhancementConfig {
  useAI?: boolean;              // Enable/disable AI enhancement
  openAIModel?: string;         // OpenAI model to use
  timeout?: number;             // API timeout in milliseconds
  maxAttendeesPerBatch?: number; // Max attendees to analyze in one API call
  minCompatibilityScore?: number; // Minimum score to suggest new group (0-100)
}

/**
 * AI-suggested group enhancement
 */
interface AIGroupSuggestion {
  attendeeIds: string[];
  groupType: GroupType;
  compatibilityScore: number; // 0-100
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  relationshipStrength: 'strong' | 'moderate' | 'weak';
}

/**
 * AI Group Enhancement Service
 * 
 * Provides semantic understanding of rooming preferences using AI:
 * - Detects implicit compatibility from notes
 * - Identifies relationship strengths
 * - Suggests grouping optimizations
 * - Reorders groups by preference intensity
 * 
 * Works alongside rule-based GroupDetectionService as an enhancement layer
 */
export class AIGroupEnhancementService {
  private openai: OpenAI | null = null;
  private config: AIEnhancementConfig;

  constructor(config: AIEnhancementConfig = {}) {
    // Check if AI is globally enabled via environment variable
    const aiEnabled = process.env.OPENAI_ENABLED !== 'false';
    
    this.config = {
      useAI: aiEnabled && config.useAI !== false,
      openAIModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      timeout: 30000, // Longer timeout for complex analysis
      maxAttendeesPerBatch: 50,
      minCompatibilityScore: 60,
      ...config
    };

    // Initialize OpenAI if API key available and AI enabled
    if (this.config.useAI && process.env.OPENAI_API_KEY && aiEnabled) {
      try {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: this.config.timeout
        });
      } catch (error) {
        logger.warn('Failed to initialize OpenAI for group enhancement:', error);
        this.openai = null;
      }
    }
  }

  /**
   * Enhance existing groups with AI analysis
   * 
   * @param attendees - All attendees
   * @param classifications - Classified rooming notes for each attendee
   * @param existingGroups - Groups detected by rule-based system
   * @returns Enhanced groups with AI suggestions merged
   */
  async enhanceGroups(
    attendees: Attendee[],
    classifications: Map<string, ClassifiedNotes>,
    existingGroups: AttendeeGroup[]
  ): Promise<AttendeeGroup[]> {
    // If AI unavailable or disabled, return existing groups unchanged
    if (!this.openai || !this.config.useAI) {
      logger.info('AI group enhancement skipped (AI unavailable or disabled)');
      return existingGroups;
    }

    try {
      logger.info(`Starting AI group enhancement for ${attendees.length} attendees`);
      
      // Split into batches if too many attendees
      const batches = this.createBatches(attendees, this.config.maxAttendeesPerBatch!);
      const allSuggestions: AIGroupSuggestion[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        logger.info(`Processing batch ${i + 1}/${batches.length} (${batch.length} attendees)`);
        
        const batchSuggestions = await this.analyzeCompatibilityBatch(
          batch,
          classifications,
          existingGroups
        );
        
        allSuggestions.push(...batchSuggestions);
      }

      // Merge AI suggestions with existing groups
      const enhancedGroups = this.mergeAISuggestions(
        attendees,
        existingGroups,
        allSuggestions,
        classifications
      );

      logger.info(`AI enhancement complete: ${allSuggestions.length} suggestions, ${enhancedGroups.length} final groups`);
      return enhancedGroups;

    } catch (error) {
      logger.error('AI group enhancement failed:', error);
      // On error, return existing groups (fail gracefully)
      return existingGroups;
    }
  }

  /**
   * Analyze compatibility for a batch of attendees using AI
   */
  private async analyzeCompatibilityBatch(
    attendees: Attendee[],
    classifications: Map<string, ClassifiedNotes>,
    existingGroups: AttendeeGroup[]
  ): Promise<AIGroupSuggestion[]> {
    if (!this.openai) return [];

    const prompt = this.buildAnalysisPrompt(attendees, classifications, existingGroups);

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.config.openAIModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Some creativity but mostly deterministic
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) return [];

      const parsed = JSON.parse(responseText);
      return this.parseAIResponse(parsed);

    } catch (error: any) {
      // Handle rate limiting specifically
      if (error?.status === 429) {
        logger.error('OpenAI rate limit exceeded. Please check your API key and billing plan.', {
          error: error?.message || 'Rate limit error',
          code: error?.code,
          type: error?.type
        });
      } else {
        logger.error('AI API call failed in compatibility analysis:', error?.message || error);
      }
      return [];
    }
  }

  /**
   * Build system prompt explaining the assignment logic
   */
  private getSystemPrompt(): string {
    return `You are an intelligent roommate matching assistant for a conference accommodation system.

Your job is to analyze attendee rooming preferences and suggest optimal groupings based on:

## ASSIGNMENT RULES (How System Scores Rooms):

### Hard Constraints (Must Pass):
1. Room capacity not exceeded
2. Gender matches room occupants (same gender per room)
3. Room type matches requirements (VIP, FAMILY, GENERAL)
4. Building is enabled for assignments
5. Room is available
6. **CRITICAL**: Same gender in same building (buildings are gender-segregated)

### Soft Constraints (Weighted Scoring):
1. **Same Church (25% weight)**: Higher score if roommates from same church
2. **Same Governorate (15% weight)**: Higher score if from same region
3. **Similar Age (20% weight)**: Closer ages get higher scores
4. **Minimize Empty Beds (15% weight)**: Prefer fuller rooms
5. **Same Floor (15% weight)**: Bonus if church members on same floor
6. **Leader Proximity (10% weight)**: Near leaders/pastors if applicable

## YOUR TASK:

Analyze rooming notes to find:
1. **Implicit compatibility** - shared preferences, personality matches
2. **Relationship strength** - strong vs casual preferences
3. **Context understanding** - travel groups, church affiliations, special needs
4. **Better groupings** - suggest groups that align with scoring rules

Focus on factors that will produce HIGH SCORES in the system:
- Same church members together
- Similar ages
- Shared interests/personalities
- Explicit relationship mentions

Return valid JSON only, no markdown.`;
  }

  /**
   * Build analysis prompt with attendee data and assignment context
   */
  private buildAnalysisPrompt(
    attendees: Attendee[],
    classifications: Map<string, ClassifiedNotes>,
    existingGroups: AttendeeGroup[]
  ): string {
    // Prepare attendee summaries
    const attendeeSummaries = attendees.map(a => {
      const classification = classifications.get(a.id);
      return {
        id: a.id,
        name: a.fullName,
        age: a.age,
        gender: a.gender,
        church: a.church,
        governorate: a.governorate,
        role: a.conferenceRole,
        roomingNotes: a.roomingNotes || 'No notes',
        classifiedNotes: classification ? {
          roommateRequests: classification.roommateRequests,
          healthIssues: classification.healthIssues,
          accessibility: classification.accessibility,
          family: classification.family,
          other: classification.other
        } : null
      };
    });

    // Prepare existing groups summary
    const existingGroupsSummary = existingGroups
      .filter(g => g.type !== GroupType.INDIVIDUAL)
      .map(g => ({
        type: g.type,
        memberCount: g.members.length,
        memberNames: g.members.map(m => m.fullName)
      }));

    return `# Conference Roommate Matching Analysis

## ATTENDEES (${attendees.length} total):
${JSON.stringify(attendeeSummaries, null, 2)}

## EXISTING RULE-BASED GROUPS (${existingGroupsSummary.length} groups):
${JSON.stringify(existingGroupsSummary, null, 2)}

## YOUR ANALYSIS TASK:

Analyze the rooming notes and attendee data to suggest optimal groupings.

**IMPORTANT CONSIDERATIONS:**
1. **Gender Segregation**: Only suggest groups with same gender (buildings are gender-segregated)
2. **Same Church Priority**: Church members together get 25% weight - highly valuable
3. **Age Similarity**: Similar ages get 20% weight - important factor
4. **Explicit Requests**: Strong preference language ("MUST", "need to", "best friend") = high priority
5. **Implicit Compatibility**: Shared interests, personalities, preferences
6. **Context**: Travel groups, church groups, special needs

**SCORING ALIGNMENT:**
- Groups from same church → High system scores
- Similar ages → High system scores
- Shared governorate → Medium system scores
- Accessibility needs matched → High priority

**OUTPUT FORMAT (JSON only):**
{
  "suggestions": [
    {
      "attendeeIds": ["id1", "id2", "id3"],
      "groupType": "roommate" | "church" | "family" | "compatibility",
      "compatibilityScore": 0-100,
      "reasoning": "Why these people should be grouped (reference specific notes/attributes)",
      "confidence": "high" | "medium" | "low",
      "relationshipStrength": "strong" | "moderate" | "weak",
      "keyFactors": ["same_church", "similar_age", "explicit_request", "shared_interests", etc.]
    }
  ]
}

**GUIDELINES:**
- Only suggest groups of 2-4 people (typical room capacity)
- Minimum compatibility score: ${this.config.minCompatibilityScore}
- High confidence = explicit requests or strong indicators
- Medium confidence = implicit compatibility or context clues
- Low confidence = weak signals or assumptions
- Prioritize groups that will score high in system rules
- Include reasoning that references specific rooming notes or attributes

Analyze and respond with JSON only.`;
  }

  /**
   * Parse AI response into structured suggestions
   */
  private parseAIResponse(response: any): AIGroupSuggestion[] {
    const suggestions: AIGroupSuggestion[] = [];

    if (!response.suggestions || !Array.isArray(response.suggestions)) {
      logger.warn('AI response missing suggestions array');
      return suggestions;
    }

    for (const suggestion of response.suggestions) {
      try {
        // Validate suggestion structure
        if (!suggestion.attendeeIds || !Array.isArray(suggestion.attendeeIds) || 
            suggestion.attendeeIds.length < 2) {
          continue;
        }

        if (!suggestion.compatibilityScore || suggestion.compatibilityScore < this.config.minCompatibilityScore!) {
          continue;
        }

        suggestions.push({
          attendeeIds: suggestion.attendeeIds,
          groupType: this.mapGroupType(suggestion.groupType),
          compatibilityScore: Math.min(100, Math.max(0, suggestion.compatibilityScore)),
          reasoning: suggestion.reasoning || 'AI-detected compatibility',
          confidence: ['high', 'medium', 'low'].includes(suggestion.confidence) 
            ? suggestion.confidence 
            : 'medium',
          relationshipStrength: ['strong', 'moderate', 'weak'].includes(suggestion.relationshipStrength)
            ? suggestion.relationshipStrength
            : 'moderate'
        });
      } catch (error) {
        logger.warn('Failed to parse AI suggestion:', error);
      }
    }

    return suggestions;
  }

  /**
   * Map AI group type string to GroupType enum
   */
  private mapGroupType(type: string): GroupType {
    const typeMap: Record<string, GroupType> = {
      'roommate': GroupType.ROOMMATE,
      'family': GroupType.FAMILY,
      'church': GroupType.CHURCH,
      'compatibility': GroupType.CHURCH, // Use CHURCH as generic group type
      'governorate': GroupType.GOVERNORATE
    };

    return typeMap[type?.toLowerCase()] || GroupType.CHURCH;
  }

  /**
   * Merge AI suggestions with existing groups
   */
  private mergeAISuggestions(
    allAttendees: Attendee[],
    existingGroups: AttendeeGroup[],
    aiSuggestions: AIGroupSuggestion[],
    classifications: Map<string, ClassifiedNotes>
  ): AttendeeGroup[] {
    const attendeeMap = new Map(allAttendees.map(a => [a.id, a]));
    const enhancedGroups: AttendeeGroup[] = [...existingGroups];
    const assignedAttendees = new Set<string>();

    // Track which attendees are already in existing groups
    for (const group of existingGroups) {
      for (const member of group.members) {
        assignedAttendees.add(member.id);
      }
    }

    // Sort AI suggestions by compatibility score (high to low)
    const sortedSuggestions = [...aiSuggestions].sort(
      (a, b) => b.compatibilityScore - a.compatibilityScore
    );

    // Process each AI suggestion
    for (const suggestion of sortedSuggestions) {
      // Skip if any member already assigned
      const hasAssigned = suggestion.attendeeIds.some(id => assignedAttendees.has(id));
      if (hasAssigned) continue;

      // Get attendee objects
      const members = suggestion.attendeeIds
        .map(id => attendeeMap.get(id))
        .filter((a): a is Attendee => a !== undefined);

      if (members.length < 2) continue;

      // Validate gender consistency
      const genders = new Set(members.map(m => m.gender));
      if (genders.size > 1) {
        logger.warn(`Skipping AI suggestion: mixed genders in group (${Array.from(genders).join(', ')})`);
        continue;
      }

      // Create new group from AI suggestion
      const newGroup: AttendeeGroup = {
        id: `ai-group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: suggestion.groupType,
        members,
        priority: this.calculatePriority(suggestion, members),
        constraints: this.extractConstraints(members, classifications),
        minRoomCount: 1,
        metadata: {
          source: 'ai_enhancement',
          compatibilityScore: suggestion.compatibilityScore,
          confidence: suggestion.confidence,
          relationshipStrength: suggestion.relationshipStrength,
          reasoning: suggestion.reasoning
        }
      };

      enhancedGroups.push(newGroup);

      // Mark members as assigned
      for (const member of members) {
        assignedAttendees.add(member.id);
      }

      logger.info(`Added AI-suggested group: ${members.map(m => m.fullName).join(', ')} (score: ${suggestion.compatibilityScore})`);
    }

    return enhancedGroups;
  }

  /**
   * Calculate priority for AI-suggested group
   */
  private calculatePriority(suggestion: AIGroupSuggestion, members: Attendee[]): number {
    let priority = 5; // Base priority

    // Boost based on relationship strength
    if (suggestion.relationshipStrength === 'strong') priority += 3;
    else if (suggestion.relationshipStrength === 'moderate') priority += 1;

    // Boost based on confidence
    if (suggestion.confidence === 'high') priority += 2;
    else if (suggestion.confidence === 'medium') priority += 1;

    // Boost based on compatibility score
    if (suggestion.compatibilityScore >= 90) priority += 2;
    else if (suggestion.compatibilityScore >= 75) priority += 1;

    // Boost for VIPs or special roles
    const hasVIP = members.some(m => m.conferenceRole === 'VIP' || m.conferenceRole === 'LEADER');
    if (hasVIP) priority += 2;

    return priority;
  }

  /**
   * Extract constraints from group members' classifications
   */
  private extractConstraints(
    members: Attendee[],
    classifications: Map<string, ClassifiedNotes>
  ): any {
    let requiresAccessibility = false;
    let requiresGroundFloor = false;
    let requiredRoomType: 'GENERAL' | 'VIP' | 'FAMILY' | null = null;

    for (const member of members) {
      const classification = classifications.get(member.id);
      if (!classification) continue;

      if (classification.accessibility || classification.wheelchair || classification.elderly) {
        requiresAccessibility = true;
      }

      if (classification.wheelchair || classification.nearElevator) {
        requiresGroundFloor = true;
      }

      if (member.conferenceRole === 'VIP') {
        requiredRoomType = 'VIP';
      } else if (classification.family && !requiredRoomType) {
        requiredRoomType = 'FAMILY';
      }
    }

    return {
      requiresAccessibility,
      requiresGroundFloor,
      requiredRoomType
    };
  }

  /**
   * Split attendees into batches for API processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Check if AI enhancement is available
   */
  isAIAvailable(): boolean {
    return this.openai !== null && this.config.useAI === true;
  }
}

/**
 * Create default AI enhancement service
 */
export function createDefaultAIEnhancementService(): AIGroupEnhancementService {
  return new AIGroupEnhancementService({
    useAI: Boolean(process.env.OPENAI_API_KEY),
    minCompatibilityScore: 60
  });
}
