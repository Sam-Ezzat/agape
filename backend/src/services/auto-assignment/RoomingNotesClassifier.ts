// WHY: AI-powered rooming notes classifier with keyword fallback
// Uses OpenAI GPT to intelligently extract structured information from free-text notes
// Falls back to keyword-based classification if AI is unavailable or disabled

import OpenAI from 'openai';
import { ClassifiedNotes } from '../../types/auto-assignment';

/**
 * Configuration for the classifier
 */
interface ClassifierConfig {
  useAI?: boolean;           // Whether to use AI classification (default: true if API key available)
  openAIModel?: string;      // OpenAI model to use (default: gpt-4o-mini)
  timeout?: number;          // API timeout in milliseconds (default: 10000)
  fallbackToKeywords?: boolean; // Whether to fallback to keywords on AI failure (default: true)
}

/**
 * Rooming Notes Classifier
 * 
 * Extracts structured information from free-text rooming notes using:
 * 1. OpenAI GPT for intelligent semantic understanding (primary)
 * 2. Keyword-based regex patterns (fallback)
 * 
 * Supports Arabic and English text with mixed language detection
 */
export class RoomingNotesClassifier {
  private openai: OpenAI | null = null;
  private config: ClassifierConfig;
  private lastApiCall: number = 0;
  private minDelayBetweenCalls: number = 100; // 100ms between API calls
  private rateLimitedUntil: number = 0; // Timestamp when rate limit expires
  private classificationCache: Map<string, ClassifiedNotes> = new Map(); // Cache results

