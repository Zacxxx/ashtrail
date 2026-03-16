# Dev-Tools Helper Feature

## Overview

The Dev-Tools Helper is an AI-powered contextual assistant integrated into the Ashtrail Dev-Tools. It provides real-time help and guidance to users based on their current location in the application.

## Features

- **Contextual Awareness**: Automatically detects which tool the user is currently using
- **Tutorial Integration**: Has access to the complete `devtoolstutorial.md` documentation
- **Intelligent Code Search**: When tutorial info is insufficient, automatically searches relevant source code files
- **Two-Pass Analysis**: First checks if tutorial has enough info, then searches code if needed
- **Session-Based**: Conversations are temporary and reset when the modal is closed
- **Real-Time Assistance**: Provides instant answers to questions about features, workflows, and troubleshooting
- **Markdown Support**: Full markdown rendering with syntax highlighting for code blocks
- **Enhanced UI**: Modern dark theme (#1e1e1e) with gradient send button and improved readability

## User Interface

### Access
- Click the **?** icon in the top-right header (next to Generation Gallery)
- The icon is available on all pages except the World Generator

### Modal Features
- **Backdrop blur**: Focuses attention on the conversation
- **Current tool indicator**: Shows which tool you're currently in
- **Chat interface**: Classic message-based UI
- **Keyboard shortcuts**: Press Enter to send, Shift+Enter for new line
- **Close options**: Click X button or click outside the modal

## Technical Implementation

### Frontend
- **Component**: `apps/dev-tools/src/components/HelperModal.tsx`
- **Integration**: Added to `GlobalHeader.tsx`
- **State Management**: Local React state (session-based)
- **Markdown Rendering**: `react-markdown` with `remark-gfm` for GitHub Flavored Markdown
- **Styling**: Dark theme (#1e1e1e background, #2a2a2a for messages)

### Backend
- **Endpoint**: `POST /api/helper/chat`
- **Handler**: `helper_chat_handler` in `apps/dev-tools/backend/src/main.rs`
- **AI Model**: Uses Gemini 2.5 Flash via the existing `gemini::generate_text_with_options` function
- **Context Sources**:
  - Primary: `devtoolstutorial.md` content
  - Secondary: Relevant source code files (when needed)
- **Intelligent Search**: 
  - `gather_code_context()`: Maps current tool to relevant source files
  - `extract_relevant_section()`: Extracts code sections matching keywords
  - Limits context to 2000 chars per file to avoid token overflow

### Request Payload
```typescript
{
  prompt: string;           // User's question
  current_tool?: string;    // e.g., "World Generator", "Asset Generator"
  route?: string;           // Current route path
}
```

### Response
```typescript
{
  text: string;  // AI-generated response
}
```

## How It Works

### Two-Pass Intelligence System

1. **Analysis Pass** (Temperature: 0.3 for precision)
   - AI analyzes the user's question
   - Checks if tutorial content is sufficient
   - If not, identifies 2-3 relevant keywords for code search

2. **Code Search** (if needed)
   - Maps current tool to relevant source files:
     - World Generator → `WorldgenPage.tsx`, `generator.rs`, `worldgen_pipeline.rs`
     - Asset Generator → `AssetGeneratorPage.tsx`, `gemini.rs`
     - Game Master → `GameMasterPage.tsx`, `cms.rs`
     - Gallery → `GalleryPage.tsx`
     - Gameplay Engine → `GameplayEnginePage.tsx`, `game_rules.rs`, `combat_engine/mod.rs`
     - Character Builder → `CharacterBuilderPage.tsx`, `ai_characters.rs`
     - History → `HistoryPage.tsx`, `hierarchy.rs`
     - Ecology → `EcologyPage.tsx`, `ecology.rs`
     - Quests → `QuestsPage.tsx`, `ai_quests.rs`, `quest_ai.rs`
   - Reads up to 3 relevant files
   - Extracts sections matching keywords (with 10-line context window)
   - Limits to 2000 chars per file

3. **Response Generation** (Temperature: 0.7 for natural language)
   - Combines tutorial + code context
   - Generates helpful, contextual response
   - Formats code examples with markdown

### Example Flow

**User asks**: "How does the province refinement API work?"

1. **Analysis**: Tutorial doesn't have API details → `NEED_CODE_SEARCH: province, refinement, api`
2. **Code Search**: Reads `worldgen_pipeline.rs`, extracts relevant functions
3. **Response**: Explains API with actual code examples from source

## Usage Examples

### Example 1: Getting Started
**User**: "How do I create my first world?"
**Helper**: Provides step-by-step instructions from the World Generator section of the tutorial

### Example 2: Troubleshooting
**User**: "Why can't I generate quests?"
**Helper**: Explains that an active world must be selected and guides through the prerequisite steps

### Example 3: Workflow Guidance
**User**: "What should I do after generating a planet?"
**Helper**: Suggests the recommended pipeline: Game Master → History → Ecology → etc.

## Development Notes

### Adding Context Sources
To enhance the helper's knowledge, you can:
1. Add more documentation files to the backend
2. Include real-time data from the active world
3. Track user actions for better contextual awareness

### Customizing Behavior
- Adjust temperature in `helper_chat_handler` (currently 0.7)
- Modify the system prompt to change the assistant's personality
- Add conversation history persistence if needed

### Performance Considerations
- Tutorial file is read on every request (consider caching for production)
- Each message is an independent API call to Gemini
- No conversation history is maintained (stateless)

## Future Enhancements

Potential improvements:
- [ ] Conversation history within session
- [ ] Suggested questions based on current tool
- [ ] Direct action buttons (e.g., "Take me to World Generator")
- [ ] Code snippet examples
- [ ] Video tutorial links
- [ ] Multi-language support
- [ ] Voice input/output
- [ ] Integration with Job Center for debugging

## Troubleshooting

### Helper not responding
- Check that `GEMINI_API_KEY` is set in `.env.local`
- Verify backend is running on port 8787
- Check browser console for network errors

### Incorrect or outdated information
- Ensure `devtoolstutorial.md` is up to date
- Verify the file path in `helper_chat_handler` is correct

### Modal not opening
- Check browser console for React errors
- Verify `HelperModal` is imported in `GlobalHeader.tsx`
