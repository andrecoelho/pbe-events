// The YAML questions file (docs/QUESTIONS_IMPORT_API.md): its types and validation.

// Types for the YAML import
export interface LanguageDefinition {
  code: string;
  name: string;
}

export interface QuestionTranslation {
  lang: string;
  prompt: string;
  answer: string | boolean; // boolean for TF questions, string for others
  clarification?: string; // Required for TF questions when answer is false
}

export interface QuestionImport {
  type: 'PG' | 'PS' | 'TF' | 'FB';
  maxPoints: number;
  seconds: number;
  translations: QuestionTranslation[];
}

export interface QuestionsFileFormat {
  languages: LanguageDefinition[];
  questions: QuestionImport[];
}

/**
 * Validates the YAML structure and data
 */
export function validateQuestionsData(data: unknown): {
  valid: boolean;
  error?: string;
  languages?: LanguageDefinition[];
  questions?: QuestionImport[];
} {
  // Check if data is an object with languages and questions
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'YAML file must contain an object with languages and questions' };
  }

  const fileData = data as any;

  // Validate languages array
  if (!Array.isArray(fileData.languages)) {
    return { valid: false, error: 'YAML file must contain a languages array' };
  }

  if (fileData.languages.length === 0) {
    return { valid: false, error: 'At least one language must be defined' };
  }

  const languages: LanguageDefinition[] = [];
  const validLanguageCodes = new Set<string>();

  // Validate each language
  for (let i = 0; i < fileData.languages.length; i++) {
    const lang = fileData.languages[i];

    if (typeof lang !== 'object' || lang === null) {
      return { valid: false, error: `Language ${i + 1}: Must be an object` };
    }

    // Validate code
    if (typeof lang.code !== 'string' || lang.code.trim() === '') {
      return { valid: false, error: `Language ${i + 1}: code must be a non-empty string` };
    }

    // Validate name
    if (typeof lang.name !== 'string' || lang.name.trim() === '') {
      return { valid: false, error: `Language ${i + 1}: name must be a non-empty string` };
    }

    const code = lang.code.trim();

    // Check for duplicate language codes
    if (validLanguageCodes.has(code)) {
      return { valid: false, error: `Language ${i + 1}: Duplicate language code "${code}"` };
    }

    validLanguageCodes.add(code);
    languages.push({ code, name: lang.name.trim() });
  }

  // Check if questions is an array
  if (!Array.isArray(fileData.questions)) {
    return { valid: false, error: 'YAML file must contain a questions array' };
  }

  const questions: QuestionImport[] = [];
  const validTypes = new Set(['PG', 'PS', 'TF', 'FB']);

  for (let i = 0; i < fileData.questions.length; i++) {
    const q = fileData.questions[i];

    // Validate question structure
    if (typeof q !== 'object' || q === null) {
      return { valid: false, error: `Question ${i + 1}: Must be an object` };
    }

    // Helper to get a prompt for error messages (use first translation if available)
    const getPromptHint = (): string => {
      if (Array.isArray(q.translations) && q.translations.length > 0) {
        const firstTranslation = q.translations[0];

        if (firstTranslation && typeof firstTranslation.prompt === 'string') {
          const prompt = firstTranslation.prompt.trim();
          const maxLength = 60;

          return prompt.length > maxLength ? ` ("${prompt.substring(0, maxLength)}...")` : ` ("${prompt}")`;
        }
      }

      return '';
    };

    // Validate type
    if (!validTypes.has(q.type)) {
      return {
        valid: false,
        error: `Question ${i + 1}${getPromptHint()}: Invalid type "${q.type}". Must be PG, PS, TF, or FB`
      };
    }

    // Validate maxPoints
    if (typeof q.maxPoints !== 'number' || q.maxPoints <= 0) {
      return {
        valid: false,
        error: `Question ${i + 1}${getPromptHint()}: maxPoints must be a positive number`
      };
    }

    // Validate seconds
    if (typeof q.seconds !== 'number' || q.seconds <= 0) {
      return {
        valid: false,
        error: `Question ${i + 1}${getPromptHint()}: seconds must be a positive number`
      };
    }

    // Validate info array
    if (!Array.isArray(q.translations) || q.translations.length === 0) {
      return {
        valid: false,
        error: `Question ${i + 1}: Must have at least one translation entry`
      };
    }

    // Track which languages have translations for this question
    const questionLanguages = new Set<string>();

    // Validate each translation entry
    for (let j = 0; j < q.translations.length; j++) {
      const translation = q.translations[j];

      if (typeof translation !== 'object' || translation === null) {
        return {
          valid: false,
          error: `Question ${i + 1}${getPromptHint()}, Translation ${j + 1}: Must be an object`
        };
      }

      // Validate language code
      if (typeof translation.lang !== 'string' || !validLanguageCodes.has(translation.lang)) {
        return {
          valid: false,
          error: `Question ${i + 1}${getPromptHint()}, Translation ${j + 1}: Invalid or unknown language code "${
            translation.lang
          }"`
        };
      }

      // Check for duplicate language in this question
      if (questionLanguages.has(translation.lang)) {
        return {
          valid: false,
          error: `Question ${i + 1}${getPromptHint()}: Duplicate translation for language "${translation.lang}"`
        };
      }

      questionLanguages.add(translation.lang);

      // Validate prompt
      if (typeof translation.prompt !== 'string' || translation.prompt.trim() === '') {
        return {
          valid: false,
          error: `Question ${i + 1}${getPromptHint()}, Translation ${j + 1}: prompt must be a non-empty string`
        };
      }

      // Validate answer
      if (q.type === 'TF') {
        // For True/False questions, answer must be a boolean
        if (typeof translation.answer !== 'boolean') {
          return {
            valid: false,
            error: `Question ${i + 1}${getPromptHint()}, Translation ${
              j + 1
            }: True/False answer must be a boolean (true or false, not a string)`
          };
        }
      } else {
        // For other question types, answer must be a non-empty string
        if (typeof translation.answer !== 'string' || translation.answer.trim() === '') {
          return {
            valid: false,
            error: `Question ${i + 1}${getPromptHint()}, Translation ${j + 1}: answer must be a non-empty string`
          };
        }
      }
    }

    // Validate that all languages are present in this question
    const missingLanguages = Array.from(validLanguageCodes).filter((code) => !questionLanguages.has(code));

    if (missingLanguages.length > 0) {
      return {
        valid: false,
        error: `Question ${i + 1}${getPromptHint()}: Missing translations for language(s): ${missingLanguages.join(
          ', '
        )}`
      };
    }

    questions.push(q as QuestionImport);
  }

  return { valid: true, languages, questions };
}

/**
 * Converts an event name to a safe filename format
 */
export function toSafeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .slice(0, 50); // Limit length to 50 characters
}
