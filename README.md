# Reave - Voice Chat Website

A modern website with integrated Vapi voice chat functionality, allowing visitors to interact with an AI assistant through voice commands.

## 🎤 Voice Chat Feature

This website includes a voice chat button powered by [Vapi](https://vapi.ai) that allows visitors to speak their needs directly. The button appears as a floating action button in the bottom-right corner of the page.

### Setup Instructions

1. **Create a Vapi Account**
   - Sign up at [https://vapi.ai](https://vapi.ai)
   - Create a new assistant in your dashboard
   - Configure your assistant's voice, personality, and capabilities

2. **Get Your API Credentials**
   - Navigate to your profile in the Vapi dashboard
   - Copy your **Public Key** from the API keys section
   - Copy your **Assistant ID** from your assistant settings

3. **Configure Environment Variables**
   - Create a `.env` file in the root directory
   - Add the following variables:
     ```
     PUBLIC_VAPI_PUBLIC_KEY=your_vapi_public_key_here
     PUBLIC_VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
     ```
   - Replace the placeholder values with your actual credentials

4. **Start the Development Server**
   ```sh
   npm run dev
   ```
   - The voice chat button will appear on your website
   - Click it to start a voice conversation with your AI assistant

### Customization

You can customize the voice chat button by modifying `src/components/VoiceChatButton.astro`:
- Change the button position (bottom-right, bottom-left, top-right, top-left)
- Adjust colors and styling
- Modify the button size and animations

Example:
```astro
<VoiceChatButton position="bottom-left" />
```

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