  constructor(config: ClassifierConfig = {}) {
    // Check if AI is globally enabled via environment variable
    const aiEnabled = process.env.OPENAI_ENABLED !== 'false';
    
    this.config = {
      useAI: aiEnabled && config.useAI !== false,
      openAIModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      timeout: 10000,
      fallbackToKeywords: true,
      ...config
    };

    // Initialize OpenAI if API key is available and AI is enabled
    if (this.config.useAI && process.env.OPENAI_API_KEY && aiEnabled) {
      try {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: this.config.timeout
        });
      } catch (error) {
        console.warn('Failed to initialize OpenAI client, falling back to keyword classification:', error);
        this.openai = null;
      }
    }
  }

  /**
   * Classify rooming notes into structured categories
   * 
   * @param roomingNotes - Free-text rooming notes (Arabic, English, or mixed)
   * @returns Structured classification result
   */
  async classify(roomingNotes: string | null | undefined): Promise<ClassifiedNotes> {
    // Handle empty notes
    if (!roomingNotes || roomingNotes.trim().length === 0) {
      return this.createEmptyResult(roomingNotes || '');
    }

    const trimmedNotes = roomingNotes.trim();

    // Check cache first
    const cacheKey = trimmedNotes.toLowerCase();
    if (this.classificationCache.has(cacheKey)) {
      return this.classificationCache.get(cacheKey)!;
    }

    // Skip AI if we're currently rate limited
    const now = Date.now();
    if (now < this.rateLimitedUntil) {
      console.warn(`Skipping AI classification (rate limited until ${new Date(this.rateLimitedUntil).toISOString()})`);
      const keywordResult = this.classifyWithKeywords(trimmedNotes);
      this.classificationCache.set(cacheKey, keywordResult);
      return keywordResult;
    }

    // Try AI classification first
    if (this.openai && this.config.useAI) {
      try {
        const aiResult = await this.classifyWithAI(trimmedNotes);
        if (aiResult) {
          this.classificationCache.set(cacheKey, aiResult);
          return aiResult;
        }
      } catch (error: any) {
        // Handle rate limiting specifically
        if (error?.status === 429) {
          console.warn('OpenAI rate limit hit, switching to keyword classification for 60 seconds');
          this.rateLimitedUntil = Date.now() + 60000; // Wait 60 seconds before trying AI again
        } else {
          console.warn('AI classification failed, falling back to keywords:', error?.message || error);
        }
      }
    }

    // Fallback to keyword-based classification
    if (this.config.fallbackToKeywords) {
      const keywordResult = this.classifyWithKeywords(trimmedNotes);
      this.classificationCache.set(cacheKey, keywordResult);
      return keywordResult;
    }

    // No classification method available
    return this.createEmptyResult(trimmedNotes);
  }

  /**
   * Classify using OpenAI GPT
   */
  private async classifyWithAI(notes: string): Promise<ClassifiedNotes | null> {
    if (!this.openai) return null;

    // Rate limiting: wait before making next API call
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < this.minDelayBetweenCalls) {
      await new Promise(resolve => setTimeout(resolve, this.minDelayBetweenCalls - timeSinceLastCall));
    }
    this.lastApiCall = Date.now();

    const prompt = `You are analyzing rooming notes for a conference accommodation system. Extract structured information from the following notes (may be in Arabic, English, or mixed).

Rooming Notes: "${notes}"

Extract the following information and respond ONLY with a valid JSON object (no markdown, no explanations):

{
  "roommateRequests": [array of requested roommate names],
  "healthIssues": [array of health conditions mentioned],
  "accessibility": boolean (true if accessibility features needed),
  "wheelchair": boolean (true if wheelchair user),
  "elderly": boolean (true if elderly person needing special accommodation),
  "nearBathroom": boolean (true if prefers room near bathroom),
  "nearElevator": boolean (true if prefers room near elevator),
  "family": boolean (true if traveling with family),
  "noPreference": boolean (true if explicitly states no preferences),
  "other": [array of any other important notes not covered above]
}

Guidelines:
- For roommateRequests: Extract names mentioned with context like "with", "roommate", "زميل الغرفة", "مع"
- For healthIssues: Look for medical conditions, allergies, special needs
- Be generous with accessibility flags - if any accessibility need is mentioned, set the relevant flag
- If notes say "لا يوجد" or "none" or "no preference", set noPreference to true
- Put anything that doesn't fit other categories in "other" array`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.config.openAIModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that extracts structured information from text. Always respond with valid JSON only, no markdown formatting.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent, deterministic results
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) return null;

      // Parse the JSON response
      const parsed = JSON.parse(responseText);

      return {
        roommateRequests: Array.isArray(parsed.roommateRequests) ? parsed.roommateRequests : [],
        healthIssues: Array.isArray(parsed.healthIssues) ? parsed.healthIssues : [],
        accessibility: Boolean(parsed.accessibility),
        wheelchair: Boolean(parsed.wheelchair),
        elderly: Boolean(parsed.elderly),
        nearBathroom: Boolean(parsed.nearBathroom),
        nearElevator: Boolean(parsed.nearElevator),
        family: Boolean(parsed.family),
        noPreference: Boolean(parsed.noPreference),
        other: Array.isArray(parsed.other) ? parsed.other : [],
        raw: notes
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      return null;
    }
  }

  /**
   * Classify using keyword-based pattern matching (fallback)
   */
  private classifyWithKeywords(notes: string): ClassifiedNotes {
    const lowerNotes = notes.toLowerCase();

    // Roommate request patterns (Arabic & English)
    const roommatePatterns = [
      /(?:with|roommate|together\s+with|pair\s+with|share\s+with)\s+([A-Za-z][A-Za-z\s]{2,40})/gi,
      /(?:مع|زميل|صديق|شريك\s*الغرفة|أريد\s*أن\s*أكون\s*مع)\s+([\u0600-\u06FF\s]{3,40})/g
    ];
    const roommateRequests: string[] = [];
    const seenNames = new Set<string>();
    
    roommatePatterns.forEach(pattern => {
      const matches = notes.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          const name = match[1].trim();
          const nameLower = name.toLowerCase();
          // Filter: 3-40 characters, not already seen
          if (name.length >= 3 && name.length <= 40 && !seenNames.has(nameLower)) {
            roommateRequests.push(name);
            seenNames.add(nameLower);
          }
        }
      }
    });

    // Health issues keywords
    const healthPatterns = [
      /(?:diabetes|سكري|diabetic)/i,
      /(?:allergy|allergies|حساسية)/i,
      /(?:asthma|astmatic|ربو)/i,
      /(?:heart|قلب|cardiac)/i,
      /(?:medical|طبي|health|صحة)/i,
      /(?:medication|دواء|علاج)/i,
      /(?:condition|حالة)/i,
      /(?:illness|disease|مرض)/i,
      /(?:chronic|مزمن)/i
    ];
    const healthIssues: string[] = [];
    const seenHealth = new Set<string>();
    healthPatterns.forEach(pattern => {
      const match = notes.match(pattern);
      if (match && !seenHealth.has(match[0].toLowerCase())) {
        healthIssues.push(match[0]);
        seenHealth.add(match[0].toLowerCase());
      }
    });

    // Accessibility flags
    const wheelchair = /(?:wheelchair|كرسي\s*متحرك|wheel\s*chair)/i.test(notes);
    const elderly = /(?:elderly|old|senior|aged|كبير\s*السن|مسن|عجوز)/i.test(notes);
    const nearBathroom = /(?:(?:near|close\s*to|nearby)\s*bathroom|bathroom\s*nearby|قريب\s*من\s*الحمام|بجانب\s*الحمام)/i.test(notes);
    const nearElevator = /(?:(?:near|close\s*to|nearby|need|needs)\s*(?:elevator|lift)|elevator\s*(?:access|nearby)|lift\s*(?:access|nearby)|قرب\s*المصعد|يحتاج\s*مصعد)/i.test(notes);
    const accessibility = wheelchair || elderly || nearBathroom || nearElevator || 
                         /(?:accessible|إمكانية\s*الوصول|special\s*needs|احتياجات\s*خاصة|ذوي\s*الاحتياجات\s*الخاصة)/i.test(notes);

    // Family indicators - use direct Arabic text and Unicode ranges
    const family = /(?:family|wife|husband|kids|children|عائل|أسر|زوج|أطفال)/iu.test(notes);

    // No preference indicators
    const noPreference = /(?:no\s*preference|لا\s*يوجد|none|any\s*room|أي\s*غرفة|لا\s*توجد\s*ملاحظات|doesn'?t\s*matter|does\s*not\s*matter)/i.test(notes);

    // Collect unclassified content
    const other: string[] = [];
    if (!roommateRequests.length && !healthIssues.length && !accessibility && !family && !noPreference) {
      // If nothing was classified, put the whole note in "other"
      other.push(notes);
    }

    return {
      roommateRequests,
      healthIssues,
      accessibility,
      wheelchair,
      elderly,
      nearBathroom,
      nearElevator,
      family,
      noPreference,
      other,
      raw: notes
    };
  }

  /**
   * Create empty classification result
   */
  private createEmptyResult(raw: string): ClassifiedNotes {
    return {
      roommateRequests: [],
      healthIssues: [],
      accessibility: false,
      wheelchair: false,
      elderly: false,
      nearBathroom: false,
      nearElevator: false,
      family: false,
      noPreference: true, // Empty notes = no preference
      other: [],
      raw
    };
  }

  /**
   * Check if AI classification is available
   */
  isAIAvailable(): boolean {
    return this.openai !== null && this.config.useAI === true;
  }

  /**
   * Get current configuration
   */
  getConfig(): ClassifierConfig {
    return { ...this.config };
  }

  /**
   * Batch classify multiple notes
   * Processes all notes and returns array of results
   */
  async classifyBatch(notes: (string | null | undefined)[]): Promise<ClassifiedNotes[]> {
    return Promise.all(notes.map(note => this.classify(note)));
  }
}

/**
 * Create a default classifier instance
 * Uses AI if OPENAI_API_KEY is available, otherwise uses keyword-based classification
 */
export function createDefaultClassifier(): RoomingNotesClassifier {
  return new RoomingNotesClassifier({
    useAI: Boolean(process.env.OPENAI_API_KEY),
    fallbackToKeywords: true
  });
}
