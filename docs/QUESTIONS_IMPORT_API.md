# Questions Import/Export API

## Endpoints

### Import Questions

**POST** `/api/events/:eventId/questions/import`

Imports questions from a YAML file for a specific event. This endpoint replaces all existing questions for the event.

### Export Questions

**GET** `/api/events/:eventId/questions/export`

Exports all questions for a specific event as a YAML file. The exported file can be used for backup or to import into another event.

## Requirements

- User must be authenticated (have a valid session)
- User must have `owner` or `admin` role for the event
- File must be a valid YAML file (.yaml or .yml extension)
- File must include a `languages` section defining all languages used in questions

## Request Format

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file` (File): YAML file containing languages and questions

## YAML File Format

The file must contain an object with two main sections: `languages` and `questions`. See `questions-example.yaml` for a complete example.

### Root Structure

```yaml
languages:
  - code: en
    name: English
  - code: es
    name: Spanish

questions:
  - type: PS
    maxPoints: 10
    # ... question details
```

### Languages Section

The `languages` array defines all languages that will be available for the event. **This section overrides all existing languages for the event.**

```yaml
languages:
  - code: en        # Required: Language code (e.g., en, es, fr)
    name: English   # Required: Language display name
  - code: es
    name: Spanish
```

**Language Object:**
- `code`: String - Unique language code (e.g., "en", "es", "fr")
- `name`: String - Display name for the language (e.g., "English", "Spanish")

### Questions Section

An array of question objects.

### Question Object Structure

```yaml
- type: PS              # Required: Question type (PS, PW, TF, or FB)
  maxPoints: 10         # Required: Maximum points (positive number)
  seconds: 30           # Required: Time limit in seconds (positive number)
  info:                 # Required: Array of question info (at least one)
    - lang: en          # Required: Language code (must be defined in languages section)
      body: Question?   # Required: Question text (non-empty string, supports multi-line)
      answer: Answer    # Required: Answer text (non-empty string)
```

**Note:** Question bodies support multi-line text using YAML's `|` syntax:

```yaml
- type: PS
  maxPoints: 10
  seconds: 30
  info:
    - lang: en
      body: |
        This is a multi-line question.

        You can include multiple paragraphs or instructions.
      answer: Your answer here
```

### Question Types

- **PS** (Points Specific): Fixed points awarded for correct answer
- **PW** (Points per Word): Points awarded per word in the answer
- **TF** (True/False): Answer must be "true" or "false" (case-insensitive)
- **FB** (Fill in the Blank): Answer fills in the blank(s) in the question

### Multi-language Support

Each question can have multiple language versions by adding more entries to the `info` array:

```yaml
- type: PS
  maxPoints: 10
  seconds: 30
  info:
    - lang: en
      body: What is the capital of France?
      answer: Paris
    - lang: es
      body: ¿Cuál es la capital de Francia?
      answer: París
    - lang: fr
      body: Quelle est la capitale de la France?
      answer: Paris
