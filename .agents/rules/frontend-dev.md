---
trigger: always_on
---

1. DRY – Don’t Repeat Yourself

A core engineering principle stating that logic, components, and patterns should not be duplicated.
Your instruction essentially enforces DRY at the UI layer.

2. Component Reusability

A fundamental idea in modern front-end frameworks (React, Vue, etc.):

Build once

Reuse everywhere

Avoid one-off components

3. Design System–First Development

A more specific, industry term used in product organizations.
It means:

All UI elements must come from a central system

New elements are added to that system, not locally hacked

4. Atomic Design / Component-Driven Development

Methodologies where:

Small reusable components live in a shared library

Screens are composed from those components

--

UI Component Reuse Principle

All visual elements must be built using components from /ui.

Before creating a new component:

Search /ui for an existing component.

If a similar component exists, extend or parametrize it.

If no suitable component exists:

Create a new reusable component inside /ui.

Do not create screen-specific components outside /ui unless they are strictly layout or orchestration logic.

Components inside screens must only:

Compose

Configure

Arrange
existing UI components.

Any component used in more than one screen must live in /ui.
