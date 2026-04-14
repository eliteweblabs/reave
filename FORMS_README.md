# JSON-Driven Conversational Forms

Reave uses a JSON-driven system to convert any form (including PDFs with dozens of fields) into beautiful conversational interfaces.

## Quick Start

1. **Create a form definition** at `public/forms/your-form.json`
2. **Access it** at `https://reave.app/form/your-form`

That's it! The system automatically creates a conversational UI.

## Form Definition Format

```json
{
  "title": "Your Form Title",
  "description": "Optional description",
  "fields": [
    {
      "tag": "input",
      "type": "text",
      "name": "fieldName",
      "required": true,
      "cf-questions": "What's your name?"
    }
  ],
  "submitEndpoint": "/api/forms/submit",
  "onComplete": {
    "message": "Thanks for submitting!",
    "redirect": "/thank-you"
  }
}
```

## Supported Field Types

### Text Input
```json
{
  "tag": "input",
  "type": "text",
  "name": "name",
  "required": true,
  "cf-questions": "What's your name?"
}
```

### Email
```json
{
  "tag": "input",
  "type": "email",
  "name": "email",
  "required": true,
  "cf-questions": "What's your email?"
}
```

### Phone
```json
{
  "tag": "input",
  "type": "tel",
  "name": "phone",
  "required": true,
  "cf-questions": "What's your phone number?"
}
```

### Select (Dropdown / Multiple Choice)
```json
{
  "tag": "select",
  "name": "purpose",
  "required": true,
  "cf-questions": "What brings you here?",
  "options": [
    { "value": "consultation", "label": "Consultation" },
    { "value": "project", "label": "Project Inquiry" }
  ]
}
```

### Textarea (Long Text)
```json
{
  "tag": "textarea",
  "name": "description",
  "required": true,
  "cf-questions": "Please describe your project."
}
```

### Number
```json
{
  "tag": "input",
  "type": "number",
  "name": "budget",
  "required": true,
  "cf-questions": "What's your budget?"
}
```

### Date
```json
{
  "tag": "input",
  "type": "date",
  "name": "startDate",
  "required": true,
  "cf-questions": "When would you like to start?"
}
```

## Advanced Features

### Multiple Questions in Sequence
Use `&&` to chain multiple questions before the input:

```json
{
  "cf-questions": "Hi there!&&Let's get started.&&What's your name?"
}
```

### Optional Fields
Omit `required` or set it to `false`:

```json
{
  "tag": "input",
  "type": "text",
  "name": "middleName",
  "required": false,
  "cf-questions": "Middle name? (optional)"
}
```

### Validation Patterns
Add regex patterns for validation:

```json
{
  "tag": "input",
  "type": "text",
  "name": "zipcode",
  "pattern": "^[0-9]{5}$",
  "cf-questions": "What's your ZIP code?"
}
```

## Converting PDFs to Forms

When you have a PDF with dozens of fields:

1. Extract field names and types from the PDF
2. Create a JSON file with all fields
3. Map each PDF field to a conversational question

Example: A 50-field intake PDF becomes:

```json
{
  "title": "Client Intake Form",
  "fields": [
    // ... 50 field definitions
  ]
}
```

The system handles everything automatically!

## Examples

- **Scheduling:** `/form/schedule` (simple 3-field form)
- **Intake:** `/form/intake` (complex 10-field form)

## API Integration

Forms submit to your specified endpoint:

```json
{
  "submitEndpoint": "/api/forms/submit"
}
```

The endpoint receives all form data as JSON:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "purpose": "consultation"
}
```

## Styling

The conversational UI uses Reave's brand colors (purple/pink gradient) and is fully responsive. All styling is automatic - you just define the fields!
