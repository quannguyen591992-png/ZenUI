# Editor Wireframe and Interaction Contract

> Sơ đồ trong tài liệu này dùng ASCII בלבד.

## Desktop editor

```text
+--------------------------------------------------------------------------------------+
| Brand | Project | Saving... | Undo | Redo | Desktop Tablet Mobile | Preview         |
|                                                            Export | Share | Deploy  |
+--------------------+------------------------------------------+----------------------+
| COMPONENTS / LAYERS|                                          | DESIGN / AI          |
|                    |                                          |                      |
| Layout             |                                          | Content              |
| [Section]          |                                          | Layout               |
| [Container]        |                  CANVAS                  | Typography           |
| [Stack]            |                                          | Appearance           |
|                    |          hover / select / drop           | Responsive           |
| Content            |                                          |                      |
| [Heading]          |                                          +----------------------+
| [Paragraph]        |                                          | AI scope             |
| [Image]            |                                          | (o) selection        |
| [Button]           |                                          | ( ) whole page       |
|                    |                                          | [ prompt ..........] |
+--------------------+                                          | [ Generate / Apply ] |
| LAYERS             |                                          |                      |
| Page               |                                          |                      |
| +- Section         |                                          |                      |
|    +- Container    |                                          |                      |
+--------------------+------------------------------------------+----------------------+
| Save: saved | AI: idle | Document: v12 | Preview: ready | Deploy: not deployed    |
+--------------------------------------------------------------------------------------+
```

## Narrow editor

```text
+--------------------------------------------------+
| Project | Undo Redo | Mobile | More              |
+--------------------------------------------------+
|                                                  |
|                    CANVAS                        |
|                                                  |
+--------------------------------------------------+
| [Components] [Layers] [Design] [AI]              |
+--------------------------------------------------+
| Active bottom sheet                              |
+--------------------------------------------------+
```

## Selection states

```text
Idle -> Hovered -> Selected -> Editing
  ^         |          |          |
  +---------+----------+----------+
       Escape / click outside / command complete
```

- Hovered: non-blocking outline and component label.
- Selected: persistent outline, Layers focus and Inspector binding.
- Editing: inline text field owns focus; drag is disabled for that node.
- Keyboard focus must provide the same selection actions as pointer input.

## Drag states

```text
Palette/Layer item
       |
       v
   Dragging ----> Candidate target ----> Valid drop ----> Command queued
                         |
                         +-------------> Invalid drop -> Explain rejection
```

- Valid drop shows an insertion line and target container highlight.
- Invalid drop uses both color and an icon/text reason.
- Escape cancels drag without creating a command.
- Keyboard alternative: copy/add action, choose parent and position, confirm.

## Status contract

| Surface | States |
|---|---|
| Document | loading, ready, conflict, invalid |
| Autosave | idle, saving, saved, offline, failed |
| AI run | queued, generating, validating, repairing, completed, failed |
| Preview | loading, ready, failed |
| Export | idle, preparing, ready, failed |
| Share | none, active, disabled |
| Deploy | disconnected, queued, uploading, building, ready, failed |

## Phase 1 interaction boundary

Phase 1 implements only:

1. Palette and eight prototype components.
2. Canvas selection and block drop/reorder.
3. Text/color Inspector editing.
4. Undo/redo.
5. Local persistence/reload.
6. Standalone HTML export.

AI panel, server persistence, share and deployment remain visible only as documented future surfaces until their phases.