```

## Response Format

### Success Response

**Status:** 200 OK

```json
{
  "ok": true,
  "message": "Questions and languages imported successfully",
  "languageCount": 2,
  "questionCount": 7
}
```

### Error Responses

**Status:** 400 Bad Request

```json
{
  "error": "No file provided"
}
```

```json
{
  "error": "File must be a YAML file (.yaml or .yml)"
}
```

```json
{
  "error": "Invalid YAML format: unexpected token"
}
```

```json
{
  "error": "YAML file must contain an object with languages and questions"
}
```

```json
{
  "error": "At least one language must be defined"
}
```

```json
{
  "error": "Language 2: Duplicate language code \"en\""
}
```

```json
{
  "error": "Question 3: Invalid type \"XX\". Must be PS, PW, TF, or FB"
}
```

```json
{
  "error": "Question 2, Info 1: Invalid or unknown language code \"de\""
}
```

**Status:** 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

**Status:** 403 Forbidden

```json
{
  "error": "Forbidden"
}
```

**Status:** 500 Internal Server Error

```json
{
  "error": "Failed to import questions"
}
```

## Validation Rules

1. **File Type:** Must be .yaml or .yml
2. **YAML Structure:** Must be a valid YAML object with `languages` and `questions` properties
3. **Languages Section:** Must be a non-empty array
4. **Language Code:** Must be a non-empty string and unique within the file
5. **Language Name:** Must be a non-empty string
6. **Questions Section:** Must be an array
7. **Question Type:** Must be one of: PS, PW, TF, FB
8. **Max Points:** Must be a positive number
9. **Seconds:** Must be a positive number
10. **Info Array:** Must have at least one entry
11. **Language Code in Question:** Must match a language code defined in the languages section
12. **Question Body:** Must be a non-empty string
13. **Answer:** Must be a non-empty string
14. **True/False Answers:** For TF type, answer must be "true" or "false"

## Example Usage

### Using cURL

```bash
curl -X POST \
  -H "Cookie: sessionId=your-session-id" \
  -F "file=@questions.yaml" \
  http://localhost:3000/api/events/123e4567-e89b-12d3-a456-426614174000/questions/import
```

### Using JavaScript Fetch API

```javascript
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const formData = new FormData();
formData.append('file', file);

const response = await fetch(`/api/events/${eventId}/questions/import`, {
  method: 'POST',
  body: formData
});

const result = await response.json();

if (result.ok) {
  console.log(`Imported ${result.languageCount} languages and ${result.questionCount} questions`);
} else {
  console.error(`Error: ${result.error}`);
}
```

## Export Endpoint Details

### Requirements (Export)

- User must be authenticated (have a valid session)
- User must have `owner` or `admin` role for the event
- Event must have at least one question

### Response Format (Export)

**Success Response**

**Status:** 200 OK

**Content-Type:** `application/x-yaml`

**Content-Disposition:** `attachment; filename="questions-{event-name}.yaml"`

Returns a YAML file in the same format used for import. The file will be automatically downloaded by the browser. The filename is based on the event name, converted to a safe filename format (lowercase, alphanumeric with hyphens, max 50 characters).

**Error Responses**

**Status:** 400 Bad Request
```json
{
  "error": "Nothing to export - event has no languages or questions configured"
}
```

**Status:** 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

**Status:** 403 Forbidden
```json
{
  "error": "Forbidden"
}
```

**Status:** 500 Internal Server Error
```json
{
  "error": "Failed to generate YAML file"
}
```

### Example Usage (Export)

#### Using cURL

```bash
curl -X GET \
  -H "Cookie: sessionId=your-session-id" \
  -o questions.yaml \
  http://localhost:3000/api/events/123e4567-e89b-12d3-a456-426614174000/questions/export
```

#### Using JavaScript Fetch API

```javascript
const response = await fetch(`/api/events/${eventId}/questions/export`);

if (response.ok) {
  // Create a blob from the response
  const blob = await response.blob();

  // Create download link
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Filename is automatically set from Content-Disposition header
  a.download = ''; // Browser will use the filename from the header
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
} else {
  const error = await response.json();
  console.error(`Error: ${error.error}`);
}
```

## Important Notes

- **Destructive Operation (Import):** The import endpoint deletes all existing questions AND languages for the event before importing new ones
- **Language Override (Import):** The languages section in the YAML file completely replaces all event languages
- **Transaction Safety (Import):** The import operation is wrapped in a database transaction, so either everything is imported or nothing is (atomic operation)
- **Cascade Deletion:** Deleting languages will cascade delete related questions and question info due to foreign key constraints
- **No Language Prerequisite:** You don't need to set up languages beforehand - they are defined in the import file
- **File Size (Import):** Bun handles multipart form data efficiently, but consider reasonable file sizes for browser uploads
- **Export Format:** The export endpoint generates YAML in the exact same format as the import endpoint expects, including languages
- **Backup Use Case:** Export can be used to create complete backups of questions and languages before making changes
