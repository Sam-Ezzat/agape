/**
 * Search candidate representing a possible variation of a name
 */
export interface SearchCandidate {
  original: string;
  normalized: string;
  variations: string[];
  language: string;
}
